import { z } from 'zod'
import { GEMINI_API_BASE } from './gemini.js'

/**
 * Model embedding mặc định — đọc từ env `GEMINI_EMBEDDING_MODEL`.
 */
export const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001'

export type QueryEmbedder = {
  embed(text: string): Promise<number[]>
  embedMany(texts: string[]): Promise<number[][]>
}

const batchEmbedResponseSchema = z.object({
  embeddings: z.array(
    z.object({
      values: z.array(z.number()),
    }),
  ),
})

export type GeminiEmbedderOptions = {
  apiKey: string
  model?: string
  /** Số văn bản gửi mỗi request batch. */
  batchSize?: number
}

/**
 * Embedding qua Gemini REST API (không dùng SDK để kiểm soát payload).
 * Chỉ dùng `fetch` nên chạy được cả ở Node lẫn trình duyệt.
 */
export class GeminiEmbedder implements QueryEmbedder {
  private readonly apiKey: string
  private readonly model: string
  private readonly batchSize: number

  constructor(options: GeminiEmbedderOptions) {
    this.apiKey = options.apiKey
    this.model = options.model ?? DEFAULT_EMBEDDING_MODEL
    this.batchSize = options.batchSize ?? 100
  }

  async embed(text: string): Promise<number[]> {
    const [vector] = await this.embedMany([text])
    return vector ?? []
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return []
    }

    const vectors: number[][] = []

    for (let index = 0; index < texts.length; index += this.batchSize) {
      const batch = texts.slice(index, index + this.batchSize)
      vectors.push(...(await this.embedBatch(batch)))
    }

    return vectors
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${GEMINI_API_BASE}/models/${this.model}:batchEmbedContents`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${this.model}`,
          content: { parts: [{ text }] },
        })),
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `Gemini embeddings lỗi (HTTP ${response.status}): ${detail.slice(0, 500)}`,
      )
    }

    const payload = (await response.json()) as unknown
    const parsed = batchEmbedResponseSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('Gemini embeddings trả về payload không đúng schema')
    }

    return parsed.data.embeddings.map((item) => item.values)
  }
}
