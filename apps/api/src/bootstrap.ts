import { config as loadDotenv } from 'dotenv'
import { resolve } from 'node:path'
import { GeminiEmbedder, listModels, type Env, type Logger } from '@bookingcare/shared'
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

  if (store.size === 0) {
    // Index rỗng là nguyên nhân "tra cứu hoài không ra" — báo ngay lúc khởi động.
    logger.warn('retrieval_index_empty', {
      indexSize: store.size,
      entityFiles: catalog.size,
      processedDir: dataPath(env, 'processed'),
      hint:
        catalog.size === 0
          ? 'Chưa có entity trong data/processed — chạy `pnpm crawl --all` hoặc `pnpm seed`'
          : 'Đã có entity nhưng chưa có index — chạy `pnpm index`',
    })
  }

  const drafts = new BookingDraftStore({
    filePath: dataPath(env, 'processed', 'booking-drafts.json'),
    baseUrl: env.BOOKINGCARE_BASE_URL,
  })

  const sessions = new SessionStore()

  const fallbackIds = await resolveFallbackModelIds(env, logger)

  const assistant = isAssistantConfigured(env)
    ? new BookingAssistant({
        store,
        catalog,
        drafts,
        sessions,
        logger,
        model: createAssistantModel(env),
        fallbackModels: fallbackIds.map((id) => createAssistantModel(env, id)),
        keepTurns: env.CHAT_HISTORY_TURNS,
        directSearch: env.ASSISTANT_DIRECT_SEARCH === 'true',
      })
    : null

  return { env, logger, store, catalog, drafts, sessions, assistant }
}

/**
 * Danh sách model dự phòng.
 *
 * Nếu `GEMINI_MODEL_FALLBACKS` trống thì tự dò các model hỗ trợ chat bằng
 * `GET /v1beta/models` — lệnh này **không tốn quota**, và giúp agent không bị
 * chết khi model chính gặp 503 quá tải.
 */
async function resolveFallbackModelIds(env: Env, logger: Logger): Promise<string[]> {
  const configured = env.GEMINI_MODEL_FALLBACKS.split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '')

  if (configured.length > 0) {
    return configured
  }

  if (env.GEMINI_API_KEY.trim() === '') {
    return []
  }

  try {
    const models = await listModels(env.GEMINI_API_KEY)
    const discovered = models
      .filter((model) => model.supportsChat && model.id !== env.GEMINI_MODEL)
      .map((model) => model.id)
      .slice(0, 3)

    logger.info('model_fallbacks_discovered', { models: discovered })
    return discovered
  } catch (error) {
    logger.warn('model_fallbacks_discovery_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}
