import { describe, expect, it } from 'vitest'
import {
  buildEntityId,
  crawledEntityListSchema,
  crawledEntitySchema,
  dedupeEntities,
} from './entities.js'

const specialty = {
  type: 'specialty' as const,
  id: 'specialty-tim-mach',
  slug: 'tim-mach',
  name: 'Tim mạch',
  description: 'Chuyên khoa tim mạch',
  url: 'https://bookingcare.vn/chuyen-khoa/tim-mach',
  specialtyIds: ['specialty-tim-mach'],
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const facility = {
  type: 'facility' as const,
  id: 'facility-bv-1',
  slug: 'bv-1',
  name: 'Bệnh viện Đa khoa Trung ương',
  description: 'Bệnh viện đa khoa',
  url: 'https://bookingcare.vn/benh-vien/bv-1',
  specialtyIds: ['specialty-tim-mach'],
  facilityType: 'hospital' as const,
  address: '123 Đường Lê Lợi',
  area: 'Quận 1',
  city: 'TP.HCM',
  phone: '0281234567',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('crawledEntitySchema', () => {
  it('parse specialty hợp lệ', () => {
    const parsed = crawledEntitySchema.safeParse(specialty)
    expect(parsed.success).toBe(true)
  })

  it('parse facility hợp lệ', () => {
    const parsed = crawledEntitySchema.safeParse(facility)
    expect(parsed.success).toBe(true)
  })

  it('từ chối entity thiếu name', () => {
    const { name: _name, ...rest } = specialty
    expect(crawledEntitySchema.safeParse(rest).success).toBe(false)
  })

  it('từ chối url không hợp lệ', () => {
    expect(crawledEntitySchema.safeParse({ ...specialty, url: 'khong-phai-url' }).success).toBe(false)
  })

  it('parse danh sách entity', () => {
    const parsed = crawledEntityListSchema.safeParse([specialty, facility])
    expect(parsed.success).toBe(true)
  })
})

describe('buildEntityId', () => {
  it('gắn tiền tố loại thực thể', () => {
    expect(buildEntityId('doctor', 'abc')).toBe('doctor-abc')
  })
})

describe('dedupeEntities', () => {
  it('loại bỏ thực thể trùng tên và mô tả', () => {
    const duplicate = { ...specialty, id: 'specialty-tim-mach-2' }
    const result = dedupeEntities([specialty, duplicate])

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('specialty-tim-mach')
  })

  it('giữ lại thực thể khác tên', () => {
    const result = dedupeEntities([specialty, { ...specialty, name: 'Nội khoa' }])
    expect(result).toHaveLength(2)
  })

  it('so khớp không phân biệt dấu và hoa thường', () => {
    const result = dedupeEntities([specialty, { ...specialty, name: 'TIM MẠCH' }])
    expect(result).toHaveLength(1)
  })
})
