import type { EntityType } from '@bookingcare/shared'

/**
 * Cấu hình crawl cho từng loại thực thể.
 *
 * Toàn bộ selector và pattern URL nằm ở đây để khi markup của
 * bookingcare.vn đổi, chỉ cần sửa file này chứ không phải sửa logic.
 *
 * LƯU Ý: các `listPaths`/`detailPathPattern` dưới đây là giả định — crawler
 * luôn tự dò lại danh sách link từ trang chủ và từ trang listing, nên nếu
 * pattern sai thì crawler vẫn tìm được URL thật.
 */
export type SelectorSet = {
  /** Tên/ tiêu đề chính. */
  name: string[]
  /** Mô tả nội dung. */
  description: string[]
  /** Chuyên khoa liên quan. */
  specialty: string[]
  /** Địa chỉ. */
  address: string[]
  /** Quận/huyện. */
  area: string[]
  /** Tỉnh/thành. */
  city: string[]
  /** Số điện thoại. */
  phone: string[]
  /** Giá dịch vụ. */
  price: string[]
  /** Tên bệnh viện/phòng khám. */
  facility: string[]
  /** Chức danh bác sĩ. */
  doctorTitle: string[]
}

export type EntityTypeConfig = {
  /** Các trang listing (đường dẫn tương đối so với base URL). */
  listPaths: string[]
  /** Link trên trang chủ trỏ tới trang listing của loại này. */
  listLinkPattern: RegExp
  /** Pattern URL của trang chi tiết. */
  detailPathPattern: RegExp
  /** Pattern URL của trang phân trang. */
  paginationPattern: RegExp
  selectors: SelectorSet
}

const EMPTY_SELECTORS: SelectorSet = {
  name: ['h1', '[class*="title"] h1', 'meta[property="og:title"]'],
  description: [
    '[class*="description"]',
    '[class*="intro"]',
    '[itemprop="description"]',
    'meta[name="description"]',
  ],
  specialty: ['[class*="specialty"] a', '[class*="chuyen-khoa"] a', '[itemprop="medicalSpecialty"]'],
  address: ['[itemprop="address"]', '[class*="address"]', '[class*="dia-chi"]'],
  area: ['[class*="area"]', '[class*="district"]', '[class*="quan"]'],
  city: ['[class*="city"]', '[class*="province"]', '[class*="tinh"]'],
  // `a[href^="tel:"]` bị loại có chủ đích: số điện thoại trong footer là
  // hotline của BookingCare, không phải của cơ sở y tế.
  phone: ['[itemprop="telephone"]', '[class*="phone"]', '[class*="dien-thoai"]'],
  price: ['[class*="price"]', '[class*="gia"]', '[itemprop="price"]'],
  facility: ['[class*="hospital"] a', '[class*="benh-vien"] a', '[class*="facility"] a'],
  doctorTitle: ['[class*="title"]', '[class*="chuc-danh"]', '[itemprop="jobTitle"]'],
}

/**
 * Selector theo `data-testid` — bookingcare.vn (Next.js) đã hash tên class nên
 * `data-testid` mới là mốc ổn định.
 */
const FACILITY_SELECTORS: SelectorSet = {
  ...EMPTY_SELECTORS,
  name: ['[data-testid="clinic-place-title"]', 'h1', 'meta[property="og:title"]'],
  address: ['[data-testid="clinic-place-address"]', '[itemprop="address"]', '[class*="address"]'],
  phone: ['[data-testid="clinic-place-banner"] a[href^="tel:"]', '[itemprop="telephone"]'],
}

const DOCTOR_SELECTORS: SelectorSet = {
  ...EMPTY_SELECTORS,
  name: ['[data-testid="clinic-title"] h1', 'h1', 'meta[property="og:title"]'],
}

