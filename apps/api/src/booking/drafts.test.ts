import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BookingDraftStore } from './drafts.js'

async function createStore(): Promise<BookingDraftStore> {
  const dir = await mkdtemp(join(tmpdir(), 'bookingcare-drafts-'))
  return new BookingDraftStore({
    filePath: join(dir, 'booking-drafts.json'),
    baseUrl: 'https://bookingcare.vn',
  })
}

const validInput = {
  specialtyId: 'tim-mach',
  hospitalId: 'bv-1',
  date: '2026-01-01',
  time: '09:30',
  patientName: 'Nguyễn An',
  patientPhone: '0900000000',
}

describe('BookingDraftStore', () => {
  it('tạo draft và sinh link bookingcare.vn', async () => {
    const store = await createStore()
    const draft = await store.create(validInput)

    expect(draft.status).toBe('draft')
    expect(draft.id).toBeTruthy()
    expect(draft.bookingcareUrl).toContain('https://bookingcare.vn/tim-bam-kham?')
    expect(draft.bookingcareUrl).toContain('ngay_kham=2026-01-01')
  })

  it('lưu draft xuống file và list lại được', async () => {
    const store = await createStore()
    await store.create(validInput)
    await store.create({ ...validInput, hospitalId: 'bv-2' })

    const drafts = await store.list()
    expect(drafts).toHaveLength(2)

    const found = await store.get(drafts[0]?.id ?? '')
    expect(found?.input.hospitalId).toBe('bv-1')
  })

  it('từ chối input không hợp lệ', async () => {
    const store = await createStore()
    await expect(store.create({ ...validInput, date: '01-01-2026' })).rejects.toThrow()
  })

  it('file lưu được ghi ra disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bookingcare-drafts-'))
    const filePath = join(dir, 'booking-drafts.json')
    const store = new BookingDraftStore({ filePath, baseUrl: 'https://bookingcare.vn' })

    await store.create(validInput)

    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw) as unknown
    expect(Array.isArray(parsed)).toBe(true)
    expect((parsed as unknown[]).length).toBe(1)
  })
})
