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
/**
 * Các model KHÔNG phải chat (TTS, ảnh, embedding, video…).
 *
 * Chúng vẫn liệt kê `generateContent` trong `/v1beta/models` nên **không** được
 * lọc bằng `supportsChat` — phải lọc theo tên, nếu không agent sẽ gọi nhầm
 * (ví dụ `gemini-2.5-flash-preview-tts` → 400 "Thinking is not enabled").
 */
const NON_CHAT_MODEL_MARKERS = [
  'tts',
  'image',
  'imagen',
  'embedding',
  'veo',
  'audio',
  'aqa',
  'robotics',
]

export function isChatModelId(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  return !NON_CHAT_MODEL_MARKERS.some((marker) => lower.includes(marker))
}

/** Model có hỗ trợ suy luận (thinking) hay không. */
export function supportsThinking(modelId: string): boolean {
  if (!isChatModelId(modelId)) {
    return false
  }
  return /^gemini-(3|2\.5-(flash|pro))/i.test(modelId)
}

export function buildThinkingConfig(
  model: string,
  env: Env,
  maxOutputTokens = 500,
): Record<string, unknown> | undefined {
  // Model không hỗ trợ suy luận (TTS, image…) thì không được gửi thinkingConfig.
  if (!supportsThinking(model)) {
    return undefined
  }

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
  /** Các model dự phòng — thử lần lượt khi model chính lỗi tạm thời. */
  fallbackModels?: string[]
  /** Timeout cho 1 request (ms). */
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/** Timeout mặc định cho 1 request generateContent. */
export const GENERATE_CONTENT_TIMEOUT_MS = 60_000

/** Lỗi có thể thử model khác: quá tải, hết quota, model không còn dùng được. */
function isRetryableModelError(message: string): boolean {
  return /429|503|404|overloaded|unavailable|high demand|RESOURCE_EXHAUSTED|timeout/i.test(
    message,
  )
}

/**
 * Gọi Gemini `generateContent` qua REST và trả về phần text của ứng viên đầu.
 *
 * Có timeout (tránh treo khi model quá tải) và thử lần lượt qua chuỗi model
 * dự phòng.
 */
export async function generateContent(options: GenerateContentOptions): Promise<string> {
  const models = [options.model, ...(options.fallbackModels ?? [])]
  let lastError: unknown = new Error('Không có model nào khả dụng')

  for (const [index, model] of models.entries()) {
    try {
      return await generateContentOnce(model, options)
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)

      if (!isRetryableModelError(message) || index === models.length - 1) {
        throw error
      }
    }
  }

  throw lastError
}

async function generateContentOnce(
  model: string,
  options: GenerateContentOptions,
): Promise<string> {
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
    `${GEMINI_API_BASE}/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': options.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? GENERATE_CONTENT_TIMEOUT_MS),
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

/**
 * Danh sách model dự phòng.
 *
 * Nếu `GEMINI_MODEL_FALLBACKS` trống thì tự dò các model hỗ trợ chat bằng
 * `GET /v1beta/models` — lệnh này **không tốn quota**.
 */
export async function resolveFallbackModels(env: Env): Promise<string[]> {
  const configured = env.GEMINI_MODEL_FALLBACKS.split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '')

  if (configured.length > 0) {
    return configured
  }

  if (env.GEMINI_API_KEY.trim() === '') {
    return []
  }

  try {
    const models = await listModels(env.GEMINI_API_KEY)
    return models
      .filter((model) => model.supportsChat && model.id !== env.GEMINI_MODEL)
      .filter((model) => isChatModelId(model.id))
      .map((model) => model.id)
      .slice(0, 3)
  } catch {
    return []
  }
}
