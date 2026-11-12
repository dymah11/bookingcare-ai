import { z } from 'zod'
import { normalizeText } from './search/normalize.js'

/**
 * Schema cho 4 loại thực thể crawl được từ bookingcare.vn.
 *
 * Mọi thực thể đều có `id`/`slug`/`name`/`description`/`url`/`specialtyIds`
 * để đồng nhất giữa các loại; phần riêng của từng loại nằm ở dưới.
 */
export const entityTypeSchema = z.enum(['specialty', 'facility', 'doctor', 'service'])

const baseEntityFields = {
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  url: z.string().url(),
  specialtyIds: z.array(z.string()).default([]),
  updatedAt: z.string().min(1),
}

export const specialtySchema = z.object({
  type: z.literal('specialty'),
  ...baseEntityFields,
  iconUrl: z.string().url().optional(),
})

export const facilitySchema = z.object({
  type: z.literal('facility'),
  ...baseEntityFields,
  facilityType: z.enum(['hospital', 'clinic', 'medical_center', 'unknown']).default('unknown'),
  address: z.string().default(''),
  area: z.string().default(''),
  city: z.string().default(''),
  phone: z.string().default(''),
})

export const doctorSchema = z.object({
  type: z.literal('doctor'),
  ...baseEntityFields,
  title: z.string().default(''),
  facilityIds: z.array(z.string()).default([]),
})

export const serviceSchema = z.object({
  type: z.literal('service'),
  ...baseEntityFields,
  facilityIds: z.array(z.string()).default([]),
  price: z.number().nonnegative().optional(),
  currency: z.string().default('VND'),
  priceNote: z.string().default(''),
})

export const crawledEntitySchema = z.discriminatedUnion('type', [
  specialtySchema,
  facilitySchema,
  doctorSchema,
  serviceSchema,
])

export const crawledEntityListSchema = z.array(crawledEntitySchema)

export type EntityType = z.infer<typeof entityTypeSchema>
export type SpecialtyEntity = z.infer<typeof specialtySchema>
export type FacilityEntity = z.infer<typeof facilitySchema>
export type DoctorEntity = z.infer<typeof doctorSchema>
export type ServiceEntity = z.infer<typeof serviceSchema>
export type CrawledEntity = z.infer<typeof crawledEntitySchema>

/** Tên file lưu trong `data/processed/`. */
export const ENTITY_FILE_NAMES: Record<EntityType, string> = {
  specialty: 'specialties',
  facility: 'facilities',
  doctor: 'doctors',
  service: 'services',
}

/** Danh sách field cần thống kê tỷ lệ thiếu, theo từng loại thực thể. */
export const ENTITY_FIELDS: Record<EntityType, string[]> = {
  specialty: ['description', 'specialtyIds', 'iconUrl'],
  facility: ['description', 'address', 'area', 'city', 'phone', 'specialtyIds'],
  doctor: ['description', 'title', 'facilityIds', 'specialtyIds'],
  service: ['description', 'price', 'facilityIds', 'specialtyIds'],
}

/** `id` chuẩn hoá: `<type>-<slug>`. */
export function buildEntityId(type: EntityType, slug: string): string {
  return `${type}-${slug}`
}

/**
 * Khử trùng lặp: hai thực thể có cùng loại + cùng tên + cùng mô tả (đã chuẩn
 * hoá) được coi là một.
 */
export function dedupeEntities(entities: CrawledEntity[]): CrawledEntity[] {
  const seen = new Set<string>()
  const result: CrawledEntity[] = []

  for (const entity of entities) {
    const key = [
      entity.type,
      normalizeText(entity.name),
      normalizeText(entity.description).slice(0, 300),
    ].join('::')

    if (seen.has(key)) continue
    seen.add(key)
    result.push(entity)
  }

  return result
}
