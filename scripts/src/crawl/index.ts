import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  ENTITY_FILE_NAMES,
  type CrawledEntity,
  type EntityType,
  type Logger,
} from '@bookingcare/shared'
import { isPathAllowed, parseRobots, type RobotsRules } from '../lib/robots.js'
import { CRAWL_CONFIG, MAX_LIST_PAGES } from './config.js'
import { HtmlCache } from './cache.js'
import { ConcurrencyLimiter, Fetcher, RequestGate } from './fetcher.js'
import { findDetailUrls, findListUrls, findPaginationUrls, inferListUrlsFromDetailUrls } from './discover.js'
import { extractEntity, probePage } from './extract.js'
import { computeTypeStats, type TypeStats } from './stats.js'

export type CrawlRunOptions = {
  baseUrl: string
  types: EntityType[]
  limit: number
  refresh: boolean
  concurrency: number
  delayMinMs: number
  delayMaxMs: number
  retries: number
  backoffMs: number
  timeoutMs: number
  settleMs: number
  userAgent: string
  rawDir: string
  processedDir: string
  dryRun: boolean
  headless: boolean
}

export type CrawlCounters = {
  cachedPages: number
  fetchedPages: number
  failedPages: number
  skippedByRobots: number
}

export type CrawlRunResult = {
  entities: Record<EntityType, CrawledEntity[]>
  stats: TypeStats[]
  counters: CrawlCounters
}

function emptyEntities(): Record<EntityType, CrawledEntity[]> {
  return { specialty: [], facility: [], doctor: [], service: [] }
}

/** Suy ra loại thực thể từ URL (dùng cho `--probe`). */
export function inferTypeFromUrl(url: string): EntityType {
  try {
    const { pathname } = new URL(url)
    for (const type of ['specialty', 'facility', 'doctor', 'service'] as EntityType[]) {
      if (CRAWL_CONFIG[type].detailPathPattern.test(pathname)) {
        return type
      }
    }
  } catch {
    // bỏ qua
  }
  return 'specialty'
}

/**
 * Tìm các trang listing của 1 loại thực thể.
 *
 * Ưu tiên link được phát hiện trên trang chủ (chắc chắn tồn tại), sau đó mới
 * tới các đường dẫn dự đoán trong `config.ts`.
 */
async function resolveListUrls(
  fetcher: Fetcher,
  options: CrawlRunOptions,
  robots: RobotsRules,
  type: EntityType,
  counters: CrawlCounters,
  logger: Logger,
): Promise<{ listUrls: string[]; seedDetailUrls: string[] }> {
  const homeUrl = new URL('/', options.baseUrl).toString()
  const home = await fetcher.fetchHtml(homeUrl, type, !options.refresh)

  if (home.html === null) {
    counters.failedPages += 1
    logger.warn('crawl_fetch_failed', {
      type,
      url: homeUrl,
      error: home.error ?? 'không tải được trang',
    })
    return { listUrls: [], seedDetailUrls: [] }
  }

  if (home.fromCache) {
    counters.cachedPages += 1
  } else {
    counters.fetchedPages += 1
  }

  const discovered = findListUrls(home.html, options.baseUrl, type)
  const configured = CRAWL_CONFIG[type].listPaths.map((path) => new URL(path, options.baseUrl).toString())

  // Trang chủ đôi khi chỉ link thẳng tới trang chi tiết — dùng làm seed.
  const seedDetailUrls = findDetailUrls(home.html, options.baseUrl, type).filter((url) =>
    isPathAllowed(robots, new URL(url).pathname),
  )

  // Suy ra trang listing từ các link chi tiết (fallback khi không có link listing).
  const inferred = inferListUrlsFromDetailUrls(seedDetailUrls).map(
    (path) => new URL(path, options.baseUrl).toString(),
  )

  const listUrls = [...new Set([...discovered, ...inferred, ...configured])].filter((url) => {
    if (!isPathAllowed(robots, new URL(url).pathname)) {
      counters.skippedByRobots += 1
      return false
    }
    return true
  })

  return { listUrls, seedDetailUrls }
}

/** Duyệt các trang listing (kèm phân trang) để gom link chi tiết. */
async function collectDetailUrls(
  fetcher: Fetcher,
  options: CrawlRunOptions,
  robots: RobotsRules,
  type: EntityType,
  listUrls: string[],
  seedDetailUrls: string[],
  counters: CrawlCounters,
  logger: Logger,
): Promise<string[]> {
  const found = new Set<string>(seedDetailUrls)
  const queue = [...listUrls]
  const visited = new Set<string>()
  let processed = 0

  while (queue.length > 0 && processed < MAX_LIST_PAGES) {
    const listUrl = queue.shift()
    if (listUrl === undefined || visited.has(listUrl)) continue
    visited.add(listUrl)

    if (!isPathAllowed(robots, new URL(listUrl).pathname)) {
      counters.skippedByRobots += 1
      continue
    }

    const outcome = await fetcher.fetchHtml(listUrl, type, !options.refresh)
    if (outcome.html === null) {
      counters.failedPages += 1
      logger.warn('crawl_fetch_failed', {
        type,
        url: listUrl,
        error: outcome.error ?? 'không tải được trang',
      })
      continue
    }

    if (outcome.fromCache) {
      counters.cachedPages += 1
    } else {
      counters.fetchedPages += 1
    }

    for (const detailUrl of findDetailUrls(outcome.html, listUrl, type)) {
      found.add(detailUrl)
    }

    for (const pageUrl of findPaginationUrls(outcome.html, listUrl, type)) {
      if (!visited.has(pageUrl)) {
        queue.push(pageUrl)
      }
    }

    processed += 1
  }

  return [...found]
}

