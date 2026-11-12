import { describe, expect, it } from 'vitest'
import {
  findDetailUrls,
  findLinks,
  findListUrls,
  findPaginationUrls,
  inferListUrlsFromDetailUrls,
  slugFromUrl,
  stripIdSuffix,
} from './discover.js'

const HOME = `
  <a href="/dich-vu-y-te/kham-chuyen-khoa">Khám chuyên khoa</a>
  <a href="/dich-vu-y-te/kham-chuyen-khoa/tim-mach-s3">Tim mạch</a>
  <a href="/co-so-y-te/tat-ca">Tất cả cơ sở y tế</a>
  <a href="/co-so-y-te/benh-vien-ung-buou-hung-viet-p137">BV Ung Bướu</a>
  <a href="/danh-sach/bac-si/noi-bat">Bác sĩ nổi bật</a>
  <a href="/dich-vu-y-te/kham-chuyen-khoa/bsckii-le-hong-anh-i1128">BSCKII Lê Hồng Anh</a>
  <a href="/dich-vu/tai-nha">Tại nhà</a>
  <a href="/dich-vu-y-te/kham-chuyen-khoa?page=2">Trang 2</a>
  <a href="https://example.com/benh-vien/x">Ngoài site</a>
`

describe('findLinks', () => {
  it('chỉ giữ link cùng origin và loại trùng', () => {
    const links = findLinks(HOME, 'https://bookingcare.vn')
    expect(links).toContain('https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa')
    expect(links).not.toContain('https://example.com/benh-vien/x')
  })
})

describe('findListUrls', () => {
  it('tìm trang listing nhưng không nhầm trang chi tiết', () => {
    const urls = findListUrls(HOME, 'https://bookingcare.vn', 'specialty')
    expect(urls).toContain('https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa')
    expect(urls).not.toContain(
      'https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa/tim-mach-s3',
    )
  })

  it('loại trang chi tiết khỏi trang listing của cùng loại', () => {
    const urls = findListUrls(HOME, 'https://bookingcare.vn', 'facility')
    expect(urls).toContain('https://bookingcare.vn/co-so-y-te/tat-ca')
    expect(urls).not.toContain('https://bookingcare.vn/co-so-y-te/benh-vien-ung-buou-hung-viet-p137')
  })
})

describe('findDetailUrls', () => {
  it('tìm trang chi tiết của đúng loại', () => {
    const urls = findDetailUrls(HOME, 'https://bookingcare.vn', 'doctor')
    expect(urls).toContain(
      'https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa/bsckii-le-hong-anh-i1128',
    )
  })

  it('phân biệt chuyên khoa (-s) và bác sĩ (-i) cùng thư mục', () => {
    const urls = findDetailUrls(HOME, 'https://bookingcare.vn', 'specialty')
    expect(urls).toContain('https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa/tim-mach-s3')
    expect(urls).not.toContain(
      'https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa/bsckii-le-hong-anh-i1128',
    )
  })
})

describe('findPaginationUrls', () => {
  it('tìm link phân trang', () => {
    const urls = findPaginationUrls(HOME, 'https://bookingcare.vn', 'specialty')
    expect(urls).toEqual(['https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa?page=2'])
  })
})

describe('stripIdSuffix', () => {
  it('bỏ hậu tố id của site', () => {
    expect(stripIdSuffix('tim-mach-s3')).toBe('tim-mach')
    expect(stripIdSuffix('benh-vien-ung-buou-hung-viet-p137')).toBe('benh-vien-ung-buou-hung-viet')
    expect(stripIdSuffix('bsckii-le-hong-anh-i1128')).toBe('bsckii-le-hong-anh')
  })

  it('giữ nguyên slug không có hậu tố', () => {
    expect(stripIdSuffix('tai-nha')).toBe('tai-nha')
  })

  it('bỏ dấu gạch thừa ở cuối', () => {
    expect(stripIdSuffix('khoa-kham-benh--benh-vien--p95')).toBe('khoa-kham-benh--benh-vien')
  })
})

describe('slugFromUrl', () => {
  it('lấy segment cuối và bỏ hậu tố id', () => {
    expect(slugFromUrl('https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa/tim-mach-s3')).toBe(
      'tim-mach',
    )
  })

  it('trả unknown với url hỏng', () => {
    expect(slugFromUrl('khong-phai-url')).toBe('unknown')
  })
})

describe('inferListUrlsFromDetailUrls', () => {
  it('suy ra trang listing từ link chi tiết', () => {
    const lists = inferListUrlsFromDetailUrls([
      'https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa/tim-mach-s3',
    ])
    expect(lists).toEqual(['/dich-vu-y-te/kham-chuyen-khoa'])
  })

  it('bỏ qua gốc 1 segment vì thường không phải trang listing', () => {
    const lists = inferListUrlsFromDetailUrls([
      'https://bookingcare.vn/co-so-y-te/benh-vien-ung-buou-hung-viet-p137',
    ])
    expect(lists).toEqual([])
  })
})
