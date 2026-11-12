import type {
  BookingEvent,
  ChatEvent,
  ChatStatusEvent,
  ChatUsage,
  ResultCard,
  ToolCallEvent,
} from '@bookingcare/shared'

export type { BookingEvent, ChatEvent, ChatStatusEvent, ResultCard, ToolCallEvent }

/** Tóm tắt usage của một lượt hội thoại. */
export type ChatUsageSummary = ChatUsage
