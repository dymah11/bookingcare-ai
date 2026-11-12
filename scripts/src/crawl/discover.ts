import { load } from 'cheerio'
import type { EntityType } from '@bookingcare/shared'
import { CRAWL_CONFIG } from './config.js'

type Document = ReturnType<typeof load>

export function parseDocument(html: string): Document {
  return load(html)
}

/** Chuẩn hoá link về absolute URL và chỉ giữ link cùng origin. */
export function absolutizeLink(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl)
    return url.origin === new URL(baseUrl).origin ? url.toString() : null
  } catch {
    return null
  }
}

export function findLinks(html: string, baseUrl: string): string[] {
  const $ = parseDocument(html)
  const links: string[] = []

  $('a[href]').each((_index, element) => {
    const href = $(element).attr('href')
    if (href === undefined) return
    const absolute = absolutizeLink(href, baseUrl)
    if (absolute !== null) {
      links.push(absolute)
    }
  })

  return [...new Set(links)]
}

/** Các trang listing của loại thực thể, tìm thấy trên trang chủ. */
export function findListUrls(html: string, baseUrl: string, type: EntityType): string[] {
  const config = CRAWL_CONFIG[type]
  return findLinks(html, baseUrl).filter((url) => {
    const { pathname } = new URL(url)
    // Trang listing và trang chi tiết có thể trùng pattern — loại trang chi tiết
    // để không tải cùng một trang hai lần.
    return config.listLinkPattern.test(pathname) && !config.detailPathPattern.test(pathname)
  })
}

/** Các trang chi tiết của loại thực thể, tìm thấy trong 1 trang listing. */
export function findDetailUrls(html: string, baseUrl: string, type: EntityType): string[] {
  const config = CRAWL_CONFIG[type]
  return findLinks(html, baseUrl).filter((url) => config.detailPathPattern.test(new URL(url).pathname))
}

/** Các link phân trang (`?page=N`). */
export function findPaginationUrls(html: string, baseUrl: string, type: EntityType): string[] {
  const config = CRAWL_CONFIG[type]
  return findLinks(html, baseUrl).filter((url) => config.paginationPattern.test(url))
}

/**
 * Bỏ hậu tố id nội bộ của bookingcare.vn khỏi slug.
 *
 * Site gắn id vào cuối slug: `tim-mach-s3` (chuyên khoa),
 * `benh-vien-ung-buou-hung-viet-p137` (cơ sở y tế),
 * `bsckii-le-hong-anh-i1128` (bác sĩ). Bỏ đi thì slug khớp với `nameToSlug(name)`
 * nên id giữa các trang tham chiếu chéo vẫn khớp.
 */
export function stripIdSuffix(slug: string): string {
  const stripped = slug.replace(/-(s|p|i)\d+$/, '').replace(/-+$/, '')
  return stripped === '' ? slug : stripped
}

/** Lấy slug từ segment cuối của pathname. */
export function slugFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url)
    const segments = pathname.split('/').filter((segment) => segment !== '')
    const last = segments[segments.length - 1] ?? ''
    if (last === '') return 'unknown'
    return stripIdSuffix(decodeURIComponent(last))
  } catch {
    return 'unknown'
  }
}

/**
 * Suy ra trang listing từ các link chi tiết tìm thấy trên trang chủ.
 *
 * Ví dụ thấy `/dich-vu-y-te/kham-chuyen-khoa/tim-mach-s3` thì trang listing tương
 * ứng là `/dich-vu-y-te/kham-chuyen-khoa`. Dùng làm fallback khi trang chủ không
 * link trực tiếp tới trang listing.
 *
 * Chỉ nhận listing có từ 2 segment trở lên — gốc 1 segment (`/co-so-y-te`,
 * `/dich-vu`) thường không phải trang listing và chỉ tạo ra 404.
 */
export function inferListUrlsFromDetailUrls(detailUrls: string[]): string[] {
  const lists = new Set<string>()

  for (const url of detailUrls) {
    try {
      const { pathname } = new URL(url)
      const segments = pathname.split('/').filter((segment) => segment !== '')
      if (segments.length >= 3) {
        lists.add(`/${segments.slice(0, -1).join('/')}`)
      }
    } catch {
      // bỏ qua link không hợp lệ
    }
  }

  return [...lists]
}
