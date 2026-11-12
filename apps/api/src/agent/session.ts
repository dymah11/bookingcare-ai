import type { BookingDraftInput } from '@bookingcare/shared'
import type { ConversationTurn } from './history.js'

export type PendingBooking = {
  input: BookingDraftInput
  createdAt: string
}

export type ChatSession = {
  id: string
  turns: ConversationTurn[]
  summary: string
  /** Booking draft đang chờ người dùng xác nhận. */
  pendingBooking: PendingBooking | null
  updatedAt: string
}

export type SessionStoreOptions = {
  /** Thời gian sống của một phiên (ms). */
  ttlMs?: number
  /** Số phiên tối đa giữ trong bộ nhớ. */
  maxSessions?: number
}

const DEFAULT_TTL_MS = 30 * 60 * 1000
const DEFAULT_MAX_SESSIONS = 500

/**
 * Lưu phiên hội thoại trong bộ nhớ.
 *
 * Phiên chỉ giữ `N` lượt gần nhất + một bản tóm tắt; phần cũ hơn bị rút gọn
 * nên prompt không bị phình theo thời gian.
 */
export class SessionStore {
  private readonly sessions = new Map<string, ChatSession>()
  private readonly ttlMs: number
  private readonly maxSessions: number

  constructor(options: SessionStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS
  }

  get(sessionId: string): ChatSession {
    const existing = this.sessions.get(sessionId)
    if (existing !== undefined) {
      existing.updatedAt = new Date().toISOString()
      return existing
    }

    const session: ChatSession = {
      id: sessionId,
      turns: [],
      summary: '',
      pendingBooking: null,
      updatedAt: new Date().toISOString(),
    }
    this.sessions.set(sessionId, session)
    this.prune()

    return session
  }

  set(sessionId: string, session: ChatSession): void {
    this.sessions.set(sessionId, { ...session, updatedAt: new Date().toISOString() })
  }

  reset(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  get size(): number {
    return this.sessions.size
  }

  /** Dọn phiên cũ và giới hạn số phiên đang giữ. */
  private prune(): void {
    const now = Date.now()
    for (const [id, session] of this.sessions) {
      if (now - new Date(session.updatedAt).getTime() > this.ttlMs) {
        this.sessions.delete(id)
      }
    }

    while (this.sessions.size > this.maxSessions) {
      const oldest = this.sessions.keys().next()
      if (oldest.done) break
      this.sessions.delete(oldest.value)
    }
  }
}
