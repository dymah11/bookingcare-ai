import { describe, expect, it } from 'vitest'
import { buildDirectAnswer, detectIntent, findLongestMatch } from './intent.js'
import type { SearchResult } from '@bookingcare/shared'

const hits: SearchResult[] = [
  {
    id: 'facility-an-viet',
    type: 'facility',
    name: 'Bệnh viện Đa khoa An Việt',
    specialty: 'tim mạch',
    area: 'phường Tương Mai, Hà Nội',
    url: 'https://bookingcare.vn/benh-vien/an-viet',
    score: 1,
    snippet: 'Bệnh viện đa khoa',
  },
]

describe('detectIntent', () => {
  it('nhận diện câu hỏi tra cứu bệnh viện', () => {
    const intent = detectIntent('bệnh viện nào có khoa tim mạch ở hà nội')

    expect(intent.isSearch).toBe(true)
    expect(intent.type).toBe('facility')
  })

  it('nhận diện câu hỏi tra cứu bác sĩ', () => {
    expect(detectIntent('có bác sĩ nào chuyên khoa tim mạch không')).toEqual({
      type: 'doctor',
      isSearch: true,
    })
  })

  it('nhận diện câu hỏi về giá dịch vụ', () => {
    expect(detectIntent('gói khám nội khoa giá bao nhiêu')).toEqual({
      type: 'service',
      isSearch: true,
    })
  })

  it('không fast-path câu hỏi cần tư vấn lâm sàng', () => {
    expect(detectIntent('tôi đau ngực thì có phải bị tim mạch không').isSearch).toBe(false)
  })

  it('không fast-path câu hỏi hỏi nguyên nhân', () => {
    expect(detectIntent('tại sao bệnh viện này lại không nhận bảo hiểm').isSearch).toBe(false)
  })

  it('không fast-path câu hỏi chung chung', () => {
    expect(detectIntent('xin chào').isSearch).toBe(false)
  })
})

describe('findLongestMatch', () => {
  const specialties = ['Tim mạch', 'Cơ Xương Khớp', 'Nha khoa', 'Nội khoa']
  const cities = ['Hà Nội', 'Hồ Chí Minh', 'Đà Nẵng']

  it('nhận ra chuyên khoa trong câu hỏi', () => {
    const query = 'bệnh viện nào có khoa xương khớp ở thành phố hồ chí minh'

    expect(findLongestMatch(query, specialties)).toBe('Cơ Xương Khớp')
    expect(findLongestMatch(query, cities)).toBe('Hồ Chí Minh')
  })

  it('không khớp ứng viên thiếu token', () => {
    expect(findLongestMatch('bệnh viện tim mạch hà nội', ['Nha khoa'])).toBeUndefined()
  })

  it('không khớp khi câu hỏi không nhắc ứng viên nào', () => {
    expect(findLongestMatch('xin chào', specialties)).toBeUndefined()
  })
})

describe('buildDirectAnswer', () => {
  it('liệt kê kết quả kèm link nguồn', () => {
    const answer = buildDirectAnswer('bệnh viện tim mạch hà nội', 'facility', hits)

    expect(answer).toContain('Tìm thấy 1 cơ sở y tế')
    expect(answer).toContain('Bệnh viện Đa khoa An Việt')
    expect(answer).toContain('Chuyên khoa: tim mạch')
    expect(answer).toContain('Khu vực: phường Tương Mai, Hà Nội')
    expect(answer).toContain('https://bookingcare.vn/benh-vien/an-viet')
  })
})
