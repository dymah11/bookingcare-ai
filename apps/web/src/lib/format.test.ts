import { describe, expect, it } from 'vitest'
import { formatDateTime, formatPrice, truncate } from './format'

describe('formatPrice', () => {
  it('định dạng giá bằng VND', () => {
    expect(formatPrice(150000)).toContain('150.000')
  })

  it('trả chuỗi rỗng khi không có giá', () => {
    expect(formatPrice(undefined)).toBe('')
  })
})

describe('formatDateTime', () => {
  it('trả về chuỗi gốc khi ngày không hợp lệ', () => {
    expect(formatDateTime('khong-phai-ngay')).toBe('khong-phai-ngay')
  })

  it('định dạng ngày hợp lệ', () => {
    expect(formatDateTime('2026-01-01T09:30:00.000Z')).toContain('2026')
  })
})

describe('truncate', () => {
  it('giữ nguyên chuỗi ngắn', () => {
    expect(truncate('ngắn')).toBe('ngắn')
  })

  it('cắt chuỗi dài', () => {
    expect(truncate('a'.repeat(200), 10)).toHaveLength(10)
  })
})
