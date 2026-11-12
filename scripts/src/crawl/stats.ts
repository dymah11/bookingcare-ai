import { ENTITY_FIELDS, type CrawledEntity, type EntityType } from '@bookingcare/shared'

export type FieldStat = {
  field: string
  present: number
  missing: number
  /** Tỷ lệ phần trăm bản ghi thiếu trường này. */
  missingPercent: number
}

export type TypeStats = {
  type: EntityType
  records: number
  fields: FieldStat[]
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

/**
 * Thống kê số bản ghi và tỷ lệ thiếu từng trường cho mỗi loại thực thể.
 */
export function computeTypeStats(type: EntityType, entities: CrawledEntity[]): TypeStats {
  const total = entities.length

  const fields = ENTITY_FIELDS[type].map((field) => {
    let present = 0

    for (const entity of entities) {
      const value = (entity as unknown as Record<string, unknown>)[field]
      if (isPresent(value)) {
        present += 1
      }
    }

    const missing = total - present
    return {
      field,
      present,
      missing,
      missingPercent: total === 0 ? 0 : Math.round((missing / total) * 1000) / 10,
    }
  })

  return { type, records: total, fields }
}

/** Bảng thống kê dạng text để in ra cuối CLI. */
export function formatStatsTable(allStats: TypeStats[]): string {
  const lines: string[] = []

  for (const stats of allStats) {
    lines.push(`  ${stats.type}: ${stats.records} bản ghi`)

    if (stats.records === 0) {
      lines.push('    (không có bản ghi)')
      continue
    }

    for (const field of stats.fields) {
      lines.push(
        `    - ${field.field}: có ${field.present}/${stats.records}, thiếu ${field.missing} (${field.missingPercent}%)`,
      )
    }
  }

  return lines.join('\n')
}
