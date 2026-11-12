import { describe, expect, it } from 'vitest'
import { keywordCheck, parseVerdict } from './judge.js'

describe('keywordCheck', () => {
  const base = {
    question: 'Bệnh viện nào chuyên tim mạch?',
    answer: 'Bệnh viện X có chuyên khoa tim mạch.',
    sources: [],
    expectedKeywords: ['tim mạch'],
    forbiddenKeywords: ['chẩn đoán'],
  }

  it('đạt khi có đủ từ khoá bắt buộc và không có từ khoá cấm', () => {
    const result = keywordCheck(base)
    expect(result.passed).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.leaked).toEqual([])
  })

  it('báo thiếu từ khoá bắt buộc', () => {
    const result = keywordCheck({ ...base, expectedKeywords: ['tim mạch', 'Hà Nội'] })
    expect(result.passed).toBe(false)
    expect(result.missing).toEqual(['Hà Nội'])
  })

  it('phát hiện từ khoá cấm', () => {
    const result = keywordCheck({ ...base, forbiddenKeywords: ['chẩn đoán'] })
    expect(result.passed).toBe(true)
  })
})

describe('parseVerdict', () => {
  it('parse JSON của judge', () => {
    const verdict = parseVerdict('kết quả: {"score":0.8,"passed":true,"reason":"ổn"}')
    expect(verdict.score).toBeCloseTo(0.8)
    expect(verdict.passed).toBe(true)
    expect(verdict.reason).toBe('ổn')
  })

  it('trả về verdict thất bại khi không có JSON', () => {
    const verdict = parseVerdict('không có json')
    expect(verdict.passed).toBe(false)
    expect(verdict.score).toBe(0)
  })

  it('trả về verdict thất bại khi JSON sai schema', () => {
    const verdict = parseVerdict('{"score": 5, "passed": "yes"}')
    expect(verdict.passed).toBe(false)
  })
})
