import { ChatAnthropic } from '@langchain/anthropic'
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import type { Env, Logger } from '@bookingcare/shared'
import type { BookingDraftStore } from '../booking/drafts.js'
import type { EntityCatalog } from '../retrieval/catalog.js'
import type { RetrievalStore } from '../retrieval/store.js'
import { appendTurn, buildModelMessages, DEFAULT_KEEP_TURNS } from './history.js'
import { loadSystemPrompt } from './prompts.js'
import type { SessionStore } from './session.js'
import { createAgentTools, type ToolContext } from './tools.js'
import type { ChatEvent, ChatUsageSummary } from './types.js'

/** Tối đa 2 vòng gọi tool cho mỗi lượt trò chuyện. */
export const MAX_TOOL_ROUNDS = 2

/** Ràng buộc output của CLAUDE.md. */
export const MAX_OUTPUT_TOKENS = 500

type ToolCallLike = {
  name: string
  args: Record<string, unknown>
  id: string
}

type AssistantStateView = {
  messages: BaseMessage[]
  toolRounds: number
  toolsUsed: string[]
}

function concatMessages(current: BaseMessage[], update: BaseMessage[]): BaseMessage[] {
  return current.concat(update as unknown as BaseMessage[])
}

function concatStrings(current: string[], update: string[]): string[] {
  return current.concat(update as unknown as string[])
}

const AssistantState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: concatMessages,
    default: () => [],
  }),
  toolRounds: Annotation<number>({
    reducer: (current: number, update: number) =>
      typeof update === 'number' ? update : current,
    default: () => 0,
  }),
  toolsUsed: Annotation<string[]>({
    reducer: concatStrings,
    default: () => [],
  }),
})

function toolCallsOf(message: BaseMessage | undefined): ToolCallLike[] {
  if (message === undefined) return []
  const calls = (message as unknown as { tool_calls?: ToolCallLike[] }).tool_calls
  return Array.isArray(calls) ? calls : []
}

function isBaseMessage(value: unknown): value is BaseMessage {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return 'content' in record && typeof record.getType === 'function'
}

function messageText(message: BaseMessage): string {
  const content = message.content
  if (typeof content === 'string') return content

  return content
    .map((part) => {
      if (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string') {
        return part.text
      }
      return ''
    })
    .join('')
}

/** Rút token từ chunk của `streamMode: 'messages'` (hỗ trợ nhiều shape khác nhau). */
function extractMessages(chunk: unknown): BaseMessage[] {
  if (Array.isArray(chunk)) {
    const first = chunk[0]
    return isBaseMessage(first) ? [first] : []
  }

  if (typeof chunk !== 'object' || chunk === null) return []

  const record = chunk as Record<string, unknown>
  const messages = record.messages
  if (Array.isArray(messages)) {
    return messages.filter(isBaseMessage)
  }
  if (isBaseMessage(record)) {
    return [record]
  }
  return []
}

/** Rút state sau mỗi node (chunk có `toolRounds` để phân biệt với wrapper messages). */
function extractState(chunk: unknown): AssistantStateView | null {
  if (typeof chunk !== 'object' || chunk === null) return null

  const record = chunk as Record<string, unknown>
  const candidate = (
    typeof record.values === 'object' && record.values !== null ? record.values : record
  ) as Record<string, unknown>

  if (typeof candidate.toolRounds !== 'number') return null

  const messages = candidate.messages
  if (!Array.isArray(messages)) return null

  const toolsUsed = candidate.toolsUsed
  return {
    messages: messages.filter(isBaseMessage),
    toolRounds: candidate.toolRounds,
    toolsUsed: Array.isArray(toolsUsed) ? toolsUsed.filter((v): v is string => typeof v === 'string') : [],
  }
}

function lastAssistantText(messages: BaseMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message instanceof AIMessage && toolCallsOf(message).length === 0) {
      return messageText(message)
    }
  }
  return null
}

