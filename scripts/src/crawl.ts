import { config as loadDotenv } from 'dotenv'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createLogger } from '@bookingcare/shared'
import { findRepoRoot } from '@bookingcare/shared/node'
import { loadScriptConfig } from './config.js'
import { CRAWL_HELP, parseCrawlArgs } from './crawl/cli.js'
import { checkBrowserAvailable } from './crawl/browser.js'
import { inferTypeFromUrl, probeUrl, runCrawl } from './crawl/index.js'
import { formatStatsTable } from './crawl/stats.js'

async function main(): Promise<void> {
  const root = findRepoRoot(process.cwd())
  loadDotenv({ path: resolve(root, '.env') })

  const config = loadScriptConfig()
  const logger = createLogger({
    level: config.env.LOG_LEVEL,
    base: { service: 'scripts', script: 'crawl' },
  })

  const options = parseCrawlArgs(process.argv.slice(2), {
    limit: config.env.CRAWL_MAX_PAGES,
    concurrency: config.env.CRAWL_CONCURRENCY,
    delayMinMs: config.env.CRAWL_DELAY_MIN_MS,
    delayMaxMs: config.env.CRAWL_DELAY_MAX_MS,
  })

  if (options.help) {
    console.log(CRAWL_HELP)
    return
  }

  // Crawler render bằng Playwright: thiếu Chromium thì không trang nào tải
  // được và mọi loại thực thể đều ra 0 bản ghi. Chặn trước để báo lỗi rõ ràng.
  const browser = checkBrowserAvailable()
  if (!browser.ok) {
    logger.error('browser_missing', {
      executablePath: browser.executablePath,
      hint: browser.hint,
    })
    console.error(`\n✗ ${browser.hint ?? 'Không tìm thấy Chromium cho Playwright.'}`)
    console.error(`  Đường dẫn dự kiến: ${browser.executablePath}`)
    process.exitCode = 1
    return
  }

  if (options.probeUrl !== undefined) {
    const type = inferTypeFromUrl(options.probeUrl)
    const report = await probeUrl(options.probeUrl, type, {
      baseUrl: config.env.BOOKINGCARE_BASE_URL,
      userAgent: config.env.CRAWL_USER_AGENT,
      rawDir: config.rawDir,
      timeoutMs: config.env.CRAWL_TIMEOUT_MS,
      settleMs: config.env.CRAWL_SETTLE_MS,
      headless: config.env.CRAWL_HEADLESS !== 'false',
    })

    console.log(JSON.stringify(report, null, 2))
    return
  }

  const result = await runCrawl(
    {
      baseUrl: config.env.BOOKINGCARE_BASE_URL,
      types: options.types,
      limit: options.limit,
      refresh: options.refresh,
      concurrency: options.concurrency,
      delayMinMs: options.delayMinMs,
      delayMaxMs: options.delayMaxMs,
      retries: config.env.CRAWL_RETRIES,
      backoffMs: config.env.CRAWL_BACKOFF_MS,
      timeoutMs: config.env.CRAWL_TIMEOUT_MS,
      settleMs: config.env.CRAWL_SETTLE_MS,
      userAgent: config.env.CRAWL_USER_AGENT,
      rawDir: config.rawDir,
      processedDir: config.processedDir,
      dryRun: options.dryRun,
      headless: config.env.CRAWL_HEADLESS !== 'false',
    },
    logger,
  )

  console.log('\n=== Thống kê crawl ===')
  console.log(formatStatsTable(result.stats))
  console.log(
    `  Trang: tải mới ${result.counters.fetchedPages}, đọc từ cache ${result.counters.cachedPages}, lỗi ${result.counters.failedPages}, bị robots.txt chặn ${result.counters.skippedByRobots}`,
  )
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main().catch((error: unknown) => {
    console.error('Crawl thất bại:', error)
    process.exitCode = 1
  })
}
