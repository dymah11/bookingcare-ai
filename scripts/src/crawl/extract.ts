import { load } from 'cheerio'
import {
  buildEntityId,
  crawledEntitySchema,
  normalizeText,
  type CrawledEntity,
  type EntityType,
} from '@bookingcare/shared'
import { CRAWL_CONFIG, type SelectorSet } from './config.js'
import { slugFromUrl } from './discover.js'

type Document = ReturnType<typeof load>
type JsonLdNode = Record<string, unknown>

export type ExtractContext = {
  type: EntityType
  url: string
  html: string
  fetchedAt: string
}

/**
 * `@type` ưu tiên cho từng loại thực thể — thứ tự càng ưu tiên càng được
 * chọn trước khi tìm node JSON-LD phù hợp.
 */
export const JSONLD_TYPE_PREFERENCE: Record<EntityType, string[]> = {
  specialty: ['MedicalSpecialty', 'MedicalBusiness', 'Service', 'Thing'],
  facility: ['Hospital', 'MedicalClinic', 'MedicalOrganization', 'Clinic', 'LocalBusiness'],
  doctor: ['Physician', 'MedicalProfessional', 'Person'],
  service: ['MedicalProcedure', 'Service', 'Offer', 'Product'],
}

/** Bỏ dấu + khoảng trắng thành slug dùng chung giữa các loại. */
export function nameToSlug(name: string): string {
  return normalizeText(name)
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Parse giá tiền kiểu Việt Nam: "150.000", "1.500.000 ₫", "150.000 - 300.000",
 * "1,5 triệu". Trả `undefined` nếu không tìm thấy số.
 */
/**
 * Đọc số kiểu Việt Nam.
 *
 * - `150.000` → 150000 (dấu chấm là phân cách nghìn)
 * - `1,5` → 1.5 (dấu phẩy là dấu thập phân)
 * - `150,000` → 150000 (dấu phẩy theo sau nhóm 3 chữ số là phân cách nghìn)
 */
function parseVietnameseNumber(digits: string): number {
  const lastComma = digits.lastIndexOf(',')
  const lastDot = digits.lastIndexOf('.')

  if (lastComma !== -1 && lastDot !== -1) {
    // Cả '.' và ',' → '.' phân cách nghìn, ',' là dấu thập phân.
    return Number.parseFloat(digits.replace(/\./g, '').replace(',', '.'))
  }

  if (lastComma !== -1) {
    const decimals = digits.length - lastComma - 1
    return decimals === 3
      ? Number.parseFloat(digits.replace(/,/g, ''))
      : Number.parseFloat(digits.replace(',', '.'))
  }

  if (lastDot !== -1) {
    const decimals = digits.length - lastDot - 1
    const isThousands = decimals === 3 && /^\d{1,3}(\.\d{3})+$/.test(digits)
    return Number.parseFloat(isThousands ? digits.replace(/\./g, '') : digits)
  }

  return Number.parseFloat(digits)
}

export function parsePrice(input: string): number | undefined {
  const text = input.toLowerCase().replace(/[–—]/g, '-')
  const firstPart = text.split('-')[0] ?? ''
  const match = /(\d[\d.,]*)\s*(triệu|tr|nghìn|k)?/.exec(firstPart)
  if (!match) return undefined

  const digits = match[1] ?? ''
  const unit = match[2]

  let value = parseVietnameseNumber(digits)
  if (!Number.isFinite(value)) return undefined

  if (unit === 'triệu' || unit === 'tr') {
    value *= 1_000_000
  } else if (unit === 'nghìn' || unit === 'k') {
    value *= 1_000
  }

  return value
}

/** Gom tất cả node JSON-LD trong trang (hỗ trợ cả `@graph`). */
export function collectJsonLd(html: string): JsonLdNode[] {
  const $ = load(html)
  const nodes: JsonLdNode[] = []

  $('script[type="application/ld+json"]').each((_index, element) => {
    const raw = $(element).html()
    if (raw === null || raw.trim() === '') return

    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      return
    }

    for (const node of flattenJsonLd(parsed)) {
      nodes.push(node)
    }
  })

  return nodes
}

function flattenJsonLd(value: unknown): JsonLdNode[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenJsonLd(item))
  }
  if (typeof value !== 'object' || value === null) {
    return []
  }

  const record = value as JsonLdNode
  const graph = record['@graph']
  if (Array.isArray(graph)) {
    return graph.flatMap((item) => flattenJsonLd(item))
  }

  return [record]
}

function pickJsonLdNode(nodes: JsonLdNode[], preferred: string[]): JsonLdNode | null {
  for (const wanted of preferred) {
    for (const node of nodes) {
      const raw = node['@type']
      const nodeTypes = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
      if (nodeTypes.includes(wanted)) {
        return node
      }
    }
  }
  return null
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null) return []
  return [value]
}

