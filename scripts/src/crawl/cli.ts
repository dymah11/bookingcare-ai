import { entityTypeSchema, type EntityType } from '@bookingcare/shared'
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_DELAY_MAX_MS,
  DEFAULT_DELAY_MIN_MS,
  ENTITY_TYPE_ORDER,
} from './config.js'

export type CrawlCliOptions = {
  types: EntityType[]
  limit: number
  refresh: boolean
  concurrency: number
  delayMinMs: number
  delayMaxMs: number
  probeUrl?: string
  dryRun: boolean
  help: boolean
}

export type CrawlCliDefaults = {
  limit: number
  concurrency?: number
  delayMinMs?: number
  delayMaxMs?: number
}

/** Các tên gọi thay thế cho `--type`. */
const TYPE_ALIASES: Record<string, EntityType> = {
  specialty: 'specialty',
  specialties: 'specialty',
  chuyenkhoa: 'specialty',
  'chuyen-khoa': 'specialty',
  facility: 'facility',
  facilities: 'facility',
  hospital: 'facility',
  hospitals: 'facility',
  benhvien: 'facility',
  'benh-vien': 'facility',
  cosoyte: 'facility',
  'co-so-y-te': 'facility',
  doctor: 'doctor',
  doctors: 'doctor',
  bacsi: 'doctor',
  'bac-si': 'doctor',
  service: 'service',
  services: 'service',
  dichvu: 'service',
  'dich-vu': 'service',
}

export const CRAWL_HELP = `Crawler dữ liệu bookingcare.vn

Cách dùng:
  pnpm crawl --type <loại> [--limit <n>] [options]
  pnpm crawl --all [--limit <n>] [options]

Loại thực thể:
  specialty | facility | doctor | service
  (bí danh: specialties, hospital(s), benh-vien, co-so-y-te, bac-si, dich-vu, ...)

Tuỳ chọn:
  --type <loại>        Chỉ crawl 1 loại (có thể dùng nhiều lần)
  --all                Crawl cả 4 loại
  --limit <n>          Số bản ghi tối đa cho mỗi loại
  --refresh            Bỏ qua cache HTML, tải lại từ trang
  --concurrency <n>    Số request đồng thời (mặc định 2)
  --delay <ms>         Delay tối thiểu giữa các request (mặc định 1000)
  --delay-max <ms>     Delay tối đa giữa các request (mặc định 2000)
  --probe <url>        In cấu trúc + JSON-LD của 1 URL để calibrate selector
  --dry-run            Không ghi file kết quả
  --help               In hướng dẫn
`

export function parseType(value: string): EntityType {
  const key = value.trim().toLowerCase()
  const alias = TYPE_ALIASES[key]
  if (alias !== undefined) return alias

  const direct = entityTypeSchema.safeParse(key)
  if (direct.success) return direct.data

  throw new Error(`Loại thực thể không hợp lệ: "${value}". Hợp lệ: specialty | facility | doctor | service`)
}

function parseNumber(value: string | undefined, flag: string): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flag} cần là số không âm, nhận được: "${value ?? ''}"`)
  }
  return parsed
}

/**
 * Parse argv của `pnpm crawl`.
 *
 * Chấp nhận cả dạng `pnpm crawl --type doctors` và `pnpm crawl -- --type doctors`.
 */
export function parseCrawlArgs(argv: string[], defaults: CrawlCliDefaults = { limit: 200 }): CrawlCliOptions {
  const args = argv[0] === '--' ? argv.slice(1) : argv

  const types: EntityType[] = []
  let limit = defaults.limit
  let refresh = false
  let concurrency = defaults.concurrency ?? DEFAULT_CONCURRENCY
  let delayMinMs = defaults.delayMinMs ?? DEFAULT_DELAY_MIN_MS
  let delayMaxMs = defaults.delayMaxMs ?? DEFAULT_DELAY_MAX_MS
  let probeUrl: string | undefined
  let dryRun = false
  let help = false
  let all = false

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === undefined) continue

    if (arg === '--type') {
      const value = args[index + 1]
      index += 1
      if (value === undefined) throw new Error('--type cần một giá trị')
      types.push(parseType(value))
      continue
    }

    if (arg === '--all') {
      all = true
      continue
    }

    if (arg === '--limit') {
      const value = args[index + 1]
      index += 1
      limit = parseNumber(value, '--limit')
      continue
    }

    if (arg === '--refresh') {
      refresh = true
      continue
    }

    if (arg === '--concurrency') {
      const value = args[index + 1]
      index += 1
      concurrency = Math.max(1, parseNumber(value, '--concurrency'))
      continue
    }

    if (arg === '--delay') {
      const value = args[index + 1]
      index += 1
      delayMinMs = parseNumber(value, '--delay')
      delayMaxMs = Math.max(delayMinMs, delayMaxMs)
      continue
    }

    if (arg === '--delay-max') {
      const value = args[index + 1]
      index += 1
      delayMaxMs = Math.max(delayMinMs, parseNumber(value, '--delay-max'))
      continue
    }

    if (arg === '--probe') {
      const value = args[index + 1]
      index += 1
      if (value === undefined) throw new Error('--probe cần một URL')
      probeUrl = value
      continue
    }

    if (arg === '--dry-run') {
      dryRun = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      help = true
      continue
    }

    throw new Error(`Tham số không hợp lệ: "${arg}". Chạy "pnpm crawl --help" để xem hướng dẫn.`)
  }

  if (all) {
    for (const type of ENTITY_TYPE_ORDER) {
      if (!types.includes(type)) {
        types.push(type)
      }
    }
  }

  if (types.length === 0 && probeUrl === undefined && !help) {
    types.push(...ENTITY_TYPE_ORDER)
  }

  return {
    types,
    limit,
    refresh,
    concurrency,
    delayMinMs,
    delayMaxMs,
    ...(probeUrl === undefined ? {} : { probeUrl }),
    dryRun,
    help,
  }
}
