import { useState, type FormEvent } from 'react'
import type { BookingEvent, ChatMessage, ResultCard } from '@bookingcare/shared'

export type ChatPanelProps = {
  messages: ChatMessage[]
  cards: ResultCard[]
  booking: BookingEvent | null
  loading: boolean
  onSend: (message: string) => void | Promise<void>
}

export function ChatPanel({ messages, cards, booking, loading, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('')

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
          <li
            key={`${message.role}-${index}`}
            className={`chat-panel__message chat-panel__message--${message.role}`}
          >
            {message.content}
          </li>
        ))}
        {loading ? (
          <li className="chat-panel__message chat-panel__message--pending">Đang tra cứu dữ liệu…</li>
        ) : null}
      </ol>

      {cards.length > 0 ? (
        <aside className="chat-panel__cards">
          <h2>Kết quả</h2>
          <ul>
            {cards.map((card) => (
              <li key={`${card.kind}-${card.id}`} className="chat-panel__card">
                <a href={card.url} target="_blank" rel="noreferrer">
                  {card.title}
                </a>
                {card.subtitle !== '' ? <span className="chat-panel__card-sub">{card.subtitle}</span> : null}
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
        </aside>
      ) : null}

      {booking !== null ? (
        <aside className="chat-panel__booking">
          <h2>Booking draft</h2>
          <p>
            Mã booking: <strong>{booking.code}</strong>
          </p>
          <p>
            <a href={booking.url} target="_blank" rel="noreferrer">
              {booking.url}
            </a>
          </p>
        </aside>
      ) : null}

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