/** Text đầu tiên khớp trong danh sách selector (hỗ trợ cả thẻ `meta`). */
export function firstText($: Document, selectors: string[]): string {
  for (const selector of selectors) {
    const element = $(selector).first()
    if (element.length === 0) continue

    const content = element.attr('content')
    const text = (content ?? element.text()).trim()
    if (text !== '') return text
  }
  return ''
}

/** Tất cả text khớp trong selector đầu tiên có kết quả. */
export function allTexts($: Document, selectors: string[]): string[] {
  const values: string[] = []

  for (const selector of selectors) {
    $(selector).each((_index, element) => {
      const content = $(element).attr('content')
      const text = (content ?? $(element).text()).trim()
      if (text !== '') values.push(text)
    })
    if (values.length > 0) break
  }

  return values
}

/** Lọc các href thành id của thực thể đích theo pattern URL. */
function idsFromHrefs(
  hrefs: string[],
  linkPattern: RegExp,
  targetType: EntityType,
): string[] {
  const ids = new Set<string>()

  for (const href of hrefs) {
    try {
      const absolute = new URL(href, 'https://bookingcare.vn')
      if (!linkPattern.test(absolute.pathname)) continue
      const slug = slugFromUrl(absolute.toString())
      if (slug === 'unknown') continue
      ids.add(buildEntityId(targetType, slug))
    } catch {
      // bỏ qua link không hợp lệ
    }
  }

  return [...ids]
}

/**
 * Thu thập id của các thực thể liên quan từ link trong trang.
 *
 * Selector CSS thường không dùng được vì bookingcare.vn (Next.js) đã hash tên
 * class — nên khi selector không khớp, quét toàn bộ link trong trang.
 */
function collectRelatedIds(
  $: Document,
  selectors: string[],
  linkPattern: RegExp,
  targetType: EntityType,
): string[] {
  const hrefs: string[] = []

  for (const selector of selectors) {
    $(selector).each((_index, element) => {
      const href = $(element).attr('href')
      if (href !== undefined) hrefs.push(href)
    })
  }

  const ids = idsFromHrefs(hrefs, linkPattern, targetType)
  if (ids.length > 0) return ids

  const allHrefs: string[] = []
  $('a[href]').each((_index, element) => {
    const href = $(element).attr('href')
    if (href !== undefined) allHrefs.push(href)
  })

  return idsFromHrefs(allHrefs, linkPattern, targetType)
}

const SPECIALTY_PATH = /^\/dich-vu-y-te\/[^/]+\/[^/]+-s\d+\/?$/
const FACILITY_PATH = /^\/co-so-y-te\/[^/]+-p\d+\/?$/

/**
 * Tách địa chỉ kiểu Việt Nam thành quận/huyện và tỉnh/thành.
 *
 * Site không có field riêng cho quận/huyện — chỉ có một chuỗi địa chỉ, nên
 * lấy 2 phần cuối: "Tầng 1 toà nhà 3 tầng Thôn Bầu, xã Thiên Lộc, Hà Nội"
 * → area "xã Thiên Lộc", city "Hà Nội".
 */
export function splitAddress(address: string): { area: string; city: string } {
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')

  if (parts.length === 0) return { area: '', city: '' }

  const city = parts[parts.length - 1] ?? ''
  const area = parts.length >= 2 ? (parts[parts.length - 2] ?? '') : ''
  return { area, city }
}

function detectFacilityType(name: string, description: string, url: string): string {
  const haystack = `${name} ${description} ${url}`.toLowerCase()

  if (haystack.includes('bệnh viện') || haystack.includes('benh-vien')) return 'hospital'
  if (haystack.includes('phòng khám') || haystack.includes('phong-kham')) return 'clinic'
  if (haystack.includes('trung tâm') || haystack.includes('y tế')) return 'medical_center'
  return 'unknown'
}

function extractAddress(jsonLd: JsonLdNode | null): {
  address: string
  area: string
  city: string
} {
  const raw = jsonLd?.address
  if (typeof raw !== 'object' || raw === null) {
    return { address: '', area: '', city: '' }
  }

  const record = raw as JsonLdNode
  const street = asString(record.streetAddress)
  const locality = asString(record.addressLocality)
  const region = asString(record.addressRegion)

  return {
    address: [street, locality, region].filter((part) => part !== '').join(', '),
    area: locality,
    city: region,
  }
}

function extractPrice(
  $: Document,
  selectors: SelectorSet,
  jsonLd: JsonLdNode | null,
): { price?: number; note: string } {
  for (const offer of asArray(jsonLd?.offers)) {
    if (typeof offer !== 'object' || offer === null) continue

    const record = offer as JsonLdNode
    const value = parsePrice(asString(record.price) || asString(record.lowPrice))
    if (value !== undefined) {
      const currency = asString(record.priceCurrency)
      return { price: value, note: currency === '' ? `${value}` : `${value} ${currency}` }
    }
  }

  const cssPrice = firstText($, selectors.price)
  if (cssPrice === '') {
    return { note: '' }
  }

  const parsed = parsePrice(cssPrice)
  return parsed === undefined ? { note: '' } : { price: parsed, note: cssPrice }
}

