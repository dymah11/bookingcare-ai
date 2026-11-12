import { z } from 'zod'
import type { Env } from './env.js'

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Tham số suy luận cho Gemini.
 *
 * Dòng Gemini 3+ nhận `thinkingConfig.thinkingLevel` (low | medium | high);
 * dòng Gemini 2.5 nhận `thinkingConfig.thinkingBudget` (số token).
 * Chọn theo tên model để không gửi tham số không hợp lệ.
 */
export function buildThinkingConfig(
  model: string,
  env: Env,
): Record<string, unknown> | undefined {
  if (/^gemini-3/i.test(model)) {
    return env.GEMINI_THINKING_LEVEL === undefined
      ? undefined
      : { thinkingConfig: { thinkingLevel: env.GEMINI_THINKING_LEVEL } }
  }

  return env.GEMINI_THINKING_BUDGET > 0
    ? { thinkingConfig: { thinkingBudget: env.GEMINI_THINKING_BUDGET } }
    : undefined
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
    ...(options.thinkingConfig ?? {}),
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
