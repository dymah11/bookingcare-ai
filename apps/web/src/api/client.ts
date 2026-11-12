import type {
  BookingDraftInput,
  ChatEvent,
  ChatResponse,
  SearchResult,
} from '@bookingcare/shared'

/**
 * Base URL của API. Mặc định dùng relative (`/api/...`) để dev server proxy
 * và production cùng origin. Override bằng `VITE_API_BASE_URL` khi tách domain.
 */
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

export type SearchResponse = {
  query: string
  total: number
  hits: SearchResult[]
}

export type BookingDraftResponse = {
  draftId: string
  createdAt: string
  bookingcareUrl: string
}

type ErrorPayload = { error?: { code?: string; message?: string } }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })

  if (!response.ok) {
    let payload: ErrorPayload | null = null
    try {
      payload = (await response.json()) as ErrorPayload
    } catch {
      payload = null
    }
    const message = payload?.error?.message ?? `Yêu cầu thất bại (HTTP ${response.status})`
    throw new Error(message)
  }

  return (await response.json()) as T
}

export function searchHospitals(query: string, topK = 5): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query, topK: String(topK) })
  return request<SearchResponse>(`/api/search?${params.toString()}`)
}

export function askAssistant(message: string, sessionId?: string): Promise<ChatResponse> {
  return request<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, ...(sessionId === undefined ? {} : { sessionId }) }),
  })
}

/**
 * Gọi `POST /api/chat` dạng SSE và gọi `onEvent` cho mỗi sự kiện
 * (`delta` cho text, `cards` cho thẻ kết quả, `booking` cho booking).
 */
export async function askAssistantStream(
  message: string,
  sessionId: string | undefined,
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({
      message,
      stream: true,
      ...(sessionId === undefined ? {} : { sessionId }),
    }),
  })

  if (!response.ok || response.body === null) {
    throw new Error(`Yêu cầu thất bại (HTTP ${response.status})`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      const dataLine = chunk.split('\n').find((line) => line.startsWith('data:'))
      if (dataLine !== undefined) {
        const payload = dataLine.slice(5).trim()
        try {
          onEvent(JSON.parse(payload) as ChatEvent)
        } catch {
          // bỏ qua event không parse được
        }
      }

      boundary = buffer.indexOf('\n\n')
    }
  }
}

export function createBookingDraft(input: BookingDraftInput): Promise<BookingDraftResponse> {
  return request<BookingDraftResponse>('/api/booking/draft', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