/**
 * Trích xuất một thực thể từ HTML.
 *
 * Thứ tự ưu tiên: JSON-LD → CSS selector trong `config.ts` → heuristic từ
 * `<title>`/`<h1>`. Trả `null` nếu không đủ dữ liệu tối thiểu.
 */
export function extractEntity(context: ExtractContext): CrawledEntity | null {
  const $ = load(context.html)
  const config = CRAWL_CONFIG[context.type]
  const jsonLdNodes = collectJsonLd(context.html)
  const jsonLd = pickJsonLdNode(jsonLdNodes, JSONLD_TYPE_PREFERENCE[context.type])
  const slug = slugFromUrl(context.url)

  const name =
    asString(jsonLd?.name) ||
    firstText($, config.selectors.name) ||
    $('title').first().text().trim()
  if (name === '') {
    return null
  }

  const description = asString(jsonLd?.description) || firstText($, config.selectors.description)

  // Chuyên khoa tự tham chiếu: trang chuyên khoa link tới nhiều chuyên khoa anh
  // em, thu thập vào `specialtyIds` sẽ gây nhiễu khi lọc theo chuyên khoa.
  const specialtyIds =
    context.type === 'specialty'
      ? [buildEntityId('specialty', slug)]
      : collectRelatedIds($, config.selectors.specialty, SPECIALTY_PATH, 'specialty')

  if (context.type !== 'specialty' && specialtyIds.length === 0) {
    const medicalSpecialty = asArray(jsonLd?.medicalSpecialty)
      .map((item) => asString(item))
      .filter((item) => item !== '')
    for (const item of medicalSpecialty) {
      specialtyIds.push(buildEntityId('specialty', nameToSlug(item)))
    }
  }

  const base = {
    id: buildEntityId(context.type, slug),
    slug,
    name,
    description,
    url: context.url,
    specialtyIds,
    updatedAt: context.fetchedAt,
  }

  if (context.type === 'specialty') {
    const iconUrl = firstText($, ['meta[property="og:image"]'])
    const candidate = {
      type: 'specialty' as const,
      ...base,
      ...(iconUrl !== '' ? { iconUrl } : {}),
    }
    return validateEntity(candidate)
  }

  if (context.type === 'facility') {
    const fromJsonLd = extractAddress(jsonLd)
    const address = firstText($, config.selectors.address) || fromJsonLd.address
    const fromAddress = splitAddress(address)
    const area = firstText($, config.selectors.area) || fromJsonLd.area || fromAddress.area
    const city = firstText($, config.selectors.city) || fromJsonLd.city || fromAddress.city
    const phone = firstText($, config.selectors.phone) || asString(jsonLd?.telephone)

    const candidate = {
      type: 'facility' as const,
      ...base,
      facilityType: detectFacilityType(name, description, context.url),
      address,
      area,
      city,
      phone,
    }
    return validateEntity(candidate)
  }

  if (context.type === 'doctor') {
    const title = firstText($, config.selectors.doctorTitle) || asString(jsonLd?.jobTitle)
    const facilityIds = collectRelatedIds(
      $,
      config.selectors.facility,
      FACILITY_PATH,
      'facility',
    )

    const candidate = {
      type: 'doctor' as const,
      ...base,
      title,
      facilityIds,
    }
    return validateEntity(candidate)
  }

  const facilityIds = collectRelatedIds($, config.selectors.facility, FACILITY_PATH, 'facility')
  const { price, note } = extractPrice($, config.selectors, jsonLd)

  const candidate = {
    type: 'service' as const,
    ...base,
    facilityIds,
    ...(price === undefined ? {} : { price }),
    currency: 'VND',
    priceNote: note,
  }
  return validateEntity(candidate)
}

function validateEntity(candidate: unknown): CrawledEntity | null {
  const parsed = crawledEntitySchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

/**
 * Chẩn đoán cấu trúc 1 trang — dùng cho `pnpm crawl --probe <url>` để calibrate
 * selector mà không phải đoán mò.
 */
export function probePage(html: string, type: EntityType, url: string): unknown {
  const $ = load(html)
  const config = CRAWL_CONFIG[type]

  const selectorHits: Record<string, string[]> = {}
  for (const [key, selectors] of Object.entries(config.selectors)) {
    const hits: string[] = []
    for (const selector of selectors) {
      const count = $(selector).length
      if (count > 0) {
        hits.push(`${selector} (${count})`)
      }
    }
    selectorHits[key] = hits
  }

  return {
    url,
    type,
    title: $('title').first().text().trim(),
    h1: allTexts($, ['h1']).slice(0, 3),
    jsonLd: collectJsonLd(html),
    selectorHits,
    extracted: extractEntity({ type, url, html, fetchedAt: new Date().toISOString() }),
  }
}