function sumUsage(messages: BaseMessage[]): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0
  let outputTokens = 0

  for (const message of messages) {
    if (!(message instanceof AIMessage)) continue
    const usage = (
      message as unknown as {
        usage_metadata?: { input_tokens?: number; output_tokens?: number }
      }
    ).usage_metadata
    inputTokens += usage?.input_tokens ?? 0
    outputTokens += usage?.output_tokens ?? 0
  }

  return { inputTokens, outputTokens }
}

/** Tạo model trợ lý từ env — không hardcode model id hay API key. */
export function createAssistantModel(env: Env): ChatAnthropic {
  return new ChatAnthropic({
    model: env.ASSISTANT_MODEL,
    apiKey: env.ANTHROPIC_API_KEY,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    // Claude Haiku 5.5 hỗ trợ "effort" thay vì "thinking" (budget_tokens không
    // dùng được vì max_tokens chỉ 500).
    invocationKwargs: { output_config: { effort: env.ASSISTANT_EFFORT } },
  })
}

export function isAssistantConfigured(env: Env): boolean {
  return env.ANTHROPIC_API_KEY.trim() !== ''
}

export type AssistantOptions = {
  store: RetrievalStore
  catalog: EntityCatalog
  drafts: BookingDraftStore
  sessions: SessionStore
  logger: Logger
  model: ChatAnthropic
  /** Số lượt gần nhất giữ nguyên văn trong lịch sử. */
  keepTurns?: number
  maxToolRounds?: number
}

/**
 * Agent hội thoại: LangGraph với vòng lặp tool (tối đa 2 vòng), phát sự kiện
 * streaming cho UI.
 */
export class BookingAssistant {
  private readonly options: AssistantOptions

  constructor(options: AssistantOptions) {
    this.options = options
  }

  async *stream(input: {
    sessionId: string
    message: string
    requestId: string
  }): AsyncGenerator<ChatEvent> {
    const { store, catalog, drafts, sessions, logger, model } = this.options
    const keepTurns = this.options.keepTurns ?? DEFAULT_KEEP_TURNS
    const maxToolRounds = this.options.maxToolRounds ?? MAX_TOOL_ROUNDS

    const session = sessions.get(input.sessionId)
    const ctx: ToolContext = {
      store,
      catalog,
      drafts,
      logger,
      session,
      cards: [],
      bookings: [],
    }

    const tools = createAgentTools(ctx)
    const graph = buildGraph({ model, tools, maxToolRounds })

    const systemPrompt = loadSystemPrompt()
    const messages = buildModelMessages(systemPrompt, session.summary, session.turns)
    messages.push(new HumanMessage(input.message))

    const startedAt = Date.now()
    let answer = ''
    let emittedCards = 0
    let emittedBookings = 0
    let state: AssistantStateView | null = null

    const stream = await graph.stream(
      { messages, toolRounds: 0, toolsUsed: [] },
      { streamMode: ['messages', 'values'] },
    )

    for await (const chunk of stream) {
      for (const message of extractMessages(chunk)) {
        if (!(message instanceof AIMessage)) continue
        const text = messageText(message)
        if (text === '') continue
        answer += text
        yield { type: 'delta', text }
      }

      const nextState = extractState(chunk)
      if (nextState !== null) {
        state = nextState
        const finalAnswer = lastAssistantText(nextState.messages)
        if (finalAnswer !== null && finalAnswer !== answer) {
          answer = finalAnswer
        }
      }

      if (ctx.cards.length > emittedCards) {
        const cards = ctx.cards.slice(emittedCards)
        emittedCards = ctx.cards.length
        yield { type: 'cards', cards }
      }

      if (ctx.bookings.length > emittedBookings) {
        const bookings = ctx.bookings.slice(emittedBookings)
        emittedBookings = ctx.bookings.length
        for (const booking of bookings) {
          yield { type: 'booking', booking }
        }
      }
    }

    // Flush phần chưa phát (trường hợp stream không trả về state).
    if (ctx.cards.length > emittedCards) {
      yield { type: 'cards', cards: ctx.cards.slice(emittedCards) }
    }
    for (const booking of ctx.bookings.slice(emittedBookings)) {
      yield { type: 'booking', booking }
    }

    // Câu trả lời cuối khi không có token nào được stream.
    if (answer.trim() === '') {
      const finalAnswer = state === null ? null : lastAssistantText(state.messages)
      if (finalAnswer !== null && finalAnswer.trim() !== '') {
        answer = finalAnswer
        yield { type: 'delta', text: answer }
      }
    }

    // Cập nhật lịch sử: lượt cũ bị rút gọn vào bản tóm tắt.
    let history = { turns: session.turns, summary: session.summary }
    history = appendTurn(
      history,
      { role: 'user', content: input.message, entities: [] },
      keepTurns,
    )
    history = appendTurn(
      history,
      { role: 'assistant', content: answer, entities: ctx.cards.map((card) => card.title) },
      keepTurns,
    )
    sessions.set(input.sessionId, {
      ...session,
      turns: history.turns,
      summary: history.summary,
    })

    const usage = state === null ? { inputTokens: 0, outputTokens: 0 } : sumUsage(state.messages)
    const summary: ChatUsageSummary = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      durationMs: Date.now() - startedAt,
      toolRounds: state?.toolRounds ?? 0,
      toolsUsed: state?.toolsUsed ?? [],
    }

