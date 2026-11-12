import { config as loadDotenv } from 'dotenv'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createLogger,
  createRetriever,
  normalizeText,
  OpenAIEmbedder,
  parseRetrievalIndex,
  retrievalEvalFileSchema,
  RETRIEVAL_INDEX_FILENAME,
  type HybridRetriever,
  type RetrievalEvalCase,
  type RetrievalEvalExpected,
  type SearchResult,
} from '@bookingcare/shared'
import { findRepoRoot } from '@bookingcare/shared/node'
import { loadScriptConfig } from './config.js'

const TOP_K = 5

/** Kết quả rút gọn lưu trong báo cáo. */
type CaseHit = {
  id: string
  type: string
  name: string
  area: string
  specialty: string
  score: number
}

type CaseOutcome = {
  id: string
  query: string
  tags: string[]
  /** Vị trí (1-based) của từng đáp án mong đợi trong top-5; 0 = không tìm thấy. */
  ranks: number[]
  recallAt5: number
  reciprocalRank: number
  hits: CaseHit[]
}

/** Đáp án mong đợi khớp với kết quả khi tên (không dấu) chứa nhau hoặc id trùng. */
function matches(result: SearchResult, expected: RetrievalEvalExpected): boolean {
  if (expected.type !== undefined && normalizeText(expected.type) !== normalizeText(result.type)) {
    return false
  }

  if (expected.id !== undefined && result.id === expected.id) {
    return true
  }

  const resultName = normalizeText(result.name)
  const expectedName = normalizeText(expected.name)

  return expectedName !== '' && resultName.includes(expectedName)
}

async function evaluate(
  retriever: HybridRetriever,
  cases: RetrievalEvalCase[],
): Promise<CaseOutcome[]> {
  const outcomes: CaseOutcome[] = []

  for (const testCase of cases) {
    const hits = await retriever.search(testCase.query, { k: TOP_K })

    const ranks: number[] = []
    for (const expected of testCase.expected) {
      const position = hits.findIndex((hit) => matches(hit, expected))
      ranks.push(position === -1 ? 0 : position + 1)
    }

    const found = ranks.filter((rank) => rank > 0).length
    const firstRank = ranks.find((rank) => rank > 0) ?? 0

    outcomes.push({
      id: testCase.id,
      query: testCase.query,
      tags: testCase.tags,
      ranks,
      recallAt5: found / testCase.expected.length,
      reciprocalRank: firstRank === 0 ? 0 : 1 / firstRank,
      hits: hits.map((hit): CaseHit => ({
        id: hit.id,
        type: hit.type,
        name: hit.name,
        area: hit.area,
        specialty: hit.specialty,
        score: hit.score,
      })),
    })
  }

  return outcomes
}

async function main(): Promise<void> {
  const root = findRepoRoot(process.cwd())
  loadDotenv({ path: resolve(root, '.env') })

  const config = loadScriptConfig()
  const logger = createLogger({
    level: config.env.LOG_LEVEL,
    base: { service: 'scripts', script: 'eval-retrieval' },
  })

  // 1. Nạp index.
  const indexPath = resolve(config.processedDir, RETRIEVAL_INDEX_FILENAME)
  const raw = await readFile(indexPath, 'utf8').catch(() => null)
  if (raw === null) {
    logger.error('index_not_found', {
      file: indexPath,
      hint: 'Chạy "pnpm index" trước khi đánh giá retrieval',
    })
    process.exitCode = 1
    return
  }

  let json: unknown
  try {
    json = JSON.parse(raw) as unknown
  } catch {
    json = null
  }

  const index = parseRetrievalIndex(json)
  if (index === null) {
    logger.error('index_invalid', { file: indexPath })
    process.exitCode = 1
    return
  }

  // 2. Nạp bộ truy vấn đánh giá.
  const queriesPath = resolve(config.root, 'eval', 'retrieval-queries.json')
  const queriesRaw = await readFile(queriesPath, 'utf8').catch(() => null)
  if (queriesRaw === null) {
    logger.error('queries_not_found', { file: queriesPath })
    process.exitCode = 1
    return
  }

  const queriesJson = JSON.parse(queriesRaw) as unknown
  const parsedQueries = retrievalEvalFileSchema.safeParse(queriesJson)
  if (!parsedQueries.success) {
    logger.error('queries_invalid', {
      file: queriesPath,
      issues: parsedQueries.error.issues.map((issue) => issue.message),
    })
    process.exitCode = 1
    return
  }

  // 3. Embedding cho truy vấn (tùy chọn).
  const embedder =
    config.env.OPENAI_API_KEY.trim() === ''
      ? null
      : new OpenAIEmbedder({
          apiKey: config.env.OPENAI_API_KEY,
          model: config.env.EMBEDDING_MODEL,
        })

  const retriever = createRetriever(index, embedder)
  const outcomes = await evaluate(retriever, parsedQueries.data.queries)

  const recallAt5 =
    outcomes.length === 0
      ? 0
      : outcomes.reduce((total, outcome) => total + outcome.recallAt5, 0) / outcomes.length
  const mrr =
    outcomes.length === 0
      ? 0
      : outcomes.reduce((total, outcome) => total + outcome.reciprocalRank, 0) / outcomes.length

  const report = {
    createdAt: new Date().toISOString(),
    indexFile: indexPath,
    topK: TOP_K,
    mode: embedder === null ? 'bm25-only' : 'hybrid',
    embeddingModel: index.embeddingModel,
    total: outcomes.length,
    recallAt5,
    mrr,
    outcomes,
  }

  await mkdir(config.evalResultsDir, { recursive: true })
  const stamp = report.createdAt.replace(/[:.]/g, '-')
  const outputPath = resolve(config.evalResultsDir, `retrieval-${stamp}.json`)
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log('\n=== Đánh giá retrieval ===')
  console.log(`  Chế độ: ${report.mode}`)
  console.log(`  Số truy vấn: ${report.total}`)
  console.log(`  recall@${TOP_K}: ${(recallAt5 * 100).toFixed(1)}%`)
  console.log(`  MRR: ${mrr.toFixed(3)}`)
  console.log(`  Báo cáo: ${outputPath}`)

  for (const outcome of outcomes) {
    const found = outcome.ranks.filter((rank) => rank > 0).length
    console.log(
      `    ${outcome.id} (${outcome.ranks.join(',')}) recall=${outcome.recallAt5.toFixed(2)} — "${outcome.query}" [${found}/${outcome.ranks.length} tìm thấy]`,
    )
  }
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main().catch((error: unknown) => {
    console.error('Đánh giá retrieval thất bại:', error)
    process.exitCode = 1
  })
}
