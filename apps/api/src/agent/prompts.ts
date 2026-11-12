import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SearchResult } from '@bookingcare/shared'

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

/**
 * Ngữ cảnh lấy sẵn bởi bước tiền truy xuất (BM25, không tốn request model).
 *
 * Mục đích: phần lớn câu hỏi tìm kiếm được trả lời thẳng từ ngữ cảnh này
 * → **1 request model** thay vì 2 (chọn tool + trả lời). Quan trọng vì quota
 * Gemini free tier chỉ 5 request/phút và 20 request/ngày.
 */
export function buildPreRetrievalBlock(hits: SearchResult[]): string {
  if (hits.length === 0) {
    return ''
  }

  const lines = hits.map(
    (hit, index) =>
      `${index + 1}. ${hit.name}${hit.specialty !== '' ? ` | ${hit.specialty}` : ''}${hit.area !== '' ? ` | ${hit.area}` : ''} | ${hit.url}`,
  )

  return lines.join('\n').slice(0, 4000)
}

/** Ghép system prompt với ngữ cảnh đã truy xuất sẵn. */
export function composeSystemPrompt(systemPrompt: string, preRetrieval: string): string {
  if (preRetrieval.trim() === '') {
    return systemPrompt
  }

  return `${systemPrompt}\n\n--- NGỮ CẢNH ĐÃ TRUY XUẤT SẴN ---\n${preRetrieval}`
}