/** Tải + trích xuất từng trang chi tiết, tối đa `concurrency` request cùng lúc. */
async function collectEntities(
  fetcher: Fetcher,
  options: CrawlRunOptions,
  robots: RobotsRules,
  type: EntityType,
  detailUrls: string[],
  counters: CrawlCounters,
  logger: Logger,
): Promise<CrawledEntity[]> {
  const entities: CrawledEntity[] = []
  const seenIds = new Set<string>()

  const fetchOne = async (url: string): Promise<CrawledEntity | null> => {
    if (!isPathAllowed(robots, new URL(url).pathname)) {
      counters.skippedByRobots += 1
      return null
    }

    const outcome = await fetcher.fetchHtml(url, type, !options.refresh)
    if (outcome.html === null) {
      counters.failedPages += 1
      logger.warn('crawl_fetch_failed', {
        type,
        url,
        error: outcome.error ?? 'không tải được trang',
      })
      return null
    }

    if (outcome.fromCache) {
      counters.cachedPages += 1
    } else {
      counters.fetchedPages += 1
    }

    return extractEntity({
      type,
      url,
      html: outcome.html,
      fetchedAt: new Date().toISOString(),
    })
  }

  for (let index = 0; index < detailUrls.length && entities.length < options.limit; index += options.concurrency) {
    const batch = detailUrls.slice(index, index + options.concurrency)
    const results = await Promise.all(batch.map((url) => fetchOne(url)))

    for (const entity of results) {
      if (entity === null || seenIds.has(entity.id)) continue
      seenIds.add(entity.id)
      entities.push(entity)
    }
  }

  return entities
}

async function writeEntities(
  processedDir: string,
  type: EntityType,
  entities: CrawledEntity[],
): Promise<string> {
  const path = resolve(processedDir, `${ENTITY_FILE_NAMES[type]}.json`)
  await mkdir(processedDir, { recursive: true })
  await writeFile(path, `${JSON.stringify(entities, null, 2)}\n`, 'utf8')
  return path
}

/**
 * Chạy crawler cho 1 hoặc nhiều loại thực thể.
 *
 * Luôn kiểm tra `robots.txt` trước, giới hạn độ trễ và số request đồng thời,
 * cache HTML thô để chạy lại không tải lại.
 */
export async function runCrawl(
  options: CrawlRunOptions,
  logger: Logger,
): Promise<CrawlRunResult> {
  const cache = new HtmlCache(options.rawDir)
  const gate = new RequestGate(options.delayMinMs, options.delayMaxMs)
  const limiter = new ConcurrencyLimiter(options.concurrency)

  const fetcher = new Fetcher({
    userAgent: options.userAgent,
    cache,
    gate,
    limiter,
    retries: options.retries,
    backoffMs: options.backoffMs,
    timeoutMs: options.timeoutMs,
    settleMs: options.settleMs,
    headless: options.headless,
  })

  const entities = emptyEntities()
  const stats: TypeStats[] = []
  const counters: CrawlCounters = {
    cachedPages: 0,
    fetchedPages: 0,
    failedPages: 0,
    skippedByRobots: 0,
  }

  try {
    const robotsUrl = new URL('/robots.txt', options.baseUrl).toString()
    const robotsOutcome = await fetcher.fetchText(robotsUrl)
    const robots = parseRobots(robotsOutcome.text ?? '', options.userAgent)

    logger.info('robots_loaded', {
      robotsUrl,
      available: robotsOutcome.text !== null,
      disallowRules: robots.disallow.length,
      allowRules: robots.allow.length,
    })

    if (robotsOutcome.text === null) {
      logger.warn('robots_fetch_failed', {
        robotsUrl,
        error: robotsOutcome.error ?? 'không tải được robots.txt',
      })
    }

    for (const type of options.types) {
      logger.info('crawl_type_start', { type, limit: options.limit })

      const { listUrls, seedDetailUrls } = await resolveListUrls(
        fetcher,
        options,
        robots,
        type,
        counters,
        logger,
      )
      const detailUrls = await collectDetailUrls(
        fetcher,
        options,
        robots,
        type,
        listUrls,
        seedDetailUrls,
        counters,
        logger,
      )

      const collected = await collectEntities(
        fetcher,
        options,
        robots,
        type,
        detailUrls,
        counters,
        logger,
      )

      entities[type] = collected
      stats.push(computeTypeStats(type, collected))

      if (!options.dryRun) {
        const path = await writeEntities(options.processedDir, type, collected)
        logger.info('crawl_type_done', { type, records: collected.length, file: path })
      } else {
        logger.info('crawl_type_done', { type, records: collected.length, dryRun: true })
      }
    }
  } finally {
    await fetcher.close()
  }

  return { entities, stats, counters }
}

/** Chẩn đoán cấu trúc 1 trang — dùng để calibrate selector. */
export async function probeUrl(
  url: string,
  type: EntityType,
  options: Pick<CrawlRunOptions, 'baseUrl' | 'userAgent' | 'rawDir' | 'timeoutMs' | 'settleMs' | 'headless'>,
): Promise<unknown> {
  const cache = new HtmlCache(options.rawDir)
  const gate = new RequestGate(0, 0)
  const limiter = new ConcurrencyLimiter(1)

  const fetcher = new Fetcher({
    userAgent: options.userAgent,
    cache,
    gate,
    limiter,
    retries: 1,
    backoffMs: 0,
    timeoutMs: options.timeoutMs,
    settleMs: options.settleMs,
    headless: options.headless,
  })

  try {
    const outcome = await fetcher.fetchHtml(url, type, false)
    if (outcome.html === null) {
      return { url, type, error: outcome.error ?? 'không tải được trang' }
    }
    return probePage(outcome.html, type, url)
  } finally {
    await fetcher.close()
  }
}