    logger.info('chat_turn_done', {
      requestId: input.requestId,
      sessionId: input.sessionId,
      durationMs: summary.durationMs,
      inputTokens: summary.inputTokens,
      outputTokens: summary.outputTokens,
      toolRounds: summary.toolRounds,
      toolsUsed: summary.toolsUsed,
    })

    yield { type: 'done', usage: summary }
  }

  /** Gọi không streaming — gom sự kiện thành câu trả lời cuối. */
  async answer(input: {
    sessionId: string
    message: string
    requestId: string
  }): Promise<{ answer: string; usage: ChatUsageSummary }> {
    let answer = ''
    let usage: ChatUsageSummary = {
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
      toolRounds: 0,
      toolsUsed: [],
    }

    for await (const event of this.stream(input)) {
      if (event.type === 'delta') {
        answer += event.text
      } else if (event.type === 'done') {
        usage = event.usage
      }
    }

    return { answer, usage }
  }
}

function buildGraph(options: {
  model: ChatAnthropic
  tools: ReturnType<typeof createAgentTools>
  maxToolRounds: number
}) {
  const modelWithTools = options.model.bindTools(options.tools)
  const toolsByName = new Map(options.tools.map((tool) => [tool.name, tool]))

  return new StateGraph(AssistantState)
    .addNode('agent', async (state) => {
      // Hết ngân sách tool → buộc model trả lời bằng văn bản.
      const exhausted = state.toolRounds >= options.maxToolRounds
      const response = exhausted
        ? await options.model.invoke(state.messages)
        : await modelWithTools.invoke(state.messages)
      return { messages: [response] }
    })
    .addNode('tools', async (state) => {
      const messages: BaseMessage[] = []
      const toolsUsed: string[] = []

      const last = state.messages[state.messages.length - 1]
      for (const call of toolCallsOf(last)) {
        const tool = toolsByName.get(call.name)
        if (tool === undefined) {
          messages.push(
            new ToolMessage({
              content: `Tool không tồn tại: ${call.name}`,
              tool_call_id: call.id,
            }),
          )
          continue
        }

        const output = (await tool.invoke(call.args)) as string
        messages.push(new ToolMessage({ content: output, tool_call_id: call.id }))
        toolsUsed.push(call.name)
      }

      return { messages, toolRounds: state.toolRounds + 1, toolsUsed }
    })
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', (state) => {
      const last = state.messages[state.messages.length - 1]
      if (toolCallsOf(last).length > 0 && state.toolRounds < options.maxToolRounds) {
        return 'tools'
      }
      return END
    })
    .addEdge('tools', 'agent')
    .compile()
}
