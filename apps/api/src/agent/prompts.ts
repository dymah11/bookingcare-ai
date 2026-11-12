import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * System prompt nằm ở file riêng: `apps/api/prompts/system.vi.md`.
 *
 * Đường dẫn được tính từ `import.meta.dirname` nên đúng cả khi chạy từ `src/`
 * (tsx) lẫn từ `dist/` sau khi build — hai thư mục cùng độ sâu.
 */
const PROMPT_PATH = resolve(import.meta.dirname, '../../prompts/system.vi.md')

const FALLBACK_PROMPT = `Bạn là trợ lý ảo của BookingCare. Chỉ trả lời dựa trên dữ liệu truy xuất từ bookingcare.vn, không chẩn đoán bệnh, không kê đơn thuốc. Trả lời bằng tiếng Việt ngắn gọn.`

let cached: string | null = null

export function loadSystemPrompt(): string {
  if (cached !== null) {
    return cached
  }

  try {
    cached = readFileSync(PROMPT_PATH, 'utf8').trim()
    return cached
  } catch {
    // Không chặn API: dùng prompt tối thiểu và ghi cảnh báo.
    console.error(`Không đọc được system prompt tại ${PROMPT_PATH}`)
    cached = FALLBACK_PROMPT
    return cached
  }
}

export function systemPromptPath(): string {
  return PROMPT_PATH
}
