import { useEffect, useState, type FormEvent } from 'react'
import type { BookingEvent, ResultCard } from '@bookingcare/shared'
import type { UiMessage } from '../types'

export type ChatPanelProps = {
  messages: UiMessage[]
  loading: boolean
  /** Tên tool đang chạy — để người dùng biết hệ thống đang làm gì. */
  runningTool?: string | null
  /** Trạng thái hiện tại do server báo ("Đang phân tích câu hỏi…"). */
  status?: string | null
  onSend: (message: string) => void | Promise<void>
}

function CardList({ cards }: { cards: ResultCard[] }) {
  return (
    <div className="chat-panel__cards">
      <h3>Kết quả</h3>
      <ul>
        {cards.map((card) => (
          <li key={`${card.kind}-${card.id}`} className="chat-panel__card">
            <a href={card.url} target="_blank" rel="noreferrer">
              {card.title}
            </a>
            {card.subtitle !== '' ? (
              <span className="chat-panel__card-sub">{card.subtitle}</span>
            ) : null}
            {card.fields.length > 0 ? (
              <dl>
                {card.fields.map((field) => (
                  <div key={`${card.id}-${field.label}`}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function BookingBox({ booking }: { booking: BookingEvent }) {
  return (
    <div className="chat-panel__booking">
      <h3>Booking draft</h3>
      <p>
        Mã booking: <strong>{booking.code}</strong>
      </p>
      <p>
        <a href={booking.url} target="_blank" rel="noreferrer">
          {booking.url}
        </a>
      </p>
    </div>
  )
}

export function ChatPanel({
  messages,
  loading,
  runningTool = null,
  status = null,
  onSend,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const [elapsed, setElapsed] = useState(0)

  // Đồng hồ đếm thời gian chờ — để thấy hệ thống đang chạy chứ không treo.
  useEffect(() => {
    if (!loading) {
      setElapsed(0)
      return
    }

    const startedAt = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 500)

    return () => clearInterval(timer)
  }, [loading])

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const value = draft.trim()
    if (value === '' || loading) {
      return
    }
    void onSend(value)
    setDraft('')
  }

  return (
    <section className="chat-panel">
      <ol className="chat-panel__messages">
        {messages.map((message, index) => (
          <li key={`${message.role}-${index}`} className="chat-panel__item">
            <div className={`chat-panel__message chat-panel__message--${message.role}`}>
              {message.content}
            </div>
            {message.cards !== undefined && message.cards.length > 0 ? (
              <CardList cards={message.cards} />
            ) : null}
            {message.booking !== undefined && message.booking !== null ? (
              <BookingBox booking={message.booking} />
            ) : null}
          </li>
        ))}
        {loading ? (
          <li className="chat-panel__item">
            <div className="chat-panel__message chat-panel__message--pending">
              {status ?? (runningTool === null ? 'Đang tra cứu dữ liệu…' : `Đang gọi ${runningTool}…`)}
              <span className="chat-panel__elapsed"> · {elapsed}s</span>
            </div>
          </li>
        ) : null}
      </ol>

      <form className="chat-panel__composer" onSubmit={handleSubmit}>
        <label className="visually-hidden" htmlFor="chat-message">
          Câu hỏi của bạn
        </label>
        <textarea
          id="chat-message"
          rows={3}
          value={draft}
          placeholder="Ví dụ: Bệnh viện nào có chuyên khoa tim mạch ở TP.HCM?"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={loading || draft.trim() === ''}>
          Gửi
        </button>
      </form>
    </section>
  )
}
