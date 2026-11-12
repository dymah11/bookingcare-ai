import { useRef, useState } from 'react'
import type { BookingEvent, ChatEvent, ChatMessage, ResultCard } from '@bookingcare/shared'
import { askAssistantStream } from './api/client'
import { ChatPanel } from './components/ChatPanel'

const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    'Chào bạn! Mình có thể tìm bệnh viện, chuyên khoa, bác sĩ và hỗ trợ tạo lịch khám. Bạn muốn tra cứu gì trước?',
}

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [streaming, setStreaming] = useState('')
  const [cards, setCards] = useState<ResultCard[]>([])
  const [booking, setBooking] = useState<BookingEvent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionIdRef = useRef<string | undefined>(undefined)

  async function handleSend(text: string): Promise<void> {
    setMessages((current) => [...current, { role: 'user', content: text }])
    setStreaming('')
    setCards([])
    setBooking(null)
    setLoading(true)
    setError(null)

    let answer = ''

    try {
      await askAssistantStream(text, sessionIdRef.current, (event: ChatEvent) => {
        if (event.type === 'meta') {
          sessionIdRef.current = event.sessionId
        } else if (event.type === 'delta') {
          answer += event.text
          setStreaming(answer)
        } else if (event.type === 'cards') {
          setCards((current) => [...current, ...event.cards])
        } else if (event.type === 'booking') {
          setBooking(event.booking)
        } else if (event.type === 'error') {
          setError(event.message)
        }
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Đã xảy ra lỗi, vui lòng thử lại.')
    } finally {
      setStreaming('')
      setLoading(false)
    }
  }

  const visibleMessages: ChatMessage[] =
    streaming === '' ? messages : [...messages, { role: 'assistant', content: streaming }]

  return (
    <div className="app">
      <header className="app__header">
        <h1>BookingCare AI</h1>
        <p>Trợ lý tìm kiếm, hỏi đáp và đặt lịch khám — dựa trên dữ liệu công khai bookingcare.vn.</p>
      </header>

      {error ? (
        <p className="app__error" role="alert">
          {error}
        </p>
      ) : null}

      <ChatPanel
        messages={visibleMessages}
        cards={cards}
        booking={booking}
        loading={loading}
        onSend={handleSend}
      />

      <footer className="app__footer">
        Trợ lý không chẩn đoán bệnh. Vui lòng tra cứu thông tin trực tiếp trên bookingcare.vn trước khi đặt lịch.
      </footer>
    </div>
  )
}
