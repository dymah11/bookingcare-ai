/**
 * Kiểu dữ liệu dùng chung giữa API, web và scripts.
 * Mọi kiểu ở đây đều mirror với một zod schema tương ứng trong `schemas.ts`.
 */

export type ChatRole = 'user' | 'assistant' | 'system'

export type ChatMessage = {
  role: ChatRole
  content: string
}

export type ChatRequest = {
  message: string
  history: ChatMessage[]
}

export type ChatUsage = {
  inputTokens: number
  outputTokens: number
  durationMs: number
  /** Số vòng gọi tool đã dùng (tối đa 2). */
  toolRounds: number
  toolsUsed: string[]
}

/** Phản hồi JSON (không streaming) của `POST /api/chat`. */
export type ChatResponse = {
  sessionId: string
  answer: string
  usage: ChatUsage
}

export type BookingDraftInput = {
  specialtyId?: string
  hospitalId?: string
  serviceId?: string
  doctorId?: string
  date: string
  time: string
  patientName: string
  patientPhone: string
  note?: string
}

export type BookingDraft = {
  id: string
  /** Mã booking hiển thị cho người dùng, ví dụ "BC-7F3A9C21". */
  code: string
  createdAt: string
  status: 'draft'
  input: BookingDraftInput
  bookingcareUrl: string
}

export type ApiErrorBody = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

/** Thẻ kết quả để UI hiển thị (bác sĩ, cơ sở, dịch vụ). */
export type ResultCard = {
  kind: 'specialty' | 'facility' | 'doctor' | 'service'
  id: string
  title: string
  subtitle: string
  url: string
  fields: { label: string; value: string }[]
}

/** Sự kiện booking để UI hiển thị mã booking + link. */
export type BookingEvent = {
  code: string
  draftId: string
  url: string
  target: string
  patientName: string
  date: string
  time: string
}

/** Sự kiện tool đang chạy — để UI không đứng im trong lúc model suy luận. */
export type ToolCallEvent = {
  type: 'tool'
  name: string
  status: 'start' | 'done'
}

/**
 * Trạng thái tiến trình của lượt trò chuyện.
 *
 * `thinking` = model đang suy luận (chọn tool hoặc soạn câu trả lời) —
 * đây là lúc không có token nào được stream ra, nên UI cần biết để không
 * tưởng là treo.
 */
export type ChatStatusEvent = {
  type: 'status'
  phase: 'thinking' | 'tool' | 'answering'
  label: string
}

/** Các sự kiện SSE của `POST /api/chat`. */
export type ChatEvent =
  | { type: 'meta'; sessionId: string; requestId: string }
  | { type: 'status'; phase: 'thinking' | 'tool' | 'answering'; label: string }
  | { type: 'delta'; text: string }
  | { type: 'cards'; cards: ResultCard[] }
  | { type: 'tool'; name: string; status: 'start' | 'done' }
  | { type: 'booking'; booking: BookingEvent }
  | { type: 'done'; usage: ChatUsage }
  | { type: 'error'; message: string }
