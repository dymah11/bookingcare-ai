import { describe, expect, it } from 'vitest'
import { parseCrawlArgs, parseType } from './cli.js'

describe('parseType', () => {
  it('nhận tên chuẩn', () => {
    expect(parseType('doctor')).toBe('doctor')
    expect(parseType('facility')).toBe('facility')
  })

  it('nhận bí danh số nhiều', () => {
    expect(parseType('doctors')).toBe('doctor')
    expect(parseType('facilities')).toBe('facility')
    expect(parseType('specialties')).toBe('specialty')
    expect(parseType('services')).toBe('service')
  })

  it('nhận bí danh tiếng Việt không dấu', () => {
    expect(parseType('bac-si')).toBe('doctor')
    expect(parseType('benh-vien')).toBe('facility')
    expect(parseType('co-so-y-te')).toBe('facility')
  })

  it('ném lỗi với loại không hợp lệ', () => {
    expect(() => parseType('xyz')).toThrow(/Loại thực thể không hợp lệ/)
  })
})

describe('parseCrawlArgs', () => {
  it('parse --type và --limit', () => {
    const options = parseCrawlArgs(['--type', 'doctors', '--limit', '50'])

    expect(options.types).toEqual(['doctor'])
    expect(options.limit).toBe(50)
    expect(options.refresh).toBe(false)
  })

  it('--all chọn cả 4 loại', () => {
    const options = parseCrawlArgs(['--all'])
    expect(options.types).toEqual(['specialty', 'facility', 'doctor', 'service'])
  })

  it('bỏ qua dấu -- ở đầu', () => {
    const options = parseCrawlArgs(['--', '--type', 'doctor'])
    expect(options.types).toEqual(['doctor'])
  })

  it('mặc định crawl cả 4 loại khi không truyền tham số', () => {
    const options = parseCrawlArgs([])
    expect(options.types).toHaveLength(4)
  })

  it('parse các tuỳ chọn còn lại', () => {
    const options = parseCrawlArgs([
      '--type',
      'facility',
      '--refresh',
      '--concurrency',
      '2',
      '--delay',
      '500',
      '--delay-max',
      '900',
      '--dry-run',
    ])

    expect(options.refresh).toBe(true)
    expect(options.concurrency).toBe(2)
    expect(options.delayMinMs).toBe(500)
    expect(options.delayMaxMs).toBe(900)
    expect(options.dryRun).toBe(true)
  })

  it('parse --probe', () => {
    const options = parseCrawlArgs(['--probe', 'https://bookingcare.vn/bac-si/abc'])
    expect(options.probeUrl).toBe('https://bookingcare.vn/bac-si/abc')
  })

  it('ném lỗi với tham số lạ', () => {
    expect(() => parseCrawlArgs(['--khong-co-that'])).toThrow(/Tham số không hợp lệ/)
  })

  it('ném lỗi khi --limit không phải số', () => {
    expect(() => parseCrawlArgs(['--limit', 'abc'])).toThrow(/--limit/)
  })

  it('dùng limit mặc định khi không truyền', () => {
    const options = parseCrawlArgs([], { limit: 42 })
    expect(options.limit).toBe(42)
  })
})
