import { config as loadDotenv } from 'dotenv'
import { resolve } from 'node:path'
import { GeminiEmbedder, type Env, type Logger } from '@bookingcare/shared'
import { findRepoRoot } from '@bookingcare/shared/node'
import { BookingAssistant, createAssistantModel, isAssistantConfigured } from './agent/graph.js'
import { SessionStore } from './agent/session.js'
import { BookingDraftStore } from './booking/drafts.js'
import { readEnv } from './config/env.js'
import { dataPath } from './config/paths.js'
import { createApiLogger } from './logging/logger.js'
import { EntityCatalog } from './retrieval/catalog.js'
import { RetrievalStore } from './retrieval/store.js'

export type Runtime = {
  env: Env
  logger: Logger
  store: RetrievalStore
  catalog: EntityCatalog
  drafts: BookingDraftStore
  sessions: SessionStore
  /** `null` khi chưa cấu hình `GEMINI_API_KEY`. */
  assistant: BookingAssistant | null
}

/**
 * Dựng mọi thành phần của API — dùng chung cho server và cho CLI `pnpm chat`
 * để hai đường chạy y hệt nhau.
 */
export async function createRuntime(): Promise<Runtime> {
  const root = findRepoRoot(process.cwd())
  loadDotenv({ path: resolve(root, '.env') })

  const env = readEnv(process.env)
  const logger = createApiLogger(env)

  // Embedding chỉ cần khi có key; thiếu key thì tìm kiếm lai chạy BM25 thuần.
  const embedder =
    env.GEMINI_API_KEY.trim() === ''
      ? null
      : new GeminiEmbedder({
          apiKey: env.GEMINI_API_KEY,
          model: env.GEMINI_EMBEDDING_MODEL,
        })

  const store =
    (await RetrievalStore.load(
      dataPath(env, 'processed', 'retrieval-index.json'),
      embedder,
    )) ?? RetrievalStore.empty(embedder)

  const catalog = await EntityCatalog.load(dataPath(env, 'processed'))

  const drafts = new BookingDraftStore({
    filePath: dataPath(env, 'processed', 'booking-drafts.json'),
    baseUrl: env.BOOKINGCARE_BASE_URL,
  })

  const sessions = new SessionStore()

  const assistant = isAssistantConfigured(env)
    ? new BookingAssistant({
        store,
        catalog,
        drafts,
        sessions,
        logger,
        model: createAssistantModel(env),
        keepTurns: env.CHAT_HISTORY_TURNS,
      })
    : null

  return { env, logger, store, catalog, drafts, sessions, assistant }
}
