import { describe, expect, it } from 'vitest'
import type { CrawledEntity } from '@bookingcare/shared'
import { computeTypeStats, formatStatsTable } from './stats.js'

const base = {
  id: 'facility-bv-1',
  slug: 'bv-1',
  name: 'Bệnh viện A',
  description: 'Mô tả',
  url: 'https://bookingcare.vn/benh-vien/bv-1',
  specialtyIds: ['specialty-tim-mach'],
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const entities: CrawledEntity[] = [
  {
    type: 'facility',
    ...base,
    facilityType: 'hospital',
    address: '123 Lê Lợi',
    area: 'Quận 1',
    city: 'TP.HCM',
    phone: '0281234567',
  },
  {
    type: 'facility',
    ...base,
    id: 'facility-bv-2',
    slug: 'bv-2',
    name: 'Phòng khám B',
    description: '',
    facilityType: 'clinic',
    address: '',
    area: '',
    city: '',
    phone: '',
  },
]

describe('computeTypeStats', () => {
  it('tính số bản ghi và tỷ lệ thiếu trường', () => {
    const stats = computeTypeStats('facility', entities)

    expect(stats.records).toBe(2)

    const address = stats.fields.find((field) => field.field === 'address')
    expect(address?.present).toBe(1)
    expect(address?.missing).toBe(1)
    expect(address?.missingPercent).toBe(50)

    const description = stats.fields.find((field) => field.field === 'description')
    expect(description?.missingPercent).toBe(50)
  })

  it('xử lý danh sách rỗng', () => {
    const stats = computeTypeStats('facility', [])
    expect(stats.records).toBe(0)
    expect(stats.fields.every((field) => field.missingPercent === 0)).toBe(true)
  })
})

describe('formatStatsTable', () => {
  it('in ra bảng thống kê dạng text', () => {
    const table = formatStatsTable([computeTypeStats('facility', entities)])
    expect(table).toContain('facility: 2 bản ghi')
    expect(table).toContain('address')
  })
})
