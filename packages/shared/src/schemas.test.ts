import { describe, expect, it } from 'vitest'
import {
  bookingDraftInputSchema,
  chatRequestSchema,
  evalCaseSchema,
  retrievalEvalFileSchema,
  searchQuerySchema,
} from './schemas.js'

describe('chatRequestSchema', () => {
  it('mặc định history rỗng', () => {
    const parsed = chatRequestSchema.parse({ message: 'xin chào' })
    expect(parsed.history).toEqual([])
  })

  it('từ chối message rỗng', () => {
    expect(chatRequestSchema.safeParse({ message: '' }).success).toBe(false)
  })
})

describe('bookingDraftInputSchema', () => {
  it('yêu cầu date/time đúng định dạng', () => {
    const result = bookingDraftInputSchema.safeParse({
      specialtyId: 's',
      hospitalId: 'h',
      date: '01/01/2026',
      time: '9:00',
      patientName: 'Nguyễn An',
      patientPhone: '0900000000',
    })
    expect(result.success).toBe(false)
  })

  it('parse được draft hợp lệ', () => {
    const result = bookingDraftInputSchema.safeParse({
      specialtyId: 's',
      hospitalId: 'h',
      date: '2026-01-01',
      time: '09:30',
      patientName: 'Nguyễn An',
      patientPhone: '0900000000',
    })
    expect(result.success).toBe(true)
  })
})

describe('searchQuerySchema', () => {
  it('coerce topK', () => {
    const parsed = searchQuerySchema.parse({ q: 'tim mach', topK: '5' })
    expect(parsed.topK).toBe(5)
  })

  it('default topK khi không truyền', () => {
    const parsed = searchQuerySchema.parse({ q: 'tim mach' })
    expect(parsed.topK).toBe(5)
  })

  it('parse bộ lọc type/specialty/area', () => {
    const parsed = searchQuerySchema.parse({
      q: 'tim mach',
      type: 'facility',
      specialty: 'tim mach',
      area: 'ha noi',
    })
    expect(parsed.type).toBe('facility')
    expect(parsed.specialty).toBe('tim mach')
    expect(parsed.area).toBe('ha noi')
  })
})

describe('evalCaseSchema', () => {
  it('parse case tối thiểu', () => {
    const parsed = evalCaseSchema.parse({ id: 'case-1', question: 'Bệnh viện nào chuyên tim mạch?' })
    expect(parsed.expect.mustInclude).toEqual([])
    expect(parsed.tags).toEqual([])
  })
})

describe('retrievalEvalFileSchema', () => {
  it('parse file truy vấn đánh giá', () => {
    const parsed = retrievalEvalFileSchema.parse({
      version: 1,
      queries: [
        {
          id: 'rq-01',
          query: 'bệnh viện tim mạch',
          expected: [{ name: 'Bệnh viện Mẫu Tim mạch', type: 'facility' }],
        },
      ],
    })

    expect(parsed.queries).toHaveLength(1)
    expect(parsed.queries[0]?.expected[0]?.name).toBe('Bệnh viện Mẫu Tim mạch')
  })

  it('từ chối query không có đáp án mong đợi', () => {
    const result = retrievalEvalFileSchema.safeParse({
      version: 1,
      queries: [{ id: 'rq-01', query: 'abc', expected: [] }],
    })
    expect(result.success).toBe(false)
  })
})
