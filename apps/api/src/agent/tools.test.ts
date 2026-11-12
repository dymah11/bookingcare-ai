import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLogger } from '@bookingcare/shared'
import { BookingDraftStore } from '../booking/drafts.js'
import { EntityCatalog } from '../retrieval/catalog.js'
import { RetrievalStore } from '../retrieval/store.js'
import { SessionStore } from './session.js'
import { createBookingDraftTool, type ToolContext } from './tools.js'

async function buildContext(): Promise<ToolContext> {
  const dir = await mkdtemp(join(tmpdir(), 'bookingcare-agent-'))
  const session = new SessionStore().get('test-session')

  return {
    store: RetrievalStore.empty(),
    catalog: new EntityCatalog([]),
    drafts: new BookingDraftStore({
      filePath: join(dir, 'booking-drafts.json'),
      baseUrl: 'https://bookingcare.vn',
    }),
    logger: createLogger({ level: 'error', sink: () => undefined }),
    session,
    cards: [],
    bookings: [],
  }
}

const baseInput = {
  service_or_doctor: 'Khám tim mạch',
  patient_name: 'Nguyễn Văn A',
  patient_phone: '0901234567',
  preferred_date: '2026-12-01',
  preferred_time: '09:00',
}

describe('create_booking_draft', () => {
  it('báo thiếu thông tin khi chưa đủ họ tên, ngày, giờ', async () => {
    const ctx = await buildContext()
    const tool = createBookingDraftTool(ctx)

    const output = await tool.run({ service_or_doctor: 'Khám tim mạch' })

    expect(output).toContain('Còn thiếu thông tin')
    expect(ctx.bookings).toHaveLength(0)
  })

  it('chưa tạo draft khi confirm=false — chỉ xin xác nhận', async () => {
    const ctx = await buildContext()
    const tool = createBookingDraftTool(ctx)

    const output = await tool.run(baseInput)

    expect(output).toContain('xác nhận')
    expect(ctx.bookings).toHaveLength(0)
    expect(ctx.session.pendingBooking).not.toBeNull()
  })

  it('tạo draft + mã booking khi confirm=true', async () => {
    const ctx = await buildContext()
    const tool = createBookingDraftTool(ctx)

    const output = await tool.run({ ...baseInput, confirm: true })

    expect(output).toContain('BC-')
    expect(ctx.bookings).toHaveLength(1)
    expect(ctx.bookings[0]?.url).toContain('bookingcare.vn')
    expect(ctx.session.pendingBooking).toBeNull()
  })

  it('từ chối ngày sai định dạng', async () => {
    const ctx = await buildContext()
    const tool = createBookingDraftTool(ctx)

    const output = await tool.run({ ...baseInput, preferred_date: '01/12/2026', confirm: true })

    expect(output).toContain('chưa đúng định dạng')
    expect(ctx.bookings).toHaveLength(0)
  })
})
