import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import {
  buildThinkingConfig,
  estimateTokens,
  type Env,
  type Logger,
} from '@bookingcare/shared'
import type { BookingDraftStore } from '../booking/drafts.js'
import type { EntityCatalog } from '../retrieval/catalog.js'
import type { RetrievalStore } from '../retrieval/store.js'
import { appendTurn, buildModelMessages, DEFAULT_KEEP_TURNS } from './history.js'
import { buildDirectAnswer, detectIntent, findLongestMatch } from './intent.js'
import { buildPreRetrievalBlock, composeSystemPrompt, loadSystemPrompt } from './prompts.js'
import type { ChatSession, SessionStore } from './session.js'
import {
  createAgentTools,
  searchResultToCard,
  type AgentTool,
  type ToolContext,
} from './tools.js'
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

type GeminiModelInput = ConstructorParameters<typeof ChatGoogleGenerativeAI>[0]

/** Tạo model trợ lý từ env — không hardcode model id hay API key. */
export function createAssistantModel(env: Env, modelId?: string): ChatGoogleGenerativeAI {
  const model = modelId ?? env.GEMINI_MODEL
  const thinkingConfig = buildThinkingConfig(model, env, MAX_OUTPUT_TOKENS)

  const options = {
    model,
    apiKey: env.GEMINI_API_KEY,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    // Không retry nội bộ của SDK: lỗi 503/429 sẽ được xử lý bằng chuỗi model
    // dự phòng (chuyển model ngay thay vì chờ backoff dài).
    maxRetries: 0,
    ...(thinkingConfig === undefined ? {} : { thinkingConfig }),
  }

  // Kiểu `thinkingLevel` trong @langchain/google-genai 1.0.3 mới khai báo
  // `LOW | HIGH` (chưa có `MEDIUM`) nên cần cast để gửi được mức medium.
  return new ChatGoogleGenerativeAI(options as unknown as GeminiModelInput)
}

export function isAssistantConfigured(env: Env): boolean {
  return env.GEMINI_API_KEY.trim() !== ''
}

/**
 * Gọi model, thử lần lượt qua chuỗi model dự phòng khi gặp lỗi tạm thời
 * (503 quá tải, 429 hết quota, 404 model không còn dùng được cho key này).
 *
 * 503 thường là quá tải ngắn hạn nên thử lại **cùng model** một lần sau khi
 * chờ vài giây; 429/404 thì chuyển model ngay (chờ cũng không giúp ích).
 */
async function invokeWithFallback(
  options: {
    model: ChatGoogleGenerativeAI
    fallbackModels?: ChatGoogleGenerativeAI[]
    tools: ReturnType<typeof createAgentTools>
    ctx: ToolContext
  },
  messages: BaseMessage[],
  exhausted: boolean,
): Promise<BaseMessage> {
  const models = [options.model, ...(options.fallbackModels ?? [])]
  let lastError: unknown = new Error('Không có model nào khả dụng')

  for (const [index, model] of models.entries()) {
    const isPrimary = index === 0

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return exhausted
          ? await model.invoke(messages)
          : await model.bindTools(options.tools.map((tool) => tool.bindable)).invoke(messages)
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message : String(error)

        // Lỗi cứng của model chính (sai API key, sai payload…) → ném ra luôn.
        if (isPrimary && attempt === 1 && !isRetryableModelError(message)) {
          throw error
        }

        const canRetrySame =
          attempt === 1 && isTransientOverloadError(message) && models.length === 1

        options.ctx.logger.warn('model_call_retry', {
          model: model.model,
          attempt,
          transient: canRetrySame,
          error: message.slice(0, 200),
        })

        if (canRetrySame) {
          await sleep(2000)
          continue
        }
        break
      }
    }

    if (isPrimary && !isRetryableModelError(errorMessage(lastError))) {
      throw lastError
    }
  }

  throw lastError
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 503 / quá tải — thường hết sau vài giây nên đáng thử lại cùng model. */
function isTransientOverloadError(message: string): boolean {
  return /503|overloaded|high demand|unavailable|try again later/i.test(message)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms)
  })
}

export type AssistantOptions = {
  store: RetrievalStore
  catalog: EntityCatalog
  drafts: BookingDraftStore
  sessions: SessionStore
  logger: Logger
  model: ChatGoogleGenerativeAI
  /**
   * Các model dự phòng — thử lần lượt khi model chính lỗi (503 quá tải,
   * 429 hết quota, 404 model không còn dùng được cho key này).
   */
  fallbackModels?: ChatGoogleGenerativeAI[]
  /** Số lượt gần nhất giữ nguyên văn trong lịch sử. */
  keepTurns?: number
  maxToolRounds?: number
  /**
   * Câu hỏi tra cứu được trả thẳng từ index, không gọi model (mặc định bật).
   * Tắt để mọi lượt đều gọi model — tốn quota hơn nhưng câu trả lời tự nhiên hơn.
   */
  directSearch?: boolean
}

