import { randomUUID } from 'node:crypto'
import type { BookingAssistant } from '../agent/graph.js'
import type { BookingEvent, ResultCard } from '../agent/types.js'

export type TurnOutcome = {
  user: string
  answer: string
  cards: ResultCard[]
  bookings: BookingEvent[]
}

export type ConversationOutcome = {
  turns: TurnOutcome[]
  toolsUsed: string[]
  toolRounds: number
  inputTokens: number
  outputTokens: number
  durationMs: number
}

/**
 * Chạy một hội thoại nhiều lượt trên cùng một sessionId và gom kết quả.
 */
export async function runConversation(
  assistant: BookingAssistant,
  sessionId: string,
  messages: string[],
): Promise<ConversationOutcome> {
  const turns: TurnOutcome[] = []
  const toolsUsed = new Set<string>()
  let toolRounds = 0
  let inputTokens = 0
  let outputTokens = 0
  const startedAt = Date.now()

  for (const message of messages) {
    let answer = ''
    const cards: ResultCard[] = []
    const bookings: BookingEvent[] = []

    for await (const event of assistant.stream({
      sessionId,
      message,
      requestId: randomUUID(),
    })) {
      if (event.type === 'delta') {
        answer += event.text
      } else if (event.type === 'cards') {
        cards.push(...event.cards)
      } else if (event.type === 'booking') {
        bookings.push(event.booking)
      } else if (event.type === 'done') {
        for (const tool of event.usage.toolsUsed) {
          toolsUsed.add(tool)
        }
        toolRounds += event.usage.toolRounds
        inputTokens += event.usage.inputTokens
        outputTokens += event.usage.outputTokens
      }
    }

    turns.push({ user: message, answer, cards, bookings })
  }

  return {
    turns,
    toolsUsed: [...toolsUsed],
    toolRounds,
    inputTokens,
    outputTokens,
    durationMs: Date.now() - startedAt,
  }
}
