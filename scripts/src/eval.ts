import { config as loadDotenv } from 'dotenv'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { createLogger, evalCaseSchema, type EvalCase } from '@bookingcare/shared'
import { findRepoRoot, readJsonl } from '@bookingcare/shared/node'
import { loadScriptConfig } from './config.js'
import { judgeWithModel, keywordCheck, type JudgeSource, type JudgeVerdict } from './lib/judge.js'

/** Ràng buộc lượt hội thoại trong CLAUDE.md. */
const MAX_AVG_DURATION_MS = 10_000
const MAX_INPUT_TOKENS = 30_000
const MAX_OUTPUT_TOKENS = 500

const chatResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).default([]),
  usage: z
    .object({
      inputTokens: z.number().default(0),
      outputTokens: z.number().default(0),
    })
    .optional(),
})

type CaseResult = {
  id: string
  question: string
  answer: string
  sources: JudgeSource[]
  durationMs: number
  inputTokens: number
  outputTokens: number
  keyword: ReturnType<typeof keywordCheck>
  judge: JudgeVerdict
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
      if (parsed.success) {
        cases.push(parsed.data)
      }
    }
  }

  return cases
}

async function callAssistant(
  baseUrl: string,
  question: string,
): Promise<{ answer: string; sources: JudgeSource[]; inputTokens: number; outputTokens: number }> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: question, history: [] }),
  })

  if (!response.ok) {
    throw new Error(`API lỗi (HTTP ${response.status})`)
  }

  const payload = (await response.json()) as unknown
  const parsed = chatResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('API trả về payload không đúng schema')
  }

  return {
    answer: parsed.data.answer,
    sources: parsed.data.sources,
    inputTokens: parsed.data.usage?.inputTokens ?? 0,
    outputTokens: parsed.data.usage?.outputTokens ?? 0,
  }
}

async function main(): Promise<void> {
  const root = findRepoRoot(process.cwd())
  loadDotenv({ path: resolve(root, '.env') })

  const config = loadScriptConfig()
  const logger = createLogger({
    level: config.env.LOG_LEVEL,
    base: { service: 'scripts', script: 'eval' },
  })

  const cases = await loadCases(config.evalCasesDir)
  if (cases.length === 0) {
    logger.warn('no_eval_cases', { dir: config.evalCasesDir })
    return
  }

  const results: CaseResult[] = []

  for (const testCase of cases) {
    const startedAt = Date.now()

    try {
      const response = await callAssistant(config.env.API_BASE_URL, testCase.question)
      const durationMs = Date.now() - startedAt

      const keyword = keywordCheck({
        question: testCase.question,
        answer: response.answer,
        sources: response.sources,
        expectedKeywords: testCase.expect.mustInclude,
        forbiddenKeywords: testCase.expect.mustNotInclude,
      })

      const judge = await judgeWithModel({
        env: config.env,
        input: {
          question: testCase.question,
          answer: response.answer,
          sources: response.sources,
          expectedKeywords: testCase.expect.mustInclude,
          forbiddenKeywords: testCase.expect.mustNotInclude,
        },
      })

      results.push({
        id: testCase.id,
        question: testCase.question,
        answer: response.answer,
        sources: response.sources,
        durationMs,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        keyword,
        judge,
        passed: keyword.passed && judge.passed,
      })

      logger.info('case_done', { id: testCase.id, durationMs, passed: keyword.passed && judge.passed })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({
        id: testCase.id,
        question: testCase.question,
        answer: '',
        sources: [],
        durationMs: Date.now() - startedAt,
        inputTokens: 0,
        outputTokens: 0,
        keyword: { passed: false, missing: [], leaked: [] },
        judge: { score: 0, passed: false, reason: message },
        passed: false,
        error: message,
      })
      logger.error('case_failed', { id: testCase.id, error: message })
    }
  }

  const durations = results.map((result) => result.durationMs)
  const avgDurationMs =
    durations.length === 0
      ? 0
      : Math.round(durations.reduce((total, value) => total + value, 0) / durations.length)
  const maxInputTokens = Math.max(0, ...results.map((result) => result.inputTokens))
  const maxOutputTokens = Math.max(0, ...results.map((result) => result.outputTokens))

  const report = {
    createdAt: new Date().toISOString(),
    model: config.env.GEMINI_JUDGE_MODEL,
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    constraints: {
      avgDurationMs: {
        limit: MAX_AVG_DURATION_MS,
        value: avgDurationMs,
        ok: avgDurationMs <= MAX_AVG_DURATION_MS,
      },
      inputTokens: {
        limit: MAX_INPUT_TOKENS,
        value: maxInputTokens,
        ok: maxInputTokens <= MAX_INPUT_TOKENS,
      },
      outputTokens: {
        limit: MAX_OUTPUT_TOKENS,
        value: maxOutputTokens,
        ok: maxOutputTokens <= MAX_OUTPUT_TOKENS,
      },
    },
    results,
  }

  await mkdir(config.evalResultsDir, { recursive: true })
  const stamp = report.createdAt.replace(/[:.]/g, '-')
  const outputPath = resolve(config.evalResultsDir, `run-${stamp}.json`)
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  logger.info('eval_done', {
    total: report.total,
    passed: report.passed,
    avgDurationMs,
    outputPath,
  })
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main().catch((error: unknown) => {
    console.error('Chạy eval thất bại:', error)
    process.exitCode = 1
  })
}
