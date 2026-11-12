import { tokenize, type EntityType, type SearchResult } from '@bookingcare/shared'

/**
 * Tín hiệu cho biết câu hỏi là tra cứu danh sách (tìm bệnh viện, bác sĩ…).
 */
const SEARCH_SIGNALS: { type: EntityType; patterns: RegExp[] }[] = [
  {
    type: 'facility',
    patterns: [/bệnh viện/i, /phòng khám/i, /cơ sở y tế/i, /trung tâm/i, /bệnh viện nào/i],
  },
  { type: 'doctor', patterns: [/bác sĩ/i, /\bbs\.?\b/i, /thầy thuốc/i, /chuyên gia/i] },
  {
    type: 'service',
    patterns: [/gói khám/i, /dịch vụ khám/i, /giá khám/i, /khám bao nhiêu/i, /chi phí/i],
  },
  { type: 'specialty', patterns: [/chuyên khoa/i, /\bkhoa\b/i] },
]

/**
 * Câu hỏi cần suy luận / tư vấn — không nên trả lời bằng fast path.
 */
const CONVERSATIONAL_SIGNALS: RegExp[] = [
  /tại sao/i,
  /làm sao/i,
  /có phải/i,
  /có nên/i,
  /nên tôi/i,
  /tôi bị/i,
  /triệu chứng/i,
  /chẩn đoán/i,
  /kê đơn/i,
  /thuốc/i,
  /đau/i,
  /sốt/i,
  /tư vấn/i,
  /giải thích/i,
  /so sánh/i,
  /khác nhau/i,
  /\?$/,
]

export type Intent = {
  /** Loại thực thể nghi ngờ, nếu có. */
  type?: EntityType
  /** Câu hỏi chỉ cần tra cứu danh sách. */
  isSearch: boolean
}

/**
 * Đoán ý định của câu hỏi bằng heuristic (không tốn request model).
 *
 * Mục đích: nhận diện câu hỏi tra cứu để trả lời thẳng từ index, bỏ qua
 * vòng gọi model — vì quota Gemini free tier chỉ 5 request/phút, 20/ngày.
 */
export function detectIntent(message: string): Intent {
  if (CONVERSATIONAL_SIGNALS.some((pattern) => pattern.test(message))) {
    return { isSearch: false }
  }

  for (const signal of SEARCH_SIGNALS) {
    if (signal.patterns.some((pattern) => pattern.test(message))) {
      return { type: signal.type, isSearch: true }
    }
  }

  return { isSearch: false }
}

const TYPE_LABELS: Record<EntityType, string> = {
  facility: 'cơ sở y tế',
  doctor: 'bác sĩ',
  service: 'dịch vụ khám',
  specialty: 'chuyên khoa',
}

/**
 * Tìm ứng viên khớp với câu hỏi.
 *
 * So khớp theo **token**: mọi token của ứng viên phải xuất hiện trong câu
 * hỏi (không phân biệt dấu/hoa thường). Ứng viên dài hơn thắng.
 *
 * Nhờ vậy "bệnh viện nào có khoa **xương khớp** ở thành phố **hồ chí minh**"
 * lọc đúng chuyên khoa "Cơ Xương Khớp" và khu vực "Hồ Chí Minh", thay vì
 * trả về mọi cơ sở ở TP.HCM.
 */
export function findLongestMatch(
  query: string,
  candidates: string[],
): string | undefined {
  const queryTokens = new Set(tokenize(query))
  let best: string | undefined
  let bestSize = 0

  for (const candidate of candidates) {
    const tokens = tokenize(candidate).filter((token) => token !== '')
    if (tokens.length === 0) continue

    const matched = tokens.filter((token) => queryTokens.has(token)).length
    if (matched !== tokens.length) continue

    if (tokens.length > bestSize) {
      best = candidate
      bestSize = tokens.length
    }
  }

  return best
}

/**
 * Câu trả lời dựng sẵn từ kết quả truy xuất — không cần model.
 */
export function buildDirectAnswer(
  query: string,
  type: EntityType,
  hits: SearchResult[],
): string {
  const label = TYPE_LABELS[type]
  const lines: string[] = [`Tìm thấy ${hits.length} ${label} phù hợp với "${query}":`, '']

  hits.forEach((hit, index) => {
    lines.push(`${index + 1}. ${hit.name}`)
    if (hit.specialty !== '') lines.push(`   Chuyên khoa: ${hit.specialty}`)
    if (hit.area !== '') lines.push(`   Khu vực: ${hit.area}`)
    lines.push(`   ${hit.url}`)
    lines.push('')
  })

  lines.push('Nếu cần đặt lịch, hãy cho mình biết bệnh viện/bác sĩ, ngày, giờ, họ tên và số điện thoại.')
  lines.push('Nguồn: bookingcare.vn')

  return lines.join('\n')
}
