import type { BookingEvent, ChatRole, ResultCard } from '@bookingcare/shared'

/**
 * Tin nhắn trong giao diện — mỗi tin nhắn mang kèm thẻ kết quả và thông tin
 * booking của chính lượt đó, để lịch sử hiển thị đúng thứ đã trả lời.
 */
export type UiMessage = {
  role: ChatRole
  content: string
  cards?: ResultCard[]
  booking?: BookingEvent | null
}