/**
 * Cấu trúc URL thật của bookingcare.vn (Next.js), đọc từ trang chủ:
 *
 * - Chuyên khoa: `/dich-vu-y-te/<nhóm>/<slug>-s<id>`
 *   (vd `/dich-vu-y-te/kham-chuyen-khoa/tim-mach-s3`)
 * - Cơ sở y tế: `/co-so-y-te/<slug>-p<id>`
 *   (vd `/co-so-y-te/benh-vien-ung-buou-hung-viet-p137`)
 * - Bác sĩ: `/dich-vu-y-te/<nhóm>/<slug>-i<id>`
 *   (vd `/dich-vu-y-te/kham-chuyen-khoa/bsckii-le-hong-anh-i1128`)
 * - Dịch vụ: `/dich-vu/<slug>` (vd `/dich-vu/tai-nha`)
 *
 * Hậu tố `-s/-p/-i` là id nội bộ của site — `stripIdSuffix()` bỏ nó khỏi slug.
 */
export const CRAWL_CONFIG: Record<EntityType, EntityTypeConfig> = {
  specialty: {
    listPaths: [
      '/dich-vu-y-te/kham-chuyen-khoa',
      '/dich-vu-y-te/kham-tu-xa',
      '/dich-vu-y-te/kham-tong-quat',
      '/dich-vu-y-te/xet-nghiem-y-hoc',
      '/dich-vu-y-te/kham-tinh-than',
      '/dich-vu-y-te/goi-phau-thuat',
      '/danh-sach/chuyen-khoa/kham-tu-xa',
    ],
    listLinkPattern: /^\/dich-vu-y-te\/[^/]+\/?$/,
    detailPathPattern: /^\/dich-vu-y-te\/[^/]+\/[^/]+-s\d+\/?$/,
    paginationPattern: /[?&]page=\d+/,
    selectors: {
      ...EMPTY_SELECTORS,
      name: ['h1', '[class*="specialty-name"]', 'meta[property="og:title"]'],
    },
  },
  facility: {
    listPaths: ['/co-so-y-te/tat-ca'],
    listLinkPattern: /^\/co-so-y-te\/[^/]+\/?$/,
    detailPathPattern: /^\/co-so-y-te\/[^/]+-p\d+\/?$/,
    paginationPattern: /[?&]page=\d+/,
    selectors: FACILITY_SELECTORS,
  },
  doctor: {
    listPaths: ['/danh-sach/bac-si/noi-bat'],
    listLinkPattern: /^\/danh-sach\/bac-si\/[^/]+\/?$/,
    detailPathPattern: /^\/dich-vu-y-te\/[^/]+\/[^/]+-i\d+\/?$/,
    paginationPattern: /[?&]page=\d+/,
    selectors: DOCTOR_SELECTORS,
  },
  service: {
    listPaths: [],
    listLinkPattern: /^\/dich-vu\/[^/]+\/?$/,
    detailPathPattern: /^\/dich-vu\/[^/]+\/?$/,
    paginationPattern: /[?&]page=\d+/,
    selectors: EMPTY_SELECTORS,
  },
}

/** Thứ tự ưu tiên khi chạy `--all`. */
export const ENTITY_TYPE_ORDER: EntityType[] = ['specialty', 'facility', 'doctor', 'service']

/** Khoảng delay giữa 2 request (ms). */
export const DEFAULT_DELAY_MIN_MS = 1000
export const DEFAULT_DELAY_MAX_MS = 2000

/** Số request đồng thời tối đa. */
export const DEFAULT_CONCURRENCY = 2

/** Số lần thử lại khi request lỗi. */
export const DEFAULT_RETRIES = 3

/** Thời gian chờ ban đầu của backoff (ms), nhân dần theo 2^attempt. */
export const DEFAULT_BACKOFF_MS = 800

/** Timeout cho 1 request (ms). */
export const DEFAULT_TIMEOUT_MS = 30_000

/** Số trang listing tối đa được duyệt khi tìm link chi tiết. */
export const MAX_LIST_PAGES = 12
