import type { TermIndex } from './bm25.js'

/**
 * Dạng JSON của inverted index BM25 — dùng để lưu index ra file và nạp nhanh
 * lúc khởi động, không cần database ngoài.
 */
export type SerializedTermIndex = {
  totalDocuments: number
  totalTerms: number
  averageDocumentLength: number
  documentLengths: Record<string, number>
  terms: Record<string, { documentFrequency: number; postings: Record<string, number> }>
}

export function serializeTermIndex(index: TermIndex): SerializedTermIndex {
  const terms: SerializedTermIndex['terms'] = {}
  for (const [token, stats] of index.terms) {
    const postings: Record<string, number> = {}
    for (const [documentId, termFrequency] of stats.postings) {
      postings[documentId] = termFrequency
    }
    terms[token] = { documentFrequency: stats.documentFrequency, postings }
  }

  const documentLengths: Record<string, number> = {}
  for (const [documentId, length] of index.documentLengths) {
    documentLengths[documentId] = length
  }

  return {
    totalDocuments: index.totalDocuments,
    totalTerms: index.totalTerms,
    averageDocumentLength: index.averageDocumentLength,
    documentLengths,
    terms,
  }
}

export function deserializeTermIndex(data: SerializedTermIndex): TermIndex {
  const terms = new Map<string, { documentFrequency: number; postings: Map<string, number> }>()
  for (const [token, stats] of Object.entries(data.terms)) {
    const postings = new Map<string, number>()
    for (const [documentId, termFrequency] of Object.entries(stats.postings)) {
      postings.set(documentId, termFrequency)
    }
    terms.set(token, { documentFrequency: stats.documentFrequency, postings })
  }

  const documentLengths = new Map<string, number>()
  for (const [documentId, length] of Object.entries(data.documentLengths)) {
    documentLengths.set(documentId, length)
  }

  return {
    totalDocuments: data.totalDocuments,
    totalTerms: data.totalTerms,
    averageDocumentLength: data.averageDocumentLength,
    documentLengths,
    terms,
  }
}
