import { z } from 'zod'
import type { Env } from './env.js'

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Tham số suy luận cho Gemini (phần trong `generationConfig`).
 *
 * Dòng Gemini 3+ nhận `thinkingLevel` — API nhận giá trị **viết HOA**:
 * `LOW` | `MEDIUM` | `HIGH`. Dòng Gemini 2.5 nhận `thinkingBudget` (số token).
 * Chọn theo tên model để không gửi tham số không hợp lệ.
 */
export function buildThinkingConfig(
  model: string,
  env: Env,
  maxOutputTokens = 500,
): Record<string, unknown> | undefined {
  if (/^gemini-3/i.test(model)) {
    return { thinkingLevel: env.GEMINI_THINKING_LEVEL.toUpperCase() }
  }

  // Gemini 2.5 yêu cầu thinkingBudget < maxOutputTokens, nên clamp theo budget output.
  const budget = Math.min(env.GEMINI_THINKING_BUDGET, Math.max(0, maxOutputTokens - 1))
  return budget > 0 ? { thinkingBudget: budget } : undefined
}

const generateContentResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string().default('') })),
        }),
      }),
    )
    .min(1),
})

const modelsResponseSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      displayName: z.string().optional(),
      supportedGenerationMethods: z.array(z.string()).optional(),
    }),
  ),
})

export type AvailableModel = {
  /** Id dùng được trong request, ví dụ "gemini-3.8-flash". */
  id: string
  displayName: string
  /** true nếu model hỗ trợ generateContent (tức dùng được cho chat). */
  supportsChat: boolean
  supportsEmbedding: boolean
}

/**
 * Liệt kê model mà key được cấp quyền.
 *
 * Gọi `GET /v1beta/models` **không tốn quota**, nên đây là cách nhanh nhất
 * để biết chính xác model id nào dùng được (thay vì đoán rồi ăn 404).
 */
export async function listModels(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AvailableModel[]> {
  const response = await fetchImpl(`${GEMINI_API_BASE}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': apiKey },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Gemini list models lỗi (HTTP ${response.status}): ${detail.slice(0, 500)}`,
    )
  }

  const payload = (await response.json()) as unknown
  const parsed = modelsResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('Gemini list models trả về payload không đúng schema')
  }

  return parsed.data.models.map((model) => {
    const methods = model.supportedGenerationMethods ?? []
    return {
      id: model.name.replace(/^models\//, ''),
      displayName: model.displayName ?? model.name.replace(/^models\//, ''),
      supportsChat: methods.includes('generateContent'),
      supportsEmbedding: methods.includes('embedContent'),
    }
  })
}

export type GenerateContentOptions = {
  apiKey: string
  model: string
  prompt: string
  systemInstruction?: string
  /** Ép model trả về JSON hợp lệ (`responseMimeType`). */
  json?: boolean
  temperature?: number
  maxOutputTokens?: number
  thinkingConfig?: Record<string, unknown>
  fetchImpl?: typeof fetch
}

/**
 * Gọi Gemini `generateContent` qua REST và trả về phần text của ứng viên đầu.
 */
export async function generateContent(options: GenerateContentOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch

  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature ?? 0,
    ...(options.json === true ? { responseMimeType: 'application/json' } : {}),
    ...(options.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: options.maxOutputTokens }),
    // `thinkingConfig` là object lồng bên trong `generationConfig`.
    ...(options.thinkingConfig === undefined
      ? {}
      : { thinkingConfig: options.thinkingConfig }),
  }

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
    generationConfig,
  }

  if (options.systemInstruction !== undefined) {
    body.systemInstruction = { parts: [{ text: options.systemInstruction }] }
  }

  const response = await fetchImpl(
    `${GEMINI_API_BASE}/models/${options.model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': options.apiKey,
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Gemini generateContent lỗi (HTTP ${response.status}): ${detail.slice(0, 500)}`,
    )
  }

  const payload = (await response.json()) as unknown
  const parsed = generateContentResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('Gemini generateContent trả về payload không đúng schema')
  }

  const parts = parsed.data.candidates[0]?.content.parts ?? []
  return parts.map((part) => part.text).join('')
}
