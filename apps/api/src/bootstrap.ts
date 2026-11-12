import { createHash } from 'node:crypto'
import { config as loadDotenv } from 'dotenv'
import { resolve } from 'node:path'
import {
  GeminiEmbedder,
  resolveFallbackModels,
  type Env,
  type Logger,
} from '@bookingcare/shared'
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
/**
 * Dấu vân tay của API key (8 ký tự đầu của SHA-256).
 *
 * Giúp xác nhận API đang dùng **đúng key** mà bạn vừa đổi, mà không phải lộ
 * key thật ra log.
 */
function keyFingerprint(apiKey: string): string {
  if (apiKey.trim() === '') {
    return '(chưa có key)'
  }
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 8)
}

export async function createRuntime(): Promise<Runtime> {
  const root = findRepoRoot(process.cwd())
  loadDotenv({ path: resolve(root, '.env') })

  const env = readEnv(process.env)
  const logger = createApiLogger(env)

  // Embedding chỉ cần khi có key; thiếu key thì tìm kiếm lai chạy BM25 thuần.
  // QUERY_EMBEDDINGS=false → không gọi API embedding cho câu truy vấn (tiết kiệm quota).
  const embedder =
    env.GEMINI_API_KEY.trim() === '' || env.QUERY_EMBEDDINGS === 'false'
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

  const fallbackIds = await resolveFallbackModels(env)
  if (fallbackIds.length > 0) {
    logger.info('model_fallbacks_resolved', { models: fallbackIds })
  }

  logger.info('runtime_config', {
    keyFingerprint: keyFingerprint(env.GEMINI_API_KEY),
    assistantModel: env.GEMINI_MODEL,
    judgeModel: env.GEMINI_JUDGE_MODEL,
    embeddingModel: env.GEMINI_EMBEDDING_MODEL,
    fallbackModels: fallbackIds,
    directSearch: env.ASSISTANT_DIRECT_SEARCH === 'true',
  })

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
 * Danh sách model dự phòng được dùng chung với script eval.
 *
 * Nếu `GEMINI_MODEL_FALLBACKS` trống thì tự dò các model hỗ trợ chat bằng
 * `GET /v1beta/models` — lệnh này **không tốn quota**, và giúp agent không bị
 * chết khi model chính gặp 503 quá tải.
 */
