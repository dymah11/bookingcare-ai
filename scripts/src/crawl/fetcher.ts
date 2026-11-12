import { chromium, type Browser, type BrowserContext } from 'playwright'
import type { EntityType } from '@bookingcare/shared'
import type { HtmlCache } from './cache.js'

export type FetchOutcome = {
  url: string
  html: string | null
  status: number
  fromCache: boolean
  error?: string
}

export type TextOutcome = {
  url: string
  text: string | null
  status: number
  error?: string
}

export type FetcherOptions = {
  userAgent: string
  cache: HtmlCache
  gate: RequestGate
  limiter: ConcurrencyLimiter
  retries: number
  backoffMs: number
  timeoutMs: number
  /** Thời gian chờ thêm cho trang render bằng JS (ms). */
  settleMs: number
  headless: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms)
  })
}

/**
 * Giới hạn số request chạy đồng thời.
 */
export class ConcurrencyLimiter {
  private active = 0
  private readonly waiting: (() => void)[] = []

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolveWait) => {
        this.waiting.push(resolveWait)
      })
    }

    this.active += 1
    try {
      return await task()
    } finally {
      this.active -= 1
      const next = this.waiting.shift()
      if (next) {
        next()
      }
    }
  }
}

/**
 * Khoảng nghỉ giữa 2 request (có jitter) — tránh dồn ép lên website nguồn.
 */
export class RequestGate {
  private nextAllowedAt = 0

  constructor(
    private readonly minDelayMs: number,
    private readonly maxDelayMs: number,
  ) {}

  async wait(): Promise<void> {
    const waitMs = this.nextAllowedAt - Date.now()
    if (waitMs > 0) {
      await sleep(waitMs)
    }

    const span = Math.max(0, this.maxDelayMs - this.minDelayMs)
    const delay = this.minDelayMs + Math.random() * span
    this.nextAllowedAt = Date.now() + delay
  }
}

/**
 * Tải trang bằng Playwright (render JS) kèm retry + backoff, cache và giới hạn
 * độ trễ. Một browser được dùng lại cho mọi request.
 */
export class Fetcher {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private readonly options: FetcherOptions

  constructor(options: FetcherOptions) {
    this.options = options
  }

  private async ensureContext(): Promise<BrowserContext> {
    if (this.context) {
      return this.context
    }

    this.browser = await chromium.launch({ headless: this.options.headless })
    this.context = await this.browser.newContext({
      userAgent: this.options.userAgent,
      viewport: { width: 1366, height: 900 },
      locale: 'vi-VN',
    })

    return this.context
  }

  async close(): Promise<void> {
    await this.context?.close()
    await this.browser?.close()
    this.context = null
    this.browser = null
  }

  /** Tải nội dung dạng text (dùng cho robots.txt). */
  async fetchText(url: string): Promise<TextOutcome> {
    try {
      const context = await this.ensureContext()
      const response = await context.request.get(url, {
        timeout: this.options.timeoutMs,
        headers: { 'user-agent': this.options.userAgent },
      })

      if (!response.ok()) {
        return { url, text: null, status: response.status(), error: `HTTP ${response.status()}` }
      }
      return { url, text: await response.text(), status: response.status() }
    } catch (error) {
      return {
        url,
        text: null,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async fetchHtml(url: string, type: EntityType, useCache = true): Promise<FetchOutcome> {
    if (useCache) {
      const cached = await this.options.cache.read(url, type)
      if (cached !== null) {
        return { url, html: cached, status: 200, fromCache: true }
      }
    }

    return this.options.limiter.run(async () => {
      let lastError = 'unknown error'

      for (let attempt = 1; attempt <= this.options.retries; attempt += 1) {
        await this.options.gate.wait()

        try {
          const context = await this.ensureContext()
          const page = await context.newPage()

          try {
            const response = await page.goto(url, {
              waitUntil: 'domcontentloaded',
              timeout: this.options.timeoutMs,
            })
            const status = response?.status() ?? 0

            if (status === 0 || status >= 400) {
              lastError = `HTTP ${status}`
            } else {
              if (this.options.settleMs > 0) {
                await page.waitForTimeout(this.options.settleMs)
              }
              const html = await page.content()
              const fetchedAt = new Date().toISOString()
              await this.options.cache.write(url, type, html, status, fetchedAt)
              return { url, html, status, fromCache: false }
            }
          } finally {
            await page.close()
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error)
        }

        if (attempt < this.options.retries) {
          const backoff = this.options.backoffMs * 2 ** (attempt - 1)
          await sleep(backoff + Math.random() * 250)
        }
      }

      return { url, html: null, status: 0, fromCache: false, error: lastError }
    })
  }
}
