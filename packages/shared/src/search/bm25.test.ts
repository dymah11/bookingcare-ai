import { describe, expect, it } from 'vitest'
import { buildTermIndex, scoreQuery } from './bm25.js'
import { tokenize } from './normalize.js'

const documents = [
  { id: 'a', tokens: tokenize('bệnh viện tim mạch hà nội') },
  { id: 'b', tokens: tokenize('phòng khám da liễu hà nội') },
  { id: 'c', tokens: tokenize('bệnh viện nhi khoa hồ chí minh') },
]

describe('buildTermIndex / scoreQuery', () => {
  it('xếp hạng document chứa nhiều từ khóa hơn ở trên', () => {
    const index = buildTermIndex(documents)
    const scores = scoreQuery(index, tokenize('bệnh viện hà nội'))
    const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1])

    expect(ranked[0]?.[0]).toBe('a')
    expect(ranked.length).toBeGreaterThan(1)
  })

  it('chỉ trả về document có chứa từ khóa', () => {
    const index = buildTermIndex(documents)
    const scores = scoreQuery(index, tokenize('nhi khoa'))

    expect([...scores.keys()]).toEqual(['c'])
  })

  it('trả về rỗng khi index rỗng', () => {
    const index = buildTermIndex([])
    expect(scoreQuery(index, tokenize('tim mach')).size).toBe(0)
  })

  it('điểm luôn lớn hơn 0 với từ khóa có trong corpus', () => {
    const index = buildTermIndex(documents)
    const scores = scoreQuery(index, tokenize('tim mach'))

    for (const score of scores.values()) {
      expect(score).toBeGreaterThan(0)
    }
  })
})
