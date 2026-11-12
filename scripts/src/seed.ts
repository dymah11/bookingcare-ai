import { config as loadDotenv } from 'dotenv'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createLogger,
  crawledEntityListSchema,
  ENTITY_FILE_NAMES,
  type CrawledEntity,
  type EntityType,
} from '@bookingcare/shared'
import { findRepoRoot } from '@bookingcare/shared/node'
import { loadScriptConfig } from './config.js'

/**
 * Ghi dữ liệu mẫu (synthetic) vào `data/processed/{type}.json`.
 *
 * Chỉ dùng để chạy thử pipeline khi chưa có dữ liệu crawl thật — xem
 * `scripts/fixtures/README.md`.
 */
async function main(): Promise<void> {
  const root = findRepoRoot(process.cwd())
  loadDotenv({ path: resolve(root, '.env') })

  const config = loadScriptConfig()
  const logger = createLogger({
    level: config.env.LOG_LEVEL,
    base: { service: 'scripts', script: 'seed' },
  })

  const fixturePath = resolve(config.root, 'scripts', 'fixtures', 'seed-entities.json')
  const raw = await readFile(fixturePath, 'utf8')

  let json: unknown
  try {
    json = JSON.parse(raw) as unknown
  } catch {
    json = null
  }

  const parsed = crawledEntityListSchema.safeParse(json)
  if (!parsed.success) {
    logger.error('seed_invalid', {
      file: fixturePath,
      issues: parsed.error.issues.slice(0, 10).map((issue) => issue.message),
    })
    process.exitCode = 1
    return
  }

  const byType = new Map<EntityType, CrawledEntity[]>()
  for (const entity of parsed.data) {
    const list = byType.get(entity.type) ?? []
    list.push(entity)
    byType.set(entity.type, list)
  }

  await mkdir(config.processedDir, { recursive: true })
  for (const [type, entities] of byType) {
    const path = resolve(config.processedDir, `${ENTITY_FILE_NAMES[type]}.json`)
    await writeFile(path, `${JSON.stringify(entities, null, 2)}\n`, 'utf8')
    logger.info('seed_written', { type, count: entities.length, file: path })
  }

  console.log(
    `\nĐã ghi ${parsed.data.length} thực thể MẪU (dữ liệu tổng hợp, không phải dữ liệu thật của bookingcare.vn).`,
  )
  console.log('Bước tiếp theo: pnpm index && pnpm eval:retrieval')
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main().catch((error: unknown) => {
    console.error('Ghi dữ liệu mẫu thất bại:', error)
    process.exitCode = 1
  })
}
