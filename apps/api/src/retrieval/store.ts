import { readFile } from 'node:fs/promises'
import {
  createRetriever,
  parseRetrievalIndex,
  type QueryEmbedder,
  type RetrievalIndexFile,
  type SearchFilters,
  type SearchResult,
  type SerializedTermIndex,
} from '@bookingcare/shared'

export type { SearchFilters, SearchResult }

/**
 * Store truy xuất lai.
 *
 * Lớp I/O của API: nạp index đã serialize từ `data/processed/retrieval-index.json`
 * rồi giao việc tìm kiếm cho `HybridRetriever` (dùng chung với script eval).
 */
export class RetrievalStore {
  private readonly retriever: ReturnType<typeof createRetriever>

  constructor(data: RetrievalIndexFile, embedder: QueryEmbedder | null = null) {
    this.retriever = createRetriever(data, embedder)
  }

  get size(): number {
    return this.retriever.size
  }

  /** Store rỗng — dùng khi chưa chạy `pnpm index`. */
  static empty(embedder: QueryEmbedder | null = null): RetrievalStore {
    const emptyIndex: SerializedTermIndex = {
      totalDocuments: 0,
      totalTerms: 0,
      averageDocumentLength: 0,
      documentLengths: {},
      terms: {},
    }

    return new RetrievalStore(
      {
        version: 1,
        createdAt: new Date().toISOString(),
        embeddingModel: '',
        dimension: 0,
        chunks: [],
        bm25Unaccented: emptyIndex,
        bm25Accented: emptyIndex,
        embeddings: [],
      },
      embedder,
    )
  }

  /** Nạp index từ file. Trả `null` nếu file không tồn tại hoặc không hợp lệ. */
  static async load(
    indexPath: string,
    embedder: QueryEmbedder | null = null,
  ): Promise<RetrievalStore | null> {
    let raw: string
    try {
      raw = await readFile(indexPath, 'utf8')
    } catch {
      return null
    }

    let json: unknown
    try {
      json = JSON.parse(raw) as unknown
    } catch {
      return null
    }

    const parsed = parseRetrievalIndex(json)
    if (parsed === null) {
      return null
    }

    return new RetrievalStore(parsed, embedder)
  }

  async search(query: string, filters: SearchFilters = {}): Promise<SearchResult[]> {
    return this.retriever.search(query, filters)
  }
}
