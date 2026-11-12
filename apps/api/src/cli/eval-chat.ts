import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chatScenarioFileSchema, type ChatScenario } from '@bookingcare/shared'
import { findRepoRoot } from '@bookingcare/shared/node'
import { createRuntime } from '../bootstrap.js'
import { runConversation, type ConversationOutcome } from './runner.js'

type ScenarioReport = {
  id: string
  title: string
  tags: string[]
  passed: boolean
  checks: { name: string; ok: boolean; detail: string }[]
  outcome: ConversationOutcome
}

function evaluate(scenario: ChatScenario, outcome: ConversationOutcome): ScenarioReport {
  const checks: ScenarioReport['checks'] = []

  const missingTools = scenario.expect.mustUseTools.filter(
    (tool) => !outcome.toolsUsed.includes(tool),
  )
  checks.push({
    name: 'tool',
    ok: missingTools.length === 0,
    detail:
      missingTools.length === 0
        ? `đã gọi: ${outcome.toolsUsed.join(', ') || '(không gọi tool)'}`
        : `thiếu tool: ${missingTools.join(', ')}`,
  })

  const roundsOk = outcome.toolRounds <= scenario.expect.maxToolRounds
  checks.push({
    name: 'toolRounds',
    ok: roundsOk,
    detail: `${outcome.toolRounds} vòng (tối đa ${scenario.expect.maxToolRounds})`,
  })

  const lastAnswer = outcome.turns[outcome.turns.length - 1]?.answer ?? ''
  const leaked = scenario.expect.mustNotSay.filter((phrase) =>
    lastAnswer.toLowerCase().includes(phrase.toLowerCase()),
  )
  checks.push({
    name: 'safety',
    ok: leaked.length === 0,
    detail: leaked.length === 0 ? 'không vi phạm' : `chứa cụm: ${leaked.join(', ')}`,
  })

  const absent = scenario.expect.mustSay.filter(
    (phrase) => !lastAnswer.toLowerCase().includes(phrase.toLowerCase()),
  )
  checks.push({
    name: 'mustSay',
    ok: absent.length === 0,
    detail: absent.length === 0 ? 'đủ nội dung bắt buộc' : `thiếu cụm: ${absent.join(', ')}`,
  })

  const bookingCount = outcome.turns.reduce((total, turn) => total + turn.bookings.length, 0)
  const bookingOk = scenario.expect.mustNotCreateBooking ? bookingCount === 0 : true
  checks.push({
    name: 'booking',
    ok: bookingOk,
    detail: `${bookingCount} booking được tạo${scenario.expect.mustNotCreateBooking ? ' (cần 0)' : ''}`,
  })

  const tokensOk = outcome.outputTokens <= 500
  checks.push({
    name: 'outputTokens',
    ok: tokensOk,
    detail: `${outcome.outputTokens} token (tối đa 500)`,
  })

  return {
    id: scenario.id,
    title: scenario.title,
    tags: scenario.tags,
    passed: checks.every((check) => check.ok),
    checks,
    outcome,
  }
}

async function main(): Promise<void> {
  const runtime = await createRuntime()
  const assistant = runtime.assistant

  if (assistant === null) {
    console.error('Chưa cấu hình GEMINI_API_KEY — không chạy được eval.')
    process.exitCode = 1
    return
  }

  const root = findRepoRoot(process.cwd())
  const scenariosPath = resolve(root, 'eval', 'chat-scenarios.json')
  const raw = await readFile(scenariosPath, 'utf8')

  const parsed = chatScenarioFileSchema.safeParse(JSON.parse(raw) as unknown)
  if (!parsed.success) {
    console.error('File kịch bản không hợp lệ.')
    process.exitCode = 1
    return
  }

  const reports: ScenarioReport[] = []

  for (const scenario of parsed.data.scenarios) {
    const outcome = await runConversation(
      assistant,
      `scenario-${scenario.id}`,
      scenario.turns.map((turn) => turn.user),
    )
    const report = evaluate(scenario, outcome)
    reports.push(report)

    console.log(`\n=== ${report.id} — ${report.title} ===`)
    for (const turn of report.outcome.turns) {
      console.log(`\nBạn> ${turn.user}`)
      console.log(`Trợ lý> ${turn.answer}`)
    }
    console.log(
      `\n[tool] ${report.outcome.toolsUsed.join(', ') || '(không gọi tool)'} | ${report.outcome.toolRounds} vòng | ${report.outcome.durationMs}ms | in ${report.outcome.inputTokens} / out ${report.outcome.outputTokens} token`,
    )
    for (const check of report.checks) {
      console.log(`  [${check.ok ? 'ok' : 'FAIL'}] ${check.name}: ${check.detail}`)
    }
  }

  const passed = reports.filter((report) => report.passed).length
  const avgDurationMs =
    reports.length === 0
      ? 0
      : Math.round(
          reports.reduce((total, report) => total + report.outcome.durationMs, 0) / reports.length,
        )
  const avgInputTokens =
    reports.length === 0
      ? 0
      : Math.round(
          reports.reduce((total, report) => total + report.outcome.inputTokens, 0) / reports.length,
        )
  const maxOutputTokens = Math.max(0, ...reports.map((report) => report.outcome.outputTokens))

  const summary = {
    createdAt: new Date().toISOString(),
    model: runtime.env.GEMINI_MODEL,
    total: reports.length,
    passed,
    avgDurationMs,
    avgInputTokens,
    maxOutputTokens,
    constraints: {
      avgDurationMs: { limit: 10_000, value: avgDurationMs, ok: avgDurationMs <= 10_000 },
      inputTokens: { limit: 30_000, value: avgInputTokens, ok: avgInputTokens <= 30_000 },
      outputTokens: { limit: 500, value: maxOutputTokens, ok: maxOutputTokens <= 500 },
    },
    reports,
  }

  const resultsDir = resolve(root, 'eval', 'results')
  await mkdir(resultsDir, { recursive: true })
  const stamp = summary.createdAt.replace(/[:.]/g, '-')
  const outputPath = resolve(resultsDir, `chat-${stamp}.json`)
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

  console.log('\n=== Tổng kết ===')
  console.log(`  Kịch bản đạt: ${passed}/${reports.length}`)
  console.log(`  Thời gian trung bình: ${avgDurationMs}ms (giới hạn 10000ms)`)
  console.log(`  Input token trung bình: ${avgInputTokens} (giới hạn 30000)`)
  console.log(`  Output token tối đa: ${maxOutputTokens} (giới hạn 500)`)
  console.log(`  Báo cáo: ${outputPath}`)
}

main().catch((error: unknown) => {
  console.error('Đánh giá agent thất bại:', error)
  process.exitCode = 1
})
