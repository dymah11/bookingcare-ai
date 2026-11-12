export const BM25_K1 = 1.2
export const BM25_B = 0.75

export type IndexedDocument = {
  id: string
  tokens: string[]
}

export type TermStats = {
  documentFrequency: number
  postings: Map<string, number>
}

export type TermIndex = {
  totalDocuments: number
  totalTerms: number
  averageDocumentLength: number
  documentLengths: Map<string, number>
  terms: Map<string, TermStats>
}

/**
 * Dựng inverted index từ danh sách document đã tokenize hoá.
 */
export function buildTermIndex(documents: IndexedDocument[]): TermIndex {
  const terms = new Map<string, TermStats>()
  const documentLengths = new Map<string, number>()
  let totalTerms = 0

  for (const document of documents) {
    documentLengths.set(document.id, document.tokens.length)
    totalTerms += document.tokens.length

    const frequencies = new Map<string, number>()
    for (const token of document.tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
    }

    for (const [token, termFrequency] of frequencies) {
      const existing = terms.get(token)
      if (existing) {
        existing.documentFrequency += 1
        existing.postings.set(document.id, termFrequency)
      } else {
        terms.set(token, {
          documentFrequency: 1,
          postings: new Map([[document.id, termFrequency]]),
        })
      }
    }
  }

  const totalDocuments = documents.length
  const averageDocumentLength = totalDocuments === 0 ? 0 : totalTerms / totalDocuments

  return { totalDocuments, totalTerms, averageDocumentLength, documentLengths, terms }
}

/**
 * Chấm điểm BM25 cho một danh sách query token.
 * Trả về map `documentId -> score` (chỉ chứa document có điểm khác 0).
 */
export function scoreQuery(index: TermIndex, queryTokens: string[]): Map<string, number> {
  const scores = new Map<string, number>()
  if (index.totalDocuments === 0 || index.averageDocumentLength === 0) {
    return scores
  }

  for (const token of queryTokens) {
    const stats = index.terms.get(token)
    if (!stats || stats.documentFrequency === 0) continue

    const documentFrequency = stats.documentFrequency
    const idf = Math.log(1 + (index.totalDocuments - documentFrequency + 0.5) / (documentFrequency + 0.5))

    for (const [documentId, termFrequency] of stats.postings) {
      const documentLength = index.documentLengths.get(documentId) ?? 0
      const denominator =
        termFrequency + BM25_K1 * (1 - BM25_B + BM25_B * (documentLength / index.averageDocumentLength))
      const contribution = idf * ((termFrequency * (BM25_K1 + 1)) / denominator)
      scores.set(documentId, (scores.get(documentId) ?? 0) + contribution)
    }
  }

  return scores
}
