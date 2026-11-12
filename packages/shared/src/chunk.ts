import { cleanText, estimateTokens, normalizeText } from './search/normalize.js'
import type { CrawledEntity } from './entities.js'

export type ChunkMetadata = {
  type: string
  id: string
  name: string
  /**
   * Chuyên khoa hiển thị. Mặc định là slug không dấu ("tim mach"); khi đã có
   * catalog thì `enrichSpecialtyLabels()` thay bằng tên thật ("Tim mạch").
   */
  specialty: string
  /** Khu vực hiển thị, ví dụ "Quận 1, TP.HCM". */
  area: string
  url: string
  /** Id gốc của các chuyên khoa liên quan — dùng để lọc. */
  specialtyIds: string[]
}

export type Chunk = {
  id: string
  text: string
  metadata: ChunkMetadata
}

/** Mỗi chunk tối đa ~500 token. */
export const MAX_CHUNK_TOKENS = 500

/** Tiền tố loại thực thể dùng trong id. */
const ENTITY_TYPE_PREFIXES = ['specialty', 'facility', 'doctor', 'service']

/**
 * Bỏ tiền tố loại và ký tự gạch nối: "specialty-tim-mach" → "tim mach".
 *
 * Id là slug không dấu nên nhãn suy ra được cũng không dấu — dùng
 * `enrichSpecialtyLabels()` để thay bằng tên thật khi đã có catalog.
 */
export function specialtyLabel(specialtyIds: string[]): string {
  return specialtyIds
    .map((id) => {
      const hasPrefix = ENTITY_TYPE_PREFIXES.some((prefix) => id.startsWith(`${prefix}-`))
      const withoutPrefix = hasPrefix ? id.replace(/^[a-z]+-/, '') : id
      return withoutPrefix.replace(/-/g, ' ').trim()
    })
    .filter((label) => label !== '')
    .join(', ')
}

/**
 * Thay nhãn chuyên khoa trong metadata bằng tên hiển thị thật
 * ("tim mach" → "Tim mạch") khi đã biết id → name.
 */
export function enrichSpecialtyLabels(
  chunks: Chunk[],
  nameById: Map<string, string>,
): Chunk[] {
  return chunks.map((chunk) => {
    if (chunk.metadata.specialtyIds.length === 0) {
      return chunk
    }

    const labels = chunk.metadata.specialtyIds.map(
      (id) => nameById.get(id) ?? specialtyLabel([id]),
    )

    return { ...chunk, metadata: { ...chunk.metadata, specialty: labels.join(', ') } }
  })
}

export function buildMetadata(entity: CrawledEntity): ChunkMetadata {
  const area =
    entity.type === 'facility' ? [entity.area, entity.city].filter((part) => part !== '').join(', ') : ''

  return {
    type: entity.type,
    id: entity.id,
    name: cleanText(entity.name),
    specialty: specialtyLabel(entity.specialtyIds),
    area: cleanText(area),
    url: entity.url,
    specialtyIds: entity.specialtyIds,
  }
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '')
}

/**
 * Mỗi thực thể là một chunk; mô tả dài được cắt thành nhiều chunk,
 * mỗi chunk không vượt quá `maxTokens` token và luôn kèm tên thực thể.
 */
export function chunkEntity(entity: CrawledEntity, maxTokens = MAX_CHUNK_TOKENS): Chunk[] {
  const metadata = buildMetadata(entity)
  const description = cleanText(entity.description)
  const prefix = metadata.area === '' ? metadata.name : `${metadata.name} — ${metadata.area}`

  if (description === '') {
    return [{ id: `${entity.id}#0`, text: prefix, metadata }]
  }

  // Câu quá dài được tách tiếp theo từ trước khi gom vào chunk.
  const pieces: string[] = []
  for (const sentence of splitSentences(description)) {
    if (estimateTokens(`${prefix}. ${sentence}`) > maxTokens) {
      pieces.push(...splitByWords(sentence, maxTokens, prefix))
    } else {
      pieces.push(sentence)
    }
  }

  const chunks: Chunk[] = []
  let current = ''

  for (const piece of pieces) {
    const candidate = current === '' ? piece : `${current} ${piece}`

    if (current !== '' && estimateTokens(`${prefix}. ${candidate}`) > maxTokens) {
      chunks.push({ id: `${entity.id}#${chunks.length}`, text: `${prefix}. ${current}`, metadata })
      current = piece
    } else {
      current = candidate
    }
  }

  if (current !== '') {
    chunks.push({ id: `${entity.id}#${chunks.length}`, text: `${prefix}. ${current}`, metadata })
  }

  return chunks
}

/** Tách một câu quá dài theo từ, để không chunk nào vượt quá `maxTokens`. */
function splitByWords(sentence: string, maxTokens: number, prefix: string): string[] {
  const parts: string[] = []
  let current = ''

  for (const word of sentence.split(' ')) {
    if (word === '') continue
    const candidate = current === '' ? word : `${current} ${word}`

    if (current !== '' && estimateTokens(`${prefix}. ${candidate}`) > maxTokens) {
      parts.push(current)
      current = word
    } else {
      current = candidate
    }
  }

  if (current !== '') {
    parts.push(current)
  }

  return parts
}

export function chunkEntities(entities: CrawledEntity[]): Chunk[] {
  return entities.flatMap((entity) => chunkEntity(entity))
}

/**
 * Khử trùng lặp ở mức chunk: cùng entity + cùng nội dung chuẩn hoá thì giữ 1.
 */
export function dedupeChunks(chunks: Chunk[]): Chunk[] {
  const seen = new Set<string>()
  const result: Chunk[] = []

  for (const chunk of chunks) {
    const key = `${chunk.metadata.id}::${normalizeText(chunk.text)}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(chunk)
  }

  return result
}
