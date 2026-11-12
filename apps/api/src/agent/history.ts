import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'

export type ConversationTurn = {
  role: 'user' | 'assistant'
  content: string
  /** Tên thực thể đã nhắc tới trong lượt này — dùng để tóm tắt gọn. */
  entities: string[]
}

export type ConversationHistory = {
  /** Các lượt gần nhất, giữ nguyên văn. */
  turns: ConversationTurn[]
  /** Bản tóm tắt của các lượt cũ hơn. */
  summary: string
}

/** Số lượt gần nhất được giữ nguyên văn. */
export const DEFAULT_KEEP_TURNS = 6

/** Số dòng tóm tắt tối đa được giữ. */
const MAX_SUMMARY_LINES = 30

function truncate(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1)}…`
}

/** Rút gọn các lượt cũ thành từng dòng tóm tắt. */
export function summarizeTurns(turns: ConversationTurn[]): string[] {
  return turns.map((turn, index) => {
    const role = turn.role === 'user' ? 'Hỏi' : 'Trả lời'
    const entities = turn.entities.length > 0 ? ` → ${turn.entities.join(', ')}` : ''
    return `[${index + 1}] ${role}: ${truncate(turn.content, 140)}${entities}`
  })
}

function appendSummary(existing: string, lines: string[]): string {
  const previous = existing === '' ? [] : existing.split('\n')
  return [...previous, ...lines].slice(-MAX_SUMMARY_LINES).join('\n')
}

/**
 * Thêm một lượt mới vào lịch sử.
 *
 * Khi số lượt vượt quá `keepTurns`, phần cũ hơn bị rút gọn và dồn vào bản tóm tắt
 * — không nhồi toàn bộ lịch sử vào prompt.
 */
export function appendTurn(
  history: ConversationHistory,
  turn: ConversationTurn,
  keepTurns = DEFAULT_KEEP_TURNS,
): ConversationHistory {
  const turns = [...history.turns, turn]
  if (turns.length <= keepTurns) {
    return { turns, summary: history.summary }
  }

  const overflow = turns.length - keepTurns
  const older = turns.slice(0, overflow)
  const recent = turns.slice(overflow)

  return {
    turns: recent,
    summary: appendSummary(history.summary, summarizeTurns(older)),
  }
}

/**
 * Dựng danh sách message cho model: system prompt + tóm tắt lịch sử cũ +
 * các lượt gần nhất.
 */
export function buildModelMessages(
  systemPrompt: string,
  summary: string,
  turns: ConversationTurn[],
): BaseMessage[] {
  const messages: BaseMessage[] = [new SystemMessage(systemPrompt)]

  if (summary.trim() !== '') {
    messages.push(new SystemMessage(`Bản tóm tắt các lượt trước:\n${summary}`))
  }

  for (const turn of turns) {
    messages.push(
      turn.role === 'user' ? new HumanMessage(turn.content) : new AIMessage(turn.content),
    )
  }

  return messages
}
