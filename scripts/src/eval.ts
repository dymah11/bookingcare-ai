import { config as loadDotenv } from 'dotenv'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { createLogger, evalCaseSchema, type EvalCase } from '@bookingcare/shared'
import { findRepoRoot, readJsonl } from '@bookingcare/shared/node'
import { loadScriptConfig } from './config.js'
import {
  judgeBatch,
  keywordCheck,
  type JudgeBatchItem,
  type JudgeBatchVerdict,
} from './lib/judge.js'

/** Ràng buộc lượt hội thoại trong CLAUDE.md. */
const MAX_AVG_DURATION_MS = 10_000
const MAX_INPUT_TOKENS = 30_000
const MAX_OUTPUT_TOKENS = 500

const chatResponseSchema = z.object({
  answer: z.string().default(''),
  cards: z
    .array(
      z.object({
        title: z.string(),
        area: z.string().default(''),
        specialty: z.string().default(''),
      }),
    )
    .default([]),
  usage: z
    .object({
      inputTokens: z.number().default(0),
      outputTokens: z.number().default(0),
      durationMs: z.number().default(0),
      toolRounds: z.number().default(0),
      toolsUsed: z.array(z.string()).default([]),
    })
    .default({ inputTokens: 0, outputTokens: 0, durationMs: 0, toolRounds: 0, toolsUsed: [] }),
})

type CaseResult = {
  id: string
  question: string
  tags: string[]
  answer: string
  cards: { title: string; area: string; specialty: string }[]
  durationMs: number
  inputTokens: number
  outputTokens: number
  keyword: { passed: boolean; missing: string[]; leaked: string[] }
  judge: { score: number; passed: boolean; reason: string }
  passed: boolean
  error?: string
}

async function loadCases(casesDir: string): Promise<EvalCase[]> {
  const files = await readdir(casesDir).catch(() => [] as string[])
  const cases: EvalCase[] = []

  for (const file of files.filter((name) => name.endsWith('.jsonl'))) {
    const rows = await readJsonl<unknown>(resolve(casesDir, file)).catch(() => [] as unknown[])
    for (const row of rows) {
      const parsed = evalCaseSchema.safeParse(row)
      if (parsed.success) cases.push(parsed.data)
    }
  }

  return cases
}

type AssistantUsage = z.infer<typeof chatResponseSchema>['usage']

