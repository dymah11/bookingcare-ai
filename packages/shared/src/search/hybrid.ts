/** Hằng số chuẩn của Reciprocal Rank Fusion. */
export const RRF_K = 60

/**
 * Gộp nhiều danh sách xếp hạng bằng Reciprocal Rank Fusion.
 *
 * Mỗi tài liệu ở hạng `r` trong một danh sách nhận điểm `1 / (k + r)`;
 * điểm cuối cùng là tổng của mọi danh sách.
 */
export function reciprocalRankFusion(rankings: string[][], k = RRF_K): Map<string, number> {
  const fused = new Map<string, number>()

  for (const ranking of rankings) {
    for (let index = 0; index < ranking.length; index += 1) {
      const id = ranking[index]
      if (id === undefined) continue
      const rank = index + 1
      fused.set(id, (fused.get(id) ?? 0) + 1 / (k + rank))
    }
  }

  return fused
}

/** Độ tương đồng cosine giữa 2 vector. */
export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length)
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0

  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    dot += a * b
    leftNorm += a * a
    rightNorm += b * b
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

/**
 * Xếp hạng id theo độ tương đồng cosine với vector truy vấn.
 * `ids` song song với `matrix` (mỗi hàng của matrix là 1 vector).
 */
export function rankByEmbedding(
  queryVector: number[],
  matrix: number[][],
  ids: string[],
  topK: number,
): string[] {
  const scored: { id: string; score: number }[] = []

  for (let index = 0; index < matrix.length; index += 1) {
    const vector = matrix[index]
    const id = ids[index]
    if (vector === undefined || id === undefined) continue
    scored.push({ id, score: cosineSimilarity(queryVector, vector) })
  }

  scored.sort((left, right) => right.score - left.score)
  return scored.slice(0, topK).map((item) => item.id)
}
