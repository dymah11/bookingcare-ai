import { describe, expect, it } from 'vitest'
import {
  cleanText,
  collapseWhitespace,
  estimateTokens,
  normalizeAccented,
  normalizeText,
  stripDiacritics,
  stripHtml,
  toNfc,
  tokenize,
  tokenizeAccented,
} from './normalize.js'

describe('stripDiacritics', () => {
  it('bỏ dấu tiếng Việt', () => {
    expect(stripDiacritics('Tim mạch')).toBe('Tim mach')
    expect(stripDiacritics('Nhi khoa')).toBe('Nhi khoa')
  })

  it('xử lý chữ đ có dấu mũ', () => {
    expect(stripDiacritics('Đa khoa')).toBe('Da khoa')
  })
})

describe('toNfc', () => {
  it('đưa về dạng NFC', () => {
    expect(toNfc('Việt')).toBe('Việt')
    expect(toNfc('Việt').length).toBe(4)
  })
})

describe('stripHtml', () => {
  it('bỏ tag và giải mã entity', () => {
    expect(stripHtml('<p>Bệnh viện <b>A</b> &amp; B</p>')).toBe('Bệnh viện A & B')
  })

  it('bỏ nội dung script', () => {
    expect(stripHtml('<script>alert(1)</script><p>Chữ</p>')).toBe('Chữ')
  })
})

describe('collapseWhitespace', () => {
  it('gộp khoảng trắng và trim', () => {
    expect(collapseWhitespace('  a   b  ')).toBe('a b')
  })
})

describe('cleanText', () => {
  it('làm sạch hoàn toàn', () => {
    expect(cleanText('<p>  Bệnh   viện\n Đa khoa </p>')).toBe('Bệnh viện Đa khoa')
  })
})

describe('normalizeText', () => {
  it('chuẩn hoá về chữ thường và bỏ ký tự đặc biệt', () => {
    expect(normalizeText('Tim mạch — Viện!')).toBe('tim mach vien')
  })

  it('gộp khoảng trắng thừa', () => {
    expect(normalizeText('  tim    mach  ')).toBe('tim mach')
  })
})

describe('normalizeAccented', () => {
  it('giữ dấu nhưng bỏ ký tự đặc biệt', () => {
    expect(normalizeAccented('Tim mạch — Viện!')).toBe('tim mạch viện')
  })
})

describe('tokenize', () => {
  it('tách token không dấu', () => {
    expect(tokenize('Tim mạch')).toEqual(['tim', 'mach'])
  })

  it('trả về mảng rỗng cho chuỗi rỗng', () => {
    expect(tokenize('   ')).toEqual([])
  })
})

describe('tokenizeAccented', () => {
  it('tách token giữ dấu', () => {
    expect(tokenizeAccented('Tim mạch')).toEqual(['tim', 'mạch'])
  })
})

describe('estimateTokens', () => {
  it('ước lượng theo độ dài', () => {
    expect(estimateTokens('abc')).toBe(1)
    expect(estimateTokens('a'.repeat(30))).toBe(10)
  })
})
