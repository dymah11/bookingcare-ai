import type { Chunk } from '../chunk.js'
import type { QueryEmbedder } from '../embeddings.js'
import { normalizeText, tokenize, tokenizeAccented } from './normalize.js'
import type { TermIndex } from './bm25.js'
import { scoreQuery } from './bm25.js'
import { rankByEmbedding, reciprocalRankFusion } from './hybrid.js'

export type SearchFilters = {
  type?: string
  specialty?: string
  area?: string
  k?: number
}

/** Kết quả đã rút gọn — chỉ còn field cần thiết cho UI/RAG. */
export type SearchResult = {
  id: string
  type: string
  name: string
  specialty: string
  area: string
  url: string
  score: number
  snippet: string
}

const SNIPPET_LENGTH = 220
const CANDIDATE_MULTIPLIER = 10
const MIN_CANDIDATES = 50

export type HybridRetrieverOptions = {
  chunks: Chunk[]
  bm25Unaccented: TermIndex
  bm25Accented: TermIndex
  embeddings: number[][]
  embedder?: QueryEmbedder | null
}

/**
 * Tìm kiếm lai: BM25 (bỏ dấu + có dấu) và embedding, gộp bằng RRF.
 *
 * Không phụ thuộc Node.js nên dùng được ở cả API lẫn script eval.
 */
export class HybridRetriever {
  private readonly chunks: Chunk[]
  private readonly chunkById: Map<string, Chunk>
  private readonly chunkIds: string[]
  private readonly bm25Unaccented: TermIndex
  private readonly bm25Accented: TermIndex
  private readonly embeddings: number[][]
  private readonly embedder: QueryEmbedder | null

  constructor(options: HybridRetrieverOptions) {
    this.chunks = options.chunks
    this.chunkIds = options.chunks.map((chunk) => chunk.id)
    this.chunkById = new Map(options.chunks.map((chunk) => [chunk.id, chunk]))
    this.bm25Unaccented = options.bm25Unaccented
    this.bm25Accented = options.bm25Accented
    this.embeddings = options.embeddings
    this.embedder = options.embedder ?? null
  }

  get size(): number {
    return this.chunks.length
  }

  async search(query: string, filters: SearchFilters = {}): Promise<SearchResult[]> {
    const k = filters.k ?? 5
    if (this.chunks.length === 0) {
      return []
    }

    const rankings: string[][] = [
      this.rankByScore(scoreQuery(this.bm25Unaccented, tokenize(query))),
      this.rankByScore(scoreQuery(this.bm25Accented, tokenizeAccented(query))),
    ]

    const embeddingRanking = await this.rankByEmbedding(query)
    if (embeddingRanking !== null) {
      rankings.push(embeddingRanking)
    }

    const fused = reciprocalRankFusion(rankings)
    const ranked = [...fused.entries()].sort((left, right) => right[1] - left[1])
    const candidates = ranked.slice(0, Math.max(k * CANDIDATE_MULTIPLIER, MIN_CANDIDATES))

    const results: SearchResult[] = []
    const seenEntities = new Set<string>()

    for (const [chunkId, score] of candidates) {
      const chunk = this.chunkById.get(chunkId)
      if (chunk === undefined) continue
      if (!matchesFilters(chunk, filters)) continue

      // Mỗi thực thể chỉ xuất hiện 1 lần dù có nhiều chunk.
      if (seenEntities.has(chunk.metadata.id)) continue
      seenEntities.add(chunk.metadata.id)

      results.push(toResult(chunk, score))
      if (results.length >= k) break
    }

    return results
  }

  private rankByScore(scores: Map<string, number>): string[] {
    return [...scores.entries()].sort((left, right) => right[1] - left[1]).map(([id]) => id)
  }

  private async rankByEmbedding(query: string): Promise<string[] | null> {
    if (this.embedder === null) return null
    if (this.embeddings.length === 0 || this.embeddings.length !== this.chunks.length) return null

    try {
      const vector = await this.embedder.embed(query)
      if (vector.length === 0) return null
      return rankByEmbedding(vector, this.embeddings, this.chunkIds, this.chunks.length)
    } catch {
      // Embedding lỗi → bỏ qua, vẫn trả kết quả từ BM25.
      return null
    }
  }
}

/** Bí danh loại thực thể: cơ sở y tế đều thuộc nhóm `facility`. */
const TYPE_ALIASES: Record<string, string> = {
  hospital: 'facility',
  hospitals: 'facility',
  'benh-vien': 'facility',
  clinic: 'facility',
  clinics: 'facility',
}

function normalizeType(value: string): string {
  const normalized = normalizeText(value)
  return TYPE_ALIASES[normalized] ?? normalized
}

export function matchesFilters(chunk: Chunk, filters: SearchFilters): boolean {
  if (filters.type !== undefined) {
    if (normalizeType(filters.type) !== normalizeType(chunk.metadata.type)) {
      return false
    }
  }

  if (filters.specialty !== undefined) {
    const needle = normalizeText(filters.specialty)
    const inLabel = normalizeText(chunk.metadata.specialty).includes(needle)
    const inIds = chunk.metadata.specialtyIds.some((id) => normalizeText(id).includes(needle))
    if (!inLabel && !inIds) return false
  }

  if (filters.area !== undefined) {
    if (!normalizeText(chunk.metadata.area).includes(normalizeText(filters.area))) {
      return false
    }
  }

  return true
}

function toResult(chunk: Chunk, score: number): SearchResult {
  return {
    id: chunk.metadata.id,
    type: chunk.metadata.type,
    name: chunk.metadata.name,
    specialty: chunk.metadata.specialty,
    area: chunk.metadata.area,
    url: chunk.metadata.url,
    score: Math.round(score * 1_000_000) / 1_000_000,
    snippet: chunk.text.slice(0, SNIPPET_LENGTH),
  }
}