async function callAssistant(
  baseUrl: string,
  question: string,
): Promise<{ answer: string; cards: CaseResult['cards']; usage: AssistantUsage }> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: question }),
  })

  if (!response.ok) {
    throw new Error(`API trả HTTP ${response.status}`)
  }

  const payload = (await response.json()) as unknown
  const parsed = chatResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('API trả về payload không đúng schema')
  }

  return { answer: parsed.data.answer, cards: parsed.data.cards, usage: parsed.data.usage }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[index] ?? 0
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function buildMarkdownReport(summary: EvalSummary): string {
  const lines: string[] = []

  lines.push('# Báo cáo chất lượng phản hồi — trợ lý BookingCare')
  lines.push('')
  lines.push(`- Thời điểm chạy: ${summary.createdAt}`)
  lines.push(`- Model trợ lý: \`${summary.model}\``)
  lines.push(`- Model judge: \`${summary.judgeModel}\``)
  lines.push(`- Số test case: **${summary.total}**`)
  lines.push('')

  lines.push('## 1. Tổng quan')
  lines.push('')
  lines.push('| Chỉ số | Giá trị | Ràng buộc | Đạt? |')
  lines.push('| --- | --- | --- | --- |')
  lines.push(
    `| Tỉ lệ đạt | ${(summary.passRate * 100).toFixed(1)}% | — | — |`,
  )
  lines.push(
    `| Thời gian phản hồi TB | ${summary.avgDurationMs.toFixed(0)} ms | ≤ ${MAX_AVG_DURATION_MS} ms | ${summary.avgDurationMs <= MAX_AVG_DURATION_MS ? '✅' : '❌'} |`,
  )
  lines.push(
    `| Thời gian p95 | ${summary.p95DurationMs.toFixed(0)} ms | — | — |`,
  )
  lines.push(
    `| Thời gian max | ${summary.maxDurationMs.toFixed(0)} ms | — | — |`,
  )
  lines.push(
    `| Input token / lượt (TB) | ${summary.avgInputTokens.toFixed(0)} | ≤ ${MAX_INPUT_TOKENS} | ${summary.avgInputTokens <= MAX_INPUT_TOKENS ? '✅' : '❌'} |`,
  )
  lines.push(
    `| Input token / lượt (max) | ${summary.maxInputTokens} | ≤ ${MAX_INPUT_TOKENS} | ${summary.maxInputTokens <= MAX_INPUT_TOKENS ? '✅' : '❌'} |`,
  )
  lines.push(
    `| Output token / lượt (TB) | ${summary.avgOutputTokens.toFixed(0)} | ≤ ${MAX_OUTPUT_TOKENS} | ${summary.avgOutputTokens <= MAX_OUTPUT_TOKENS ? '✅' : '❌'} |`,
  )
  lines.push(
    `| Output token / lượt (max) | ${summary.maxOutputTokens} | ≤ ${MAX_OUTPUT_TOKENS} | ${summary.maxOutputTokens <= MAX_OUTPUT_TOKENS ? '✅' : '❌'} |`,
  )
  lines.push('')

  lines.push('## 2. Kết quả theo nhóm')
  lines.push('')
  lines.push('| Nhóm | Số case | Đạt | Tỉ lệ | Thời gian TB | Token in TB | Token out TB |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const group of summary.byTag) {
    lines.push(
      `| ${group.tag} | ${group.total} | ${group.passed} | ${(group.passRate * 100).toFixed(0)}% | ${group.avgDurationMs.toFixed(0)} ms | ${group.avgInputTokens.toFixed(0)} | ${group.avgOutputTokens.toFixed(0)} |`,
    )
  }
  lines.push('')

  lines.push('## 3. Kiểm tra từ khoá (không cần model)')
  lines.push('')
  lines.push(`- Đạt: ${summary.keywordPassed}/${summary.total}`)
  lines.push(`- Trôi từ khoá bị cấm: ${summary.keywordLeakTotal} lượt`)
  lines.push(`- Thiếu từ khoá bắt buộc: ${summary.keywordMissingTotal} lượt`)
  lines.push('')

  lines.push('## 4. Đánh giá LLM-as-judge')
  lines.push('')
  lines.push(`- Điểm trung bình: **${summary.avgJudgeScore.toFixed(3)}**`)
  lines.push(`- Judge đạt: ${summary.judgePassed}/${summary.total}`)
  if (summary.judgeErrors > 0) {
    lines.push(
      `- ⚠️ ${summary.judgeErrors} case **không chấm được** vì judge lỗi (hết quota / model quá tải) — xem lý do ở mục 5`,
    )
  }
  lines.push('')

  if (summary.failed.length > 0) {
    lines.push('## 5. Các case chưa đạt')
    lines.push('')
    for (const item of summary.failed) {
      lines.push(`### ${item.id} — ${item.question}`)
      lines.push('')
      lines.push(`- Nhóm: ${item.tags.join(', ') || '(không có)'}`)
      lines.push(`- Lý do: ${item.judge.reason || '(không có)'}`)
      if (item.keyword.missing.length > 0) {
        lines.push(`- Thiếu từ khoá: ${item.keyword.missing.join(', ')}`)
      }
      if (item.keyword.leaked.length > 0) {
        lines.push(`- Trôi từ khoá cấm: ${item.keyword.leaked.join(', ')}`)
      }
      lines.push(`- Trả lời: ${item.answer.slice(0, 400).replace(/\n/g, ' ')}`)
      lines.push('')
    }
  }

  lines.push('---')
  lines.push('')
  lines.push('Báo cáo sinh tự động bởi `pnpm eval`.')
  lines.push('Case chấm điểm bằng LLM judge theo lô, kiểm tra từ khoá chạy song song.')
  lines.push('')

  return lines.join('\n')
}

type EvalSummary = {
  createdAt: string
  model: string
  judgeModel: string
  total: number
  passed: number
  passRate: number
  avgDurationMs: number
  p95DurationMs: number
  maxDurationMs: number
  avgInputTokens: number
  maxInputTokens: number
  avgOutputTokens: number
  maxOutputTokens: number
  keywordPassed: number
  keywordLeakTotal: number
  keywordMissingTotal: number
  /** Số case không gọi được API (lỗi mạng/server). */
  errors: number
  judgePassed: number
  /** Số case không chấm được vì judge lỗi (quota/quá tải). */
  judgeErrors: number
  avgJudgeScore: number
  byTag: {
    tag: string
    total: number
    passed: number
    passRate: number
    avgDurationMs: number
    avgInputTokens: number
    avgOutputTokens: number
  }[]
  failed: CaseResult[]
}

