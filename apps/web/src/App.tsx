import { useRef, useState } from 'react'
import type { BookingEvent, ChatEvent, ResultCard } from '@bookingcare/shared'
import { askAssistantStream } from './api/client'
import { ChatPanel } from './components/ChatPanel'
import type { UiMessage } from './types'

const WELCOME_MESSAGE: UiMessage = {
  role: 'assistant',
  content:
    'Chào bạn! Mình có thể tìm bệnh viện, chuyên khoa, bác sĩ và hỗ trợ tạo lịch khám. Bạn muốn tra cứu gì trước?',
}

export function App() {
  const [messages, setMessages] = useState<UiMessage[]>([WELCOME_MESSAGE])
  const [streaming, setStreaming] = useState('')
  const [loading, setLoading] = useState(false)
  const [runningTool, setRunningTool] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sessionIdRef = useRef<string | undefined>(undefined)

  async function handleSend(text: string): Promise<void> {
    setMessages((current) => [...current, { role: 'user', content: text }])
    setStreaming('')
    setLoading(true)
    setStatus(null)
    setRunningTool(null)
    setError(null)

    let answer = ''
    const cards: ResultCard[] = []
    let booking: BookingEvent | null = null

    try {
      await askAssistantStream(text, sessionIdRef.current, (event: ChatEvent) => {
        if (event.type === 'meta') {
          sessionIdRef.current = event.sessionId
        } else if (event.type === 'status') {
          setStatus(event.label)
        } else if (event.type === 'tool') {
          setRunningTool(event.status === 'start' ? event.name : null)
        } else if (event.type === 'cards') {
          cards.push(...event.cards)
        } else if (event.type === 'booking') {
          booking = event.booking
        } else if (event.type === 'delta') {
          answer += event.text
          setStreaming(answer)
        } else if (event.type === 'error') {
          setError(event.message)
        }
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Đã xảy ra lỗi, vui lòng thử lại.')
    } finally {
      // Câu trả lời phải được ghi vào lịch sử — nếu không nó sẽ biến mất
      // khi luồng streaming kết thúc.
      if (answer.trim() !== '') {
        setMessages((current) => [
          ...current,
          { role: 'assistant', content: answer, cards, booking },
        ])
      }
      setStreaming('')
      setLoading(false)
    }
  }

  const visibleMessages: UiMessage[] =
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
        loading={loading}
        runningTool={runningTool}
        status={status}
        onSend={handleSend}
      />

      <footer className="app__footer">
        Trợ lý không chẩn đoán bệnh. Vui lòng tra cứu thông tin trực tiếp trên bookingcare.vn trước khi đặt lịch.
      </footer>
    </div>
  )
}
