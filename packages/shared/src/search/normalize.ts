// Dấu thanh/dấu phụ trong tiếng Việt là các "mark" Unicode (property `M`).
// Bỏ toàn bộ mark sau khi decompose NFD sẽ cho "tím mạch" -> "tim mach".
const COMBINING_MARKS = /\p{M}/gu
const NON_ALNUM = /[^a-z0-9\s]/g
const NON_ALNUM_KEEP_DIACRITICS = /[^\p{L}\p{N}\s]/gu
const WHITESPACE = /\s+/g
const HTML_BLOCKS = /<(script|style)[\s\S]*?<\/\1>/gi
const HTML_TAGS = /<[^>]+>/g
const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
}

/** Chuẩn hoá Unicode về dạng NFC (dấu tổ hợp → dấu dựng sẵn). */
export function toNfc(input: string): string {
  return input.normalize('NFC')
}

/** Bỏ thẻ HTML (kể cả script/style) và giải mã entity cơ bản. */
export function stripHtml(input: string): string {
  const withoutBlocks = input.replace(HTML_BLOCKS, ' ').replace(HTML_TAGS, ' ')
  return withoutBlocks.replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity)
}

export function collapseWhitespace(input: string): string {
  return input.replace(WHITESPACE, ' ').trim()
}

/**
 * Làm sạch text thô: NFC → bỏ HTML → gộp khoảng trắng.
 * Áp dụng cho mọi dữ liệu đầu vào từ crawl trước khi index.
 */
export function cleanText(input: string): string {
  return collapseWhitespace(stripHtml(toNfc(input)))
}

/**
 * Bỏ dấu tiếng Việt. `NFD` không tách được chữ `đ`, nên xử lý riêng.
 */
export function stripDiacritics(input: string): string {
  return toNfc(input)
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

/**
 * Chuẩn hoá về chữ thường, chỉ giữ chữ/số và khoảng trắng, đã bỏ dấu.
 * Cho phép so khớp "Tim mach" với "tim mạch".
 */
export function normalizeText(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(NON_ALNUM, ' ')
    .replace(WHITESPACE, ' ')
    .trim()
}

/**
 * Chuẩn hoá nhưng **giữ dấu** — dùng cho biến thể BM25 "có dấu".
 */
export function normalizeAccented(input: string): string {
  return toNfc(input)
    .toLowerCase()
    .replace(NON_ALNUM_KEEP_DIACRITICS, ' ')
    .replace(WHITESPACE, ' ')
    .trim()
}

export function tokenize(input: string): string[] {
  const normalized = normalizeText(input)
  return normalized === '' ? [] : normalized.split(' ')
}

export function tokenizeAccented(input: string): string[] {
  const normalized = normalizeAccented(input)
  return normalized === '' ? [] : normalized.split(' ')
}

/**
 * Ước lượng số token.
 *
 * Tiếng Việt dài hơn tiếng Anh theo ký tự, nên dùng ~3 ký tự/token.
 * Đây là heuristic để cắt chunk, không phải tokenizer thật.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3)
}
