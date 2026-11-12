export {
  bookingDraftInputSchema,
  bookingDraftListSchema,
  bookingDraftSchema,
  chatMessageSchema,
  chatRequestSchema,
  chatRoleSchema,
  chatScenarioFileSchema,
  chatScenarioSchema,
  chatTurnRequestSchema,
  evalCaseSchema,
  retrievalEvalCaseSchema,
  retrievalEvalExpectedSchema,
  retrievalEvalFileSchema,
  retrievalIndexSchema,
  searchQuerySchema,
  serializedTermIndexSchema,
  chunkMetadataSchema,
  chunkSchema,
} from './schemas.js'
export type {
  BookingDraftInputParsed,
  ChatRequestBody,
  ChatScenario,
  ChatTurnRequestBody,
  EvalCase,
  RetrievalEvalCase,
  RetrievalEvalExpected,
  SearchQuery,
} from './schemas.js'

export { envSchema, loadEnv } from './env.js'
export type { Env } from './env.js'

export { createLogger } from './logger.js'
export type { LogFields, LogLevel, Logger, LoggerOptions } from './logger.js'

export {
  buildEntityId,
  crawledEntityListSchema,
  crawledEntitySchema,
  dedupeEntities,
  doctorSchema,
  ENTITY_FIELDS,
  ENTITY_FILE_NAMES,
  entityTypeSchema,
  facilitySchema,
  serviceSchema,
  specialtySchema,
} from './entities.js'
export type {
  CrawledEntity,
  DoctorEntity,
  EntityType,
  FacilityEntity,
  ServiceEntity,
  SpecialtyEntity,
} from './entities.js'

export {
  buildMetadata,
  chunkEntities,
  chunkEntity,
  dedupeChunks,
  enrichSpecialtyLabels,
  MAX_CHUNK_TOKENS,
  specialtyLabel,
} from './chunk.js'
export type { Chunk, ChunkMetadata } from './chunk.js'

export { DEFAULT_EMBEDDING_MODEL, GeminiApiError, GeminiEmbedder } from './embeddings.js'
export type { GeminiEmbedderOptions, QueryEmbedder } from './embeddings.js'

export {
  buildThinkingConfig,
  generateContent,
  GEMINI_API_BASE,
  GENERATE_CONTENT_TIMEOUT_MS,
  isChatModelId,
  listModels,
  resolveFallbackModels,
  supportsThinking,
} from './gemini.js'
export type { AvailableModel, GenerateContentOptions } from './gemini.js'

export {
  BM25_B,
  BM25_K1,
  buildTermIndex,
  chunkToDocuments,
  cleanText,
  collapseWhitespace,
  cosineSimilarity,
  createRetriever,
  deserializeTermIndex,
  estimateTokens,
  HybridRetriever,
  matchesFilters,
  normalizeAccented,
  normalizeText,
  parseRetrievalIndex,
  rankByEmbedding,
  reciprocalRankFusion,
  RETRIEVAL_INDEX_FILENAME,
  RETRIEVAL_INDEX_VERSION,
  RRF_K,
  scoreQuery,
  serializeTermIndex,
  stripDiacritics,
  stripHtml,
  toNfc,
  tokenize,
  tokenizeAccented,
} from './search/index.js'
export type {
  HybridRetrieverOptions,
  IndexedDocument,
  RetrievalIndexFile,
  SearchFilters,
  SearchResult,
  SerializedTermIndex,
  TermIndex,
  TermStats,
} from './search/index.js'

export type {
  ApiErrorBody,
  BookingDraft,
  BookingDraftInput,
  BookingEvent,
  ChatEvent,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatRole,
  ChatStatusEvent,
  ChatUsage,
  ResultCard,
  ToolCallEvent,
} from './types.js'