/** Kiểm tra API còn sống trước khi chạy hàng trăm case. */
async function checkApi(baseUrl: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      return { ok: false, detail: `API trả HTTP ${response.status}` }
    }
    return { ok: true, detail: 'API sẵn sàng' }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

/** Đọc tham số `--tag <tag>` (có thể lặp lại) để chạy eval theo nhóm. */
function parseTagFilters(argv: string[]): string[] {
  const tags: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--tag') {
      const value = argv[index + 1]
      index += 1
      if (value !== undefined && value !== '') tags.push(value)
    }
  }

  return tags
}

async function main(): Promise<void> {
  const root = findRepoRoot(process.cwd())
  loadDotenv({ path: resolve(root, '.env') })

  const config = loadScriptConfig()
  const logger = createLogger({
    level: config.env.LOG_LEVEL,
    base: { service: 'scripts', script: 'eval' },
  })

  const allCases = await loadCases(resolve(config.root, 'eval', 'cases'))
  const tagFilters = parseTagFilters(process.argv.slice(2))
  const cases =
    tagFilters.length === 0
      ? allCases
      : allCases.filter((testCase) => testCase.tags.some((tag) => tagFilters.includes(tag)))

  if (cases.length === 0) {
    logger.error('no_eval_cases', {
      dir: resolve(config.root, 'eval', 'cases'),
      tagFilters,
      total: allCases.length,
    })
    process.exitCode = 1
    return
  }

  logger.info('eval_started', {
    cases: cases.length,
    total: allCases.length,
    tagFilters,
    apiBaseUrl: config.env.API_BASE_URL,
  })

  // Không có API thì mọi case sẽ lỗi "fetch failed" và báo cáo ra toàn số 0 —
  // báo rõ ngay từ đầu.
  const health = await checkApi(config.env.API_BASE_URL)
  if (!health.ok) {
    logger.error('api_unreachable', {
      apiBaseUrl: config.env.API_BASE_URL,
      detail: health.detail,
    })
    console.error(`\n✗ Không gọi được API tại ${config.env.API_BASE_URL} — ${health.detail}`)
    console.error('  Hãy chạy `pnpm dev:api` ở terminal khác rồi chạy lại `pnpm eval`.')
    process.exitCode = 1
    return
  }

  const results: CaseResult[] = []

  for (const testCase of cases) {
    const startedAt = Date.now()
    const durationMs = Date.now() - startedAt

    try {
      const response = await callAssistant(config.env.API_BASE_URL, testCase.question)
      const measuredMs = Date.now() - startedAt

      // Kiểm tra từ khoá áp cho cả câu trả lời lẫn thẻ kết quả — người dùng
      // thấy cả hai, nên judge cũng phải thấy cả hai.
      const haystack = [response.answer, ...response.cards.map((card) => card.title)].join('\n')
      const keyword = keywordCheck({
        question: testCase.question,
        answer: haystack,
        sources: response.cards.map((card) => ({ title: card.title, url: '' })),
        expectedKeywords: testCase.expect.mustInclude,
        forbiddenKeywords: testCase.expect.mustNotInclude,
      })

      results.push({
        id: testCase.id,
        question: testCase.question,
        tags: testCase.tags,
        answer: response.answer,
        cards: response.cards,
        durationMs: measuredMs,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        keyword,
        judge: { score: 0, passed: false, reason: 'chưa chấm' },
        passed: false,
      })
    } catch (error) {
      results.push({
        id: testCase.id,
        question: testCase.question,
        tags: testCase.tags,
        answer: '',
        cards: [],
        durationMs,
        inputTokens: 0,
        outputTokens: 0,
        keyword: { passed: false, missing: [], leaked: [] },
        judge: { score: 0, passed: false, reason: 'lỗi khi gọi API' },
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logger.info('eval_answered', { cases: results.length })

  // --- Chấm điểm bằng LLM judge, gộp nhiều case / 1 request (tiết kiệm quota) ---
  const batchItems: JudgeBatchItem[] = results.map((result) => ({
    id: result.id,
    question: result.question,
    answer: result.answer,
    results: result.cards.map((card) => ({
      title: card.title,
      area: card.area,
      specialty: card.specialty,
    })),
    expected: [],
    forbidden: [],
  }))

  let verdicts: JudgeBatchVerdict[] = []
  if (config.env.GEMINI_API_KEY.trim() !== '') {
    try {
      verdicts = await judgeBatch(batchItems, { env: config.env })
    } catch (error) {
      logger.error('judge_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  } else {
    logger.warn('judge_skipped', { reason: 'Thiếu GEMINI_API_KEY' })
  }

  const verdictById = new Map(verdicts.map((verdict) => [verdict.id, verdict]))

  for (const result of results) {
    const verdict = verdictById.get(result.id)
    if (verdict) result.judge = verdict
    result.passed = result.keyword.passed && result.judge.passed && result.error === undefined
  }

  // --- Tổng hợp ---
  const durations = results.map((result) => result.durationMs)
  const inputTokens = results.map((result) => result.inputTokens)
  const outputTokens = results.map((result) => result.outputTokens)

  const tags = [...new Set(results.flatMap((result) => result.tags))]
  const byTag = tags.map((tag) => {
    const group = results.filter((result) => result.tags.includes(tag))
    return {
      tag,
      total: group.length,
      passed: group.filter((result) => result.passed).length,
      passRate:
        group.length === 0
          ? 0
          : group.filter((result) => result.passed).length / group.length,
      avgDurationMs: average(group.map((result) => result.durationMs)),
      avgInputTokens: average(group.map((result) => result.inputTokens)),
      avgOutputTokens: average(group.map((result) => result.outputTokens)),
    }
  })

  const summary: EvalSummary = {
    createdAt: new Date().toISOString(),
    model: config.env.GEMINI_MODEL,
    judgeModel: config.env.GEMINI_JUDGE_MODEL,
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    passRate:
      results.length === 0 ? 0 : results.filter((result) => result.passed).length / results.length,
    avgDurationMs: average(durations),
    p95DurationMs: percentile(durations, 95),
    maxDurationMs: durations.length === 0 ? 0 : Math.max(...durations),
    avgInputTokens: average(inputTokens),
    maxInputTokens: inputTokens.length === 0 ? 0 : Math.max(...inputTokens),
    avgOutputTokens: average(outputTokens),
    maxOutputTokens: outputTokens.length === 0 ? 0 : Math.max(...outputTokens),
    keywordPassed: results.filter((result) => result.keyword.passed).length,
    keywordLeakTotal: results.reduce((total, result) => total + result.keyword.leaked.length, 0),
    keywordMissingTotal: results.reduce((total, result) => total + result.keyword.missing.length, 0),
    errors: results.filter((result) => result.error !== undefined).length,
    judgePassed: results.filter((result) => result.judge.passed).length,
    judgeErrors: results.filter((result) => result.judge.reason.startsWith('Judge lỗi')).length,
    avgJudgeScore: average(results.map((result) => result.judge.score)),
    byTag,
    failed: results.filter((result) => !result.passed),
  }

  await mkdir(config.evalResultsDir, { recursive: true })
  const stamp = summary.createdAt.replace(/[:.]/g, '-')
  const jsonPath = resolve(config.evalResultsDir, `eval-${stamp}.json`)
  const mdPath = resolve(config.evalResultsDir, `eval-${stamp}.md`)

  await writeFile(jsonPath, `${JSON.stringify({ ...summary, results }, null, 2)}\n`, 'utf8')
  await writeFile(mdPath, buildMarkdownReport(summary), 'utf8')

  console.log('\n=== Báo cáo đánh giá trợ lý ===')
  console.log(`  Số case:            ${summary.total}`)
  console.log(`  Đạt:                ${summary.passed}/${summary.total} (${(summary.passRate * 100).toFixed(1)}%)`)
  if (summary.errors > 0) {
    console.log(`  Lỗi gọi API:        ${summary.errors} case`)
  }
  console.log(`  Thời gian TB:        ${summary.avgDurationMs.toFixed(0)} ms (p95 ${summary.p95DurationMs.toFixed(0)} ms)`)
  console.log(`  Input token TB:      ${summary.avgInputTokens.toFixed(0)} (max ${summary.maxInputTokens})`)
  console.log(`  Output token TB:     ${summary.avgOutputTokens.toFixed(0)} (max ${summary.maxOutputTokens})`)
  console.log(`  Điểm judge TB:       ${summary.avgJudgeScore.toFixed(3)}`)
  if (summary.judgeErrors > 0) {
    console.log(`  Judge lỗi:          ${summary.judgeErrors} case (xem mục "case chưa đạt" trong báo cáo)`)
  }
  console.log(`  Báo cáo JSON:        ${jsonPath}`)
  console.log(`  Báo cáo Markdown:    ${mdPath}`)
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main().catch((error: unknown) => {
    console.error('Đánh giá thất bại:', error)
    process.exitCode = 1
  })
}
