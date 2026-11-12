import type { Chunk } from '../chunk.js'
import type { IndexedDocument } from './bm25.js'
import { tokenize, tokenizeAccented } from './normalize.js'

/**
 * Tạo 2 bộ document cho BM25: một bộ token đã bỏ dấu, một bộ token giữ dấu.
 * Hai biến thể được soạn vào cùng một lần tìm kiếm lai.
 */
export function chunkToDocuments(chunks: Chunk[]): {
  accented: IndexedDocument[]
  unaccented: IndexedDocument[]
} {
  return {
    accented: chunks.map((chunk) => ({ id: chunk.id, tokens: tokenizeAccented(chunk.text) })),
    unaccented: chunks.map((chunk) => ({ id: chunk.id, tokens: tokenize(chunk.text) })),
  }
}
