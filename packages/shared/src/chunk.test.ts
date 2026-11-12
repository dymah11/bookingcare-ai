import { describe, expect, it } from 'vitest'
import { estimateTokens } from './search/normalize.js'
import {
  chunkEntity,
  chunkEntities,
  dedupeChunks,
  enrichSpecialtyLabels,
  specialtyLabel,
} from './chunk.js'
import type { CrawledEntity } from './entities.js'

const facility: CrawledEntity = {
  type: 'facility',
  id: 'facility-bv-1',
  slug: 'bv-1',
  name: 'Bệnh viện Mẫu Đa khoa Hà Nội',
  description: 'Bệnh viện đa khoa tuyến trung. Khoa Tim mạch. Khoa Nội khoa.',
  url: 'https://bookingcare.vn/benh-vien/bv-1',
  specialtyIds: ['specialty-tim-mach', 'specialty-noi-khoa'],
  facilityType: 'hospital',
  address: '123 Lê Lợi',
  area: 'Ba Đình',
  city: 'Hà Nội',
  phone: '0241234567',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('specialtyLabel', () => {
  it('bỏ tiền tố loại và thay gạch nối (id là slug không dấu)', () => {
    expect(specialtyLabel(['specialty-tim-mach'])).toBe('tim mach')
  })

  it('ghép nhiều chuyên khoa', () => {
    expect(specialtyLabel(['specialty-tim-mach', 'specialty-noi-khoa'])).toBe('tim mach, noi khoa')
  })
})

describe('enrichSpecialtyLabels', () => {
  it('thay nhãn slug bằng tên thật khi biết id', () => {
    const chunk = chunkEntity(facility)[0]
    if (!chunk) throw new Error('chunk không tồn tại')

    const [enriched] = enrichSpecialtyLabels(
      [chunk],
      new Map([
        ['specialty-tim-mach', 'Tim mạch'],
        ['specialty-noi-khoa', 'Nội khoa'],
      ]),
    )

    expect(enriched?.metadata.specialty).toBe('Tim mạch, Nội khoa')
  })

  it('giữ nhãn slug khi không biết id', () => {
    const chunk = chunkEntity(facility)[0]
    if (!chunk) throw new Error('chunk không tồn tại')

    const [enriched] = enrichSpecialtyLabels([chunk], new Map())

    expect(enriched?.metadata.specialty).toBe('tim mach, noi khoa')
  })
})

describe('chunkEntity', () => {
  it('tạo 1 chunk khi mô tả ngắn', () => {
    const chunks = chunkEntity(facility)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.id).toBe('facility-bv-1#0')
  })

  it('metadata chứa type, id, tên, chuyên khoa, khu vực, url', () => {
    const chunk = chunkEntity(facility)[0]

    expect(chunk?.metadata.type).toBe('facility')
    expect(chunk?.metadata.id).toBe('facility-bv-1')
    expect(chunk?.metadata.name).toBe('Bệnh viện Mẫu Đa khoa Hà Nội')
    expect(chunk?.metadata.specialty).toBe('tim mach, noi khoa')
    expect(chunk?.metadata.area).toBe('Ba Đình, Hà Nội')
    expect(chunk?.metadata.url).toBe('https://bookingcare.vn/benh-vien/bv-1')
  })

  it('cắt mô tả dài thành nhiều chunk, mỗi chunk kèm tên', () => {
    const long: CrawledEntity = {
      ...facility,
      description: Array.from({ length: 400 }, (_, index) => `Câu ${index}.`).join(' '),
    }

    const chunks = chunkEntity(long)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.text).toContain('Bệnh viện Mẫu Đa khoa Hà Nội')
      expect(estimateTokens(chunk.text)).toBeLessThanOrEqual(500)
    }
  })

  it('tách câu quá dài theo từ', () => {
    const longWord: CrawledEntity = {
      ...facility,
      description: 'x '.repeat(2000),
    }

    const chunks = chunkEntity(longWord)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(estimateTokens(chunk.text)).toBeLessThanOrEqual(500)
    }
  })

  it('bỏ HTML trong mô tả', () => {
    const withHtml: CrawledEntity = {
      ...facility,
      description: '<p>Bệnh viện <b>đa khoa</b></p>',
    }

    const chunk = chunkEntity(withHtml)[0]
    expect(chunk?.text).not.toContain('<')
    expect(chunk?.text).toContain('Bệnh viện đa khoa')
  })

  it('thực thể không có mô tả vẫn tạo được chunk', () => {
    const noDescription: CrawledEntity = { ...facility, description: '' }
    const chunks = chunkEntity(noDescription)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.text).toContain('Bệnh viện Mẫu Đa khoa Hà Nội')
  })
})

describe('dedupeChunks', () => {
  it('loại chunk trùng nội dung', () => {
    const chunk = chunkEntity(facility)[0]
    if (!chunk) throw new Error('chunk không tồn tại')

    expect(dedupeChunks([chunk, { ...chunk }])).toHaveLength(1)
  })
})

describe('chunkEntities', () => {
  it('chunk cho nhiều thực thể', () => {
    expect(chunkEntities([facility, { ...facility, id: 'facility-bv-2' }])).toHaveLength(2)
  })
})