/** Lỗi có thể thử model khác: quá tải, hết quota, model không còn dùng được. */
function isRetryableModelError(message: string): boolean {
  return /503|429|404|overloaded|unavailable|high demand|RESOURCE_EXHAUSTED|not found/i.test(
    message,
  )
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

  /**
   * Lưu lượt hội thoại vào phiên; lượt cũ hơn `keepTurns` được rút gọn vào
   * bản tóm tắt để prompt không bị phình.
   */
  private saveTurn(
    sessions: SessionStore,
    sessionId: string,
    session: ChatSession,
    userMessage: string,
    answer: string,
    ctx: ToolContext,
    keepTurns: number,
  ): void {
    let history = { turns: session.turns, summary: session.summary }
    history = appendTurn(history, { role: 'user', content: userMessage, entities: [] }, keepTurns)
    history = appendTurn(
      history,
      { role: 'assistant', content: answer, entities: ctx.cards.map((card) => card.title) },
      keepTurns,
    )

    sessions.set(sessionId, { ...session, turns: history.turns, summary: history.summary })
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
      toolCalls: [],
    }

    const tools = createAgentTools(ctx)
    const graph = buildGraph({ model, tools, ctx, maxToolRounds })

    const startedAt = Date.now()

    // Index rỗng → không có gì để trả lời, và gọi model cũng vô nghĩa.
    // Báo thẳng thay vì để người dùng chờ 60s rồi nhận "không tìm thấy".
    if (store.size === 0) {
      logger.error('retrieval_index_empty', { requestId: input.requestId })
      yield {
        type: 'error',
        message:
          'Index truy xuất đang rỗng nên chưa tra cứu được dữ liệu. Hãy chạy `pnpm index` (hoặc `pnpm seed` nếu chưa có dữ liệu crawl) rồi thử lại.',
      }
      return
    }

    // Chuyên khoa / khu vực mà câu hỏi nhắc tới — dùng để lọc kết quả, tránh
    // trả về mọi cơ sở cùng thành phố chỉ vì khớp tên địa danh.
    const specialty = findLongestMatch(input.message, catalog.specialtyNames())
    const area = findLongestMatch(input.message, catalog.cities())

    // --- Fast path -----------------------------------------------------------------
    // Câu hỏi tra cứu danh sách → trả thẳng kết quả từ index, KHÔNG gọi model.
    // Gói Gemini free tier chỉ 5 request/phút + 20 request/ngày; một lượt gọi model
    // có thể mất hàng chục giây (và phải chờ cửa sổ quota), nên phần lớn câu hỏi
    // tìm kiếm không cần model.
    const intent = detectIntent(input.message)
    const fastType = intent.isSearch ? intent.type : undefined
    const useFastPath =
      this.options.directSearch !== false &&
      fastType !== undefined &&
      fastType !== 'specialty'

    if (useFastPath && fastType !== undefined) {
      const toolName = `search_${fastType}`
      yield { type: 'status', phase: 'tool', label: `Đang tra cứu: ${toolName}…` }
      ctx.toolCalls.push({ type: 'tool', name: toolName, status: 'start' })

      const hits = await store.search(input.message, {
        type: fastType,
        specialty,
        area,
        k: 5,
        embeddings: false,
      })

      // Bộ lọc chuyên khoa có thể quá chặt (dữ liệu crawl chưa gán specialtyIds…)
      // → thử lại nhưng VẪN giữ bộ lọc khu vực: khu vực là thông tin tin cậy hơn
      // (crawl luôn điền từ địa chỉ), bỏ nó thì kết quả trả ra lẫn các tỉnh khác.
      if (hits.length === 0 && specialty !== undefined) {
        ctx.logger.info('fast_path_relaxed_specialty_filter', { specialty, area })
        hits.push(
          ...(await store.search(input.message, {
            type: fastType,
            area,
            k: 5,
            embeddings: false,
          })),
        )
      }

      ctx.toolCalls.push({ type: 'tool', name: toolName, status: 'done' })

      if (hits.length > 0) {
        ctx.cards.push(...hits.map(searchResultToCard))

        const answer = buildDirectAnswer(input.message, fastType, hits)
        const usage: ChatUsageSummary = {
          inputTokens: 0,
          outputTokens: estimateTokens(answer),
          durationMs: Date.now() - startedAt,
          toolRounds: 0,
          toolsUsed: [toolName],
        }

        logger.info('chat_turn_done', {
          requestId: input.requestId,
          sessionId: input.sessionId,
          mode: 'direct-search',
          durationMs: usage.durationMs,
          toolsUsed: usage.toolsUsed,
        })

        yield { type: 'cards', cards: ctx.cards }
        yield { type: 'delta', text: answer }
        this.saveTurn(sessions, input.sessionId, session, input.message, answer, ctx, keepTurns)
        yield { type: 'done', usage }
        return
      }

      // Không có kết quả → rơi xuống đường model để trả lời tự nhiên hơn.
      ctx.cards.length = 0
      ctx.toolCalls.length = 0
    }

    // Bước tiền truy xuất: BM25 thuần (không gọi API embedding) để phần lớn
    // câu hỏi tìm kiếm chỉ cần **1 request model** thay vì 2 (chọn tool + trả lời).
    const preHits = await store.search(input.message, {
      specialty,
      area,
      k: 5,
      embeddings: false,
    })
    if (preHits.length > 0) {
      ctx.cards.push(...preHits.map(searchResultToCard))
    }

    const systemPrompt = composeSystemPrompt(
      loadSystemPrompt(),
      buildPreRetrievalBlock(preHits),
    )
    const messages = buildModelMessages(systemPrompt, session.summary, session.turns)
    messages.push(new HumanMessage(input.message))

    let answer = ''
    let emittedCards = 0
    let emittedBookings = 0
    let emittedToolCalls = 0
    let state: AssistantStateView | null = null

    const stream = await graph.stream(
      { messages, toolRounds: 0, toolsUsed: [] },
      { streamMode: ['messages', 'values'] },
    )

    // Bước đầu tiên là model suy luận xem cần tool nào — chưa có token nào
    // được stream ra, nên phải báo trạng thái ngay để UI không tưởng là treo.
    let phase: 'thinking' | 'tool' | 'answering' = 'thinking'
    yield { type: 'status', phase, label: 'Đang phân tích câu hỏi…' }

    try {
      for await (const chunk of stream) {
        for (const message of extractMessages(chunk)) {
          if (!(message instanceof AIMessage)) continue
          const text = messageText(message)
          if (text === '') continue
          if (phase !== 'answering') {
            phase = 'answering'
            yield { type: 'status', phase, label: 'Đang soạn câu trả lời…' }
          }
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

        // Tool đang chạy → UI hiện tiến trình thay vì đứng im.
        if (ctx.toolCalls.length > emittedToolCalls) {
          const pending = ctx.toolCalls.slice(emittedToolCalls)
          emittedToolCalls = ctx.toolCalls.length
          for (const call of pending) {
            yield { type: 'tool', name: call.name, status: call.status }

            if (call.status === 'start') {
              phase = 'tool'
              yield { type: 'status', phase, label: `Đang tra cứu: ${call.name}…` }
            } else {
              phase = 'thinking'
              yield { type: 'status', phase, label: 'Đang soạn câu trả lời…' }
            }
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
    } catch (error) {
      // Gói free tier chỉ 5 request/phút + 20 request/ngày cho Gemini 3.8 Flash —
      // báo rõ để người dùng biết vì sao chờ lâu thay vì thấy lỗi chung chung.
      const message = error instanceof Error ? error.message : String(error)
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
        logger.error('model_quota_exceeded', {
          requestId: input.requestId,
          error: message.slice(0, 500),
        })
        yield {
          type: 'error',
          message: `Gemini báo hết hạn mức (429). Chi tiết: ${message.slice(0, 300)}`,
        }
        return
      }

      logger.error('chat_turn_failed', { requestId: input.requestId, error: message })
      yield { type: 'error', message }
      return
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
    this.saveTurn(sessions, input.sessionId, session, input.message, answer, ctx, keepTurns)

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
  model: ChatGoogleGenerativeAI
  fallbackModels?: ChatGoogleGenerativeAI[]
  tools: ReturnType<typeof createAgentTools>
  ctx: ToolContext
  maxToolRounds: number
}) {
  const toolsByName = new Map<string, AgentTool>(
    options.tools.map((tool) => [tool.name, tool] as const),
  )

  return new StateGraph(AssistantState)
    .addNode('agent', async (state) => {
      // Hết ngân sách tool → buộc model trả lời bằng văn bản.
      const exhausted = state.toolRounds >= options.maxToolRounds
      const startedAt = Date.now()
      const response = await invokeWithFallback(options, state.messages, exhausted)

      // Log thời gian từng lần gọi model để biết độ trễ nằm ở model hay tool.
      options.ctx.logger.info('model_call_done', {
        durationMs: Date.now() - startedAt,
        toolRounds: state.toolRounds,
        exhausted,
      })

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

        options.ctx.toolCalls.push({ type: 'tool', name: call.name, status: 'start' })

        const toolStartedAt = Date.now()
        const output = await tool.run(call.args)
        const durationMs = Date.now() - toolStartedAt

        options.ctx.toolCalls.push({ type: 'tool', name: call.name, status: 'done' })
        options.ctx.logger.info('tool_done', { name: call.name, durationMs })

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
