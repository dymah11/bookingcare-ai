import type { Env, Logger } from '@bookingcare/shared'
import type { BookingAssistant } from './agent/graph.js'
import type { SessionStore } from './agent/session.js'
import type { BookingDraftStore } from './booking/drafts.js'
import type { RetrievalStore } from './retrieval/store.js'

export type AppDependencies = {
  env: Env
  logger: Logger
  store: RetrievalStore
  drafts: BookingDraftStore
  sessions: SessionStore
  /** `null` khi chưa cấu hình `ANTHROPIC_API_KEY`. */
  agent: BookingAssistant | null
}
