import { describe, expect, it } from 'vitest'
import {
  buildTermIndex,
  chunkEntities,
  chunkToDocuments,
  serializeTermIndex,
  type CrawledEntity,
  type RetrievalIndexFile,
} from '@bookingcare/shared'
import { RetrievalStore } from './store.js'

const entities: CrawledEntity[] = [
  {
    type: 'facility',
    id: 'facility-bv-tim-mach',
    slug: 'bv-tim-mach',
    name: 'Bệnh viện Mẫu Đa khoa Hà Nội',
    description: 'Bệnh viện đa khoa tuyến trung, có khoa Tim mạch và Nội khoa.',
    url: 'https://bookingcare.vn/benh-vien/bv-tim-mach',
    specialtyIds: ['specialty-tim-mach', 'specialty-noi-khoa'],
    facilityType: 'hospital',
    address: '123 Lê Lợi',
    area: 'Ba Đình',
    city: 'Hà Nội',
    phone: '0241234567',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    type: 'facility',
    id: 'facility-pk-da-lieu',
    slug: 'pk-da-lieu',
    name: 'Phòng khám Mẫu Da liễu Đà Nẵng',
    description: 'Phòng khám chuyên khoa da liễu.',
    url: 'https://bookingcare.vn/phong-kham/pk-da-lieu',
    specialtyIds: ['specialty-da-lieu'],
    facilityType: 'clinic',
    address: '45 Trần Phú',
    area: 'Hải Châu',
    city: 'Đà Nẵng',
    phone: '',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    type: 'doctor',
    id: 'doctor-nguyen-van-an',
    slug: 'nguyen-van-an',
    name: 'Bác sĩ Mẫu Nguyễn Văn An',
    description: 'Bác sĩ chuyên khoa Tim mạch, 15 năm kinh nghiệm.',
    url: 'https://bookingcare.vn/bac-si/nguyen-van-an',
    specialtyIds: ['specialty-tim-mach'],
    title: 'Tiến sĩ',
    facilityIds: ['facility-bv-tim-mach'],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

function buildIndexFile(): RetrievalIndexFile {
  const chunks = chunkEntities(entities)
  const documents = chunkToDocuments(chunks)

  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    embeddingModel: '',
    dimension: 0,
    chunks,
    bm25Unaccented: serializeTermIndex(buildTermIndex(documents.unaccented)),
    bm25Accented: serializeTermIndex(buildTermIndex(documents.accented)),
    embeddings: [],
  }
}

describe('RetrievalStore', () => {
  it('trả kết quả khớp câu truy vấn', async () => {
    const store = new RetrievalStore(buildIndexFile())
    const hits = await store.search('bệnh viện tim mạch')

    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.id).toBe('facility-bv-tim-mach')
  })

  it('tìm được khi truy vấn không dấu', async () => {
    const store = new RetrievalStore(buildIndexFile())
    const hits = await store.search('bệnh vien tim mach')

    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.id).toBe('facility-bv-tim-mach')
  })

  it('lọc theo type', async () => {
    const store = new RetrievalStore(buildIndexFile())
    const hits = await store.search('mẫu', { type: 'doctor' })

    expect(hits).toHaveLength(1)
    expect(hits[0]?.type).toBe('doctor')
  })

  it('lọc theo specialty', async () => {
    const store = new RetrievalStore(buildIndexFile())
    const hits = await store.search('mẫu', { specialty: 'da lieu' })

    expect(hits).toHaveLength(1)
    expect(hits[0]?.id).toBe('facility-pk-da-lieu')
  })

  it('lọc theo area', async () => {
    const store = new RetrievalStore(buildIndexFile())
    const hits = await store.search('mẫu', { area: 'da nang' })

    expect(hits).toHaveLength(1)
    expect(hits[0]?.id).toBe('facility-pk-da-lieu')
  })

  it('giới hạn số kết quả theo k', async () => {
    const store = new RetrievalStore(buildIndexFile())
    const hits = await store.search('mẫu', { k: 1 })

    expect(hits).toHaveLength(1)
  })

  it('kết quả chỉ chứa field rút gọn', async () => {
    const store = new RetrievalStore(buildIndexFile())
    const hits = await store.search('tim mạch')
    const hit = hits[0]

    expect(hit).toBeDefined()
    expect(Object.keys(hit ?? {}).sort()).toEqual(
      ['area', 'id', 'name', 'score', 'snippet', 'specialty', 'type', 'url'].sort(),
    )
  })

  it('store rỗng trả về mảng rỗng', async () => {
    const store = RetrievalStore.empty()
    expect(store.size).toBe(0)
    expect(await store.search('tim mach')).toEqual([])
  })
})
