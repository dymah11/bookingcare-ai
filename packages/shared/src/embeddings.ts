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

/** Lỗi từ API Gemini — mang theo status để biết có nên retry hay không. */
export class GeminiApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GeminiApiError'
    this.status = status
  }
}

export type GeminiEmbedderOptions = {
  apiKey: string
  model?: string
  /** Số văn bản gửi mỗi request. */
  batchSize?: number
  /** Số embed-content được phép mỗi phút (free tier của Gemini là 100). */
  requestsPerMinute?: number
  /** Số lần thử lại khi gặp 429 hoặc 5xx. */
  maxRetries?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export class GeminiEmbedder implements QueryEmbedder {
  private readonly apiKey: string
  private readonly model: string
  private readonly batchSize: number
  private readonly requestsPerMinute: number
  private readonly maxRetries: number

  constructor(options: GeminiEmbedderOptions) {
    this.apiKey = options.apiKey
    this.model = options.model ?? DEFAULT_EMBEDDING_MODEL
    this.batchSize = options.batchSize ?? 20
    this.requestsPerMinute = options.requestsPerMinute ?? 100
    this.maxRetries = options.maxRetries ?? 4
  }

  async embed(text: string): Promise<number[]> {
    const [vector] = await this.embedMany([text])
    return vector ?? []
  }

  /**
   * Embed nhiều văn bản, giữ nhịp độ dưới quota và retry khi bị 429.
   *
   * Quota được tính theo **số văn bản** (`embed_content_free_tier_requests`),
   * không theo số HTTP request — nên nhịp được tính trên tổng số text.
   */
  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return []
    }

    const vectors: number[][] = []
    // Chừa 10% để không chạm trần quota.
    const perBatchDelayMs = (this.batchSize / (this.requestsPerMinute * 0.9)) * 60_000

    for (let index = 0; index < texts.length; index += this.batchSize) {
      const batch = texts.slice(index, index + this.batchSize)

      if (vectors.length > 0 && perBatchDelayMs > 0) {
        await sleep(perBatchDelayMs)
      }

      vectors.push(...(await this.embedBatchWithRetry(batch)))
    }

    return vectors
  }

  private async embedBatchWithRetry(texts: string[]): Promise<number[][]> {
    let lastError: unknown = new Error('Không xác định được lỗi embedding')

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.embedBatch(texts)
      } catch (error) {
        lastError = error

        const status = error instanceof GeminiApiError ? error.status : 0
        const retryable = status === 429 || status >= 500
        if (!retryable || attempt === this.maxRetries) {
          break
        }

        // 429 = vượt quota/phút → chờ lâu hơn trước khi thử lại.
        const backoffMs = status === 429 ? 15_000 * attempt : 2_000 * 2 ** (attempt - 1)
        await sleep(backoffMs)
      }
    }

    throw lastError
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
      throw new GeminiApiError(
        `Gemini embeddings lỗi (HTTP ${response.status}): ${detail.slice(0, 500)}`,
        response.status,
      )
    }

    const payload = (await response.json()) as unknown
    const parsed = batchEmbedResponseSchema.safeParse(payload)
    if (!parsed.success) {
      throw new GeminiApiError('Gemini embeddings trả về payload không đúng schema', 502)
    }

    return parsed.data.embeddings.map((item) => item.values)
  }
}
