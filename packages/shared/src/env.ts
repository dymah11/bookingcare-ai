import { z } from 'zod'

/**
 * Schema cho toàn bộ biến môi trường.
 *
 * Không có API key nào được hardcode: giá trị rỗng được coi là "chưa cấu hình"
 * và ứng dụng vẫn khởi động được (chỉ chức năng cần key mới báo lỗi khi gọi).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  WEB_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  /** API key của Google AI Studio / Gemini. Một key dùng cho cả 3 vai trò. */
  GEMINI_API_KEY: z.string().default(''),
  /** Model trợ lý hội thoại. */
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  /** Model judge dùng khi chấm chất lượng. */
  GEMINI_JUDGE_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  /** Model embedding cho tìm kiếm lai (BM25 + vector). */
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default('gemini-embedding-001'),
  /**
   * Mức reasoning cho dòng Gemini 3+ (`thinkingConfig.thinkingLevel`).
   * Bỏ trống nếu model của bạn là dòng 2.5 — dùng `GEMINI_THINKING_BUDGET`.
   */
  GEMINI_THINKING_LEVEL: z.enum(['low', 'medium', 'high']).optional(),
  /**
   * Ngân sách suy luận cho dòng Gemini 2.5 (`thinkingConfig.thinkingBudget`).
   * `0` = tắt suy luận.
   */
  GEMINI_THINKING_BUDGET: z.coerce.number().int().min(0).default(1024),
  /** Số lượt hội thoại gần nhất được giữ nguyên văn trong lịch sử. */
  CHAT_HISTORY_TURNS: z.coerce.number().int().min(1).max(50).default(6),

  DATA_DIR: z.string().min(1).default('./data'),
  BOOKINGCARE_BASE_URL: z.string().url().default('https://bookingcare.vn'),

  CRAWL_MAX_PAGES: z.coerce.number().int().min(1).default(200),
  CRAWL_USER_AGENT: z.string().min(1).default('bookingcare-ai/0.1'),
  /** Số request đồng thời — giữ nhỏ để không gây tải cho website nguồn. */
  CRAWL_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  /** Delay tối thiểu giữa 2 request (ms). */
  CRAWL_DELAY_MIN_MS: z.coerce.number().int().min(0).default(1000),
  /** Delay tối đa giữa 2 request (ms). */
  CRAWL_DELAY_MAX_MS: z.coerce.number().int().min(0).default(2000),
  /** Thời gian chờ thêm cho trang render bằng JS (ms). */
  CRAWL_SETTLE_MS: z.coerce.number().int().min(0).default(800),
  CRAWL_RETRIES: z.coerce.number().int().min(1).max(10).default(3),
  CRAWL_BACKOFF_MS: z.coerce.number().int().min(0).default(800),
  CRAWL_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
  CRAWL_HEADLESS: z.enum(['true', 'false']).default('true'),
})

export type Env = z.infer<typeof envSchema>

/**
 * Parse env từ một object bất kỳ (thường là `process.env`).
 *
 * Chuỗi rỗng bị loại bỏ để `z.coerce.number()` không biến `""` thành `0`
 * và để `.default()` có tác dụng đúng như mong muốn.
 */
export function loadEnv(source: Record<string, string | undefined> = {}): Env {
  const cleaned: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') {
      cleaned[key] = value.trim()
    }
  }

  const result = envSchema.safeParse(cleaned)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new Error(`Cấu hình môi trường không hợp lệ — ${issues}`)
  }
  return result.data
}
