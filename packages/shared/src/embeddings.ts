import { z } from 'zod'

/**
 * Model embedding mặc định — đọc từ env `EMBEDDING_MODEL`.
 */
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'

export type QueryEmbedder = {
  embed(text: string): Promise<number[]>
  embedMany(texts: string[]): Promise<number[][]>
}

const embeddingsResponseSchema = z.object({
  data: z
    .array(
      z.object({
        embedding: z.array(z.number()),
      }),
    )
    .min(1),
})

export type OpenAIEmbedderOptions = {
  apiKey: string
  model?: string
  /** Số văn bản gửi mỗi request (OpenAPI giới hạn theo batch). */
  batchSize?: number
}

/**
 * Embedding qua OpenAI REST API (không dùng SDK để kiểm soát payload).
 * Chỉ dùng `fetch` nên chạy được cả ở Node lẫn trình duyệt.
 */
export class OpenAIEmbedder implements QueryEmbedder {
  private readonly apiKey: string
  private readonly model: string
  private readonly batchSize: number

  constructor(options: OpenAIEmbedderOptions) {
    this.apiKey = options.apiKey
    this.model = options.model ?? DEFAULT_EMBEDDING_MODEL
    this.batchSize = options.batchSize ?? 64
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
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`OpenAI embeddings lỗi (HTTP ${response.status}): ${detail.slice(0, 500)}`)
    }

    const payload = (await response.json()) as unknown
    const parsed = embeddingsResponseSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('OpenAI embeddings trả về payload không đúng schema')
    }

    return parsed.data.data.map((item) => item.embedding)
  }
}
