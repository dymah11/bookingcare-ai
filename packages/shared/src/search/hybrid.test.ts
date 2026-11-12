import { describe, expect, it } from 'vitest'
import { cosineSimilarity, rankByEmbedding, reciprocalRankFusion, RRF_K } from './hybrid.js'

describe('reciprocalRankFusion', () => {
  it('gộp điểm từ nhiều danh sách', () => {
    const fused = reciprocalRankFusion([
      ['a', 'b', 'c'],
      ['b', 'a'],
    ])

    expect(fused.get('a')).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 2), 6)
    expect(fused.get('b')).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1), 6)
  })

  it('thực thể xuất hiện ở nhiều danh sách được ưu tiên', () => {
    const fused = reciprocalRankFusion([
      ['a', 'b', 'c'],
      ['c', 'b', 'a'],
    ])

    const top = [...fused.entries()].sort((left, right) => right[1] - left[1])[0]
    expect(top?.[0]).toBe('b')
  })

  it('xử lý danh sách rỗng', () => {
    expect(reciprocalRankFusion([]).size).toBe(0)
  })
})

describe('cosineSimilarity', () => {
  it('vector giống nhau có điểm 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6)
  })

  it('vector vuông góc có điểm 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6)
  })

  it('vector rỗng trả 0', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })
})

describe('rankByEmbedding', () => {
  it('xếp hạng theo độ tương đồng', () => {
    const ids = ['a', 'b']
    const matrix = [
      [1, 0],
      [0, 1],
    ]

    expect(rankByEmbedding([1, 0], matrix, ids, 2)).toEqual(['a', 'b'])
  })

  it('giới hạn topK', () => {
    const ids = ['a', 'b', 'c']
    const matrix = [
      [1, 0],
      [0.9, 0.1],
      [0, 1],
    ]

    expect(rankByEmbedding([1, 0], matrix, ids, 2)).toHaveLength(2)
  })
})
