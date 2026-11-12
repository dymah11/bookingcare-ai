import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chatScenarioFileSchema } from '@bookingcare/shared'
import { createRuntime, type Runtime } from '../bootstrap.js'
import { runConversation } from './runner.js'

function printCards(cards: { title: string; subtitle: string; url: string }[]): void {
  if (cards.length === 0) return
  console.log('\n  Kết quả:')
  for (const card of cards) {
    console.log(`    • ${card.title}${card.subtitle !== '' ? ` — ${card.subtitle}` : ''}`)
    console.log(`      ${card.url}`)
  }
}

async function runInteractive(runtime: Runtime): Promise<void> {
  const assistant = runtime.assistant
  if (assistant === null) return

  const rl = createInterface({ input: stdin, output: stdout })
  const sessionId = randomUUID()

  console.log(`\nTrợ lý BookingCare — phiên ${sessionId}`)
  console.log('Gõ "exit" để thoát.\n')

  for (;;) {
    const line = (await rl.question('Bạn> ')).trim()
    if (line === 'exit' || line === 'quit') break
    if (line === '') continue

    const cards: { title: string; subtitle: string; url: string }[] = []
    let bookings: { code: string; url: string }[] = []

    for await (const event of assistant.stream({
      sessionId,
      message: line,
      requestId: randomUUID(),
    })) {
      if (event.type === 'delta') {
        process.stdout.write(event.text)
      } else if (event.type === 'status') {
        process.stdout.write(`\n  [${event.phase}] ${event.label}\n`)
      } else if (event.type === 'cards') {
        cards.push(...event.cards)
      } else if (event.type === 'tool') {
        if (event.status === 'start') {
          process.stdout.write(`\n  · đang gọi ${event.name}…\n`)
        }
      } else if (event.type === 'booking') {
        bookings.push(event.booking)
      }
    }

    printCards(cards)
    for (const booking of bookings) {
      console.log(`\n  🔖 Mã booking: ${booking.code}`)
      console.log(`  🔗 ${booking.url}`)
    }
    console.log('')
  }

  rl.close()
}

async function runScript(runtime: Runtime, filePath: string): Promise<void> {
  const assistant = runtime.assistant
  if (assistant === null) return

  const raw = await readFile(filePath, 'utf8')
  const parsed = chatScenarioFileSchema.safeParse(JSON.parse(raw) as unknown)
  if (!parsed.success) {
    console.error('File kịch bản không hợp lệ.')
    return
  }

  for (const scenario of parsed.data.scenarios) {
    console.log(`\n=== ${scenario.id} — ${scenario.title} ===`)
    const outcome = await runConversation(
      assistant,
      `scenario-${scenario.id}`,
      scenario.turns.map((turn) => turn.user),
    )

    for (const turn of outcome.turns) {
      console.log(`\nBạn> ${turn.user}`)
      console.log(`Trợ lý> ${turn.answer}`)
      printCards(turn.cards)
      for (const booking of turn.bookings) {
        console.log(`  🔖 ${booking.code} — ${booking.url}`)
      }
    }

    console.log(
      `\n[tool] ${outcome.toolsUsed.join(', ') || '(không gọi tool)'} | ${outcome.toolRounds} vòng | ${outcome.durationMs}ms | in ${outcome.inputTokens} / out ${outcome.outputTokens} token`,
    )
  }
}

async function main(): Promise<void> {
  const runtime = await createRuntime()

  if (runtime.assistant === null) {
    console.error('Chưa cấu hình GEMINI_API_KEY — không chạy được trợ lý.')
    process.exitCode = 1
    return
  }

  console.error(
    `[info] index ${runtime.store.size} chunk · catalog ${runtime.catalog.size} thực thể`,
  )

  const scriptIndex = process.argv.indexOf('--script')
  if (scriptIndex !== -1) {
    const filePath = process.argv[scriptIndex + 1]
    if (filePath === undefined) {
      console.error('--script cần đường dẫn file JSON.')
      process.exitCode = 1
      return
    }
    await runScript(runtime, filePath)
    return
  }

  await runInteractive(runtime)
}

main().catch((error: unknown) => {
  console.error('Lỗi:', error)
  process.exitCode = 1
})
