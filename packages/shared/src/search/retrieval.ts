import type { Chunk } from '../chunk.js'
import type { QueryEmbedder } from '../embeddings.js'
import { retrievalIndexSchema } from '../schemas.js'
import { deserializeTermIndex, type SerializedTermIndex } from './serialize.js'
import { HybridRetriever } from './retriever.js'

/**
 * File index lưu trên đĩa — nạp nhanh lúc khởi động, không cần DB ngoài.
 */
export type RetrievalIndexFile = {
  version: 1
  createdAt: string
  /** Model embedding đã dùng để sinh `embeddings` (rỗng nếu chưa có embedding). */
  embeddingModel: string
  dimension: number
  chunks: Chunk[]
  /** BM25 trên token đã bỏ dấu. */
  bm25Unaccented: SerializedTermIndex
  /** BM25 trên token giữ dấu. */
  bm25Accented: SerializedTermIndex
  /** Vector embedding của từng chunk, song song với `chunks`. */
  embeddings: number[][]
}

export const RETRIEVAL_INDEX_VERSION = 1
export const RETRIEVAL_INDEX_FILENAME = 'retrieval-index.json'

/** Validate payload index đọc từ file. Trả `null` nếu không hợp lệ. */
export function parseRetrievalIndex(json: unknown): RetrievalIndexFile | null {
  const parsed = retrievalIndexSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

/** Dựng retriever từ index đã nạp. */
export function createRetriever(
  data: RetrievalIndexFile,
  embedder: QueryEmbedder | null = null,
): HybridRetriever {
  return new HybridRetriever({
    chunks: data.chunks,
    bm25Unaccented: deserializeTermIndex(data.bm25Unaccented),
    bm25Accented: deserializeTermIndex(data.bm25Accented),
    embeddings: data.embeddings,
    embedder,
  })
}
