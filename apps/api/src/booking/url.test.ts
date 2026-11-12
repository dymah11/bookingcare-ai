import { describe, expect, it } from 'vitest'
import { buildBookingCareUrl } from './url.js'

const baseInput = {
  specialtyId: 'tim-mach',
  hospitalId: 'bv-1',
  date: '2026-01-01',
  time: '09:30',
  patientName: 'Nguyễn An',
  patientPhone: '0900000000',
}

describe('buildBookingCareUrl', () => {
  it('trả link sang bookingcare.vn kèm tham số lịch khám', () => {
    const url = buildBookingCareUrl('https://bookingcare.vn', { ...baseInput, doctorId: 'bs-9' })

    expect(url.startsWith('https://bookingcare.vn/tim-bam-kham?')).toBe(true)
    expect(url).toContain('chuyen_khoa=tim-mach')
    expect(url).toContain('benh_vien=bv-1')
    expect(url).toContain('bac_si=bs-9')
    expect(url).toContain('ngay_kham=2026-01-01')
    expect(url).toContain('gio_kham=09%3A30')
  })

  it('bỏ qua bac_si khi người dùng không chọn bác sĩ', () => {
    const url = buildBookingCareUrl('https://bookingcare.vn', baseInput)
    expect(url).not.toContain('bac_si=')
  })

  it('không tạo dấu gạch chéo kép ở cuối base url', () => {
    const url = buildBookingCareUrl('https://bookingcare.vn///', baseInput)
    expect(url.startsWith('https://bookingcare.vn/tim-bam-kham?')).toBe(true)
  })
})
