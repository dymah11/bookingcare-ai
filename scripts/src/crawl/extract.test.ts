import { describe, expect, it } from 'vitest'
import type { CrawledEntity } from '@bookingcare/shared'
import {
  collectJsonLd,
  extractEntity,
  nameToSlug,
  parsePrice,
  splitAddress,
} from './extract.js'

const FETCHED_AT = '2026-01-01T00:00:00.000Z'

/**
 * Narrow union `CrawledEntity` theo loại để truy cập field riêng của từng loại
 * (title, facilityType, price…) mà không phải ép kiểu.
 */
function expectType<T extends CrawledEntity['type']>(
  entity: CrawledEntity | null,
  type: T,
): Extract<CrawledEntity, { type: T }> {
  if (entity === null || entity.type !== type) {
    throw new Error(`Kỳ vọng thực thể loại "${type}", nhận được: ${entity?.type ?? 'null'}`)
  }
  return entity as Extract<CrawledEntity, { type: T }>
}

function withJsonLd(node: unknown, body = '<h1>Tiêu đề</h1>'): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(node)}</script></head><body>${body}</body></html>`
}

describe('parsePrice', () => {
  it('parse giá có dấu phân cách nghìn', () => {
    expect(parsePrice('150.000')).toBe(150000)
    expect(parsePrice('1.500.000')).toBe(1500000)
  })

  it('parse giá kèm đơn vị tiền', () => {
    expect(parsePrice('1,5 triệu')).toBe(1500000)
    expect(parsePrice('200 nghìn')).toBe(200000)
  })

  it('lấy mức thấp nhất khi là khoảng giá', () => {
    expect(parsePrice('150.000 - 300.000')).toBe(150000)
  })

  it('parse giá có chữ VND', () => {
    expect(parsePrice('150.000 ₫')).toBe(150000)
  })

  it('trả undefined khi không có số', () => {
    expect(parsePrice('liên hệ để biết giá')).toBeUndefined()
  })
})

describe('nameToSlug', () => {
  it('bỏ dấu và thay khoảng trắng', () => {
    expect(nameToSlug('Tim mạch')).toBe('tim-mach')
  })
})

describe('splitAddress', () => {
  it('lấy quận/huyện và tỉnh/thành từ 2 phần cuối', () => {
    expect(splitAddress('Tầng 1 toà nhà 3 tầng Thôn Bầu, xã Thiên Lộc, Hà Nội')).toEqual({
      area: 'xã Thiên Lộc',
      city: 'Hà Nội',
    })
  })

  it('xử lý địa chỉ chỉ có một phần', () => {
    expect(splitAddress('Hà Nội')).toEqual({ area: '', city: 'Hà Nội' })
  })

  it('trả rỗng khi không có địa chỉ', () => {
    expect(splitAddress('')).toEqual({ area: '', city: '' })
  })
})

describe('collectJsonLd', () => {
  it('đọc được node JSON-LD', () => {
    const nodes = collectJsonLd(withJsonLd({ '@type': 'Physician', name: 'BS. A' }))
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.name).toBe('BS. A')
  })

  it('hỗ trợ @graph', () => {
    const nodes = collectJsonLd(
      withJsonLd({ '@graph': [{ '@type': 'Physician', name: 'A' }, { '@type': 'Hospital', name: 'B' }] }),
    )
    expect(nodes).toHaveLength(2)
  })

  it('bỏ qua JSON-LD hỏng', () => {
    const nodes = collectJsonLd('<script type="application/ld+json">{khong hop le</script>')
    expect(nodes).toHaveLength(0)
  })
})

describe('extractEntity', () => {
  it('trích xuất bác sĩ từ JSON-LD', () => {
    const html = withJsonLd({
      '@type': 'Physician',
      name: 'BS. Nguyễn Văn A',
      description: 'Bác sĩ chuyên khoa Tim mạch',
      jobTitle: 'Tiến sĩ',
      medicalSpecialty: 'Tim mạch',
    })

    const doctor = expectType(
      extractEntity({
        type: 'doctor',
        url: 'https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa/bs-nguyen-van-a-i1128',
        html,
        fetchedAt: FETCHED_AT,
      }),
      'doctor',
    )

    expect(doctor.id).toBe('doctor-bs-nguyen-van-a')
    expect(doctor.name).toBe('BS. Nguyễn Văn A')
    expect(doctor.title).toBe('Tiến sĩ')
    expect(doctor.specialtyIds).toContain('specialty-tim-mach')
  })

  it('trích xuất bệnh viện kèm địa chỉ từ JSON-LD', () => {
    const html = withJsonLd({
      '@type': 'Hospital',
      name: 'Bệnh viện Đa khoa Trung ương',
      address: {
        streetAddress: '123 Lê Lợi',
        addressLocality: 'Quận 1',
        addressRegion: 'TP.HCM',
      },
      telephone: '0281234567',
    })

    const facility = expectType(
      extractEntity({
        type: 'facility',
        url: 'https://bookingcare.vn/co-so-y-te/benh-vien-da-khoa-trung-uong-p6',
        html,
        fetchedAt: FETCHED_AT,
      }),
      'facility',
    )

    expect(facility.facilityType).toBe('hospital')
    expect(facility.id).toBe('facility-benh-vien-da-khoa-trung-uong')
    expect(facility.address).toBe('123 Lê Lợi, Quận 1, TP.HCM')
    expect(facility.area).toBe('Quận 1')
    expect(facility.city).toBe('TP.HCM')
    expect(facility.phone).toBe('0281234567')
  })

  it('trích xuất dịch vụ kèm giá từ JSON-LD', () => {
    const html = withJsonLd({
      '@type': 'MedicalProcedure',
      name: 'Khám tim mạch',
      description: 'Gói khám tim mạch cơ bản',
      offers: { price: '150.000', priceCurrency: 'VND' },
    })

    const service = expectType(
      extractEntity({
        type: 'service',
        url: 'https://bookingcare.vn/dich-vu/kham-tim-mach',
        html,
        fetchedAt: FETCHED_AT,
      }),
      'service',
    )

    expect(service.price).toBe(150000)
    expect(service.currency).toBe('VND')
  })

  it('fallback sang CSS selector khi không có JSON-LD', () => {
    const html = `
      <html><body>
        <h1>Khám da liễu</h1>
        <div class="description">Gói khám da liễu</div>
        <div class="price">200.000</div>
      </body></html>`

    const service = expectType(
      extractEntity({
        type: 'service',
        url: 'https://bookingcare.vn/dich-vu/kham-da-lieu',
        html,
        fetchedAt: FETCHED_AT,
      }),
      'service',
    )

    expect(service.name).toBe('Khám da liễu')
    expect(service.description).toBe('Gói khám da liễu')
    expect(service.price).toBe(200000)
  })

  it('trả null khi trang không có nội dung', () => {
    const entity = extractEntity({
      type: 'doctor',
      url: 'https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa/bs-a-i1',
      html: '<html><body></body></html>',
      fetchedAt: FETCHED_AT,
    })

    expect(entity).toBeNull()
  })

  it('gom id chuyên khoa từ link trong trang', () => {
    const html = `
      <html><body>
        <h1>BS. Nguyễn Văn B</h1>
        <div class="specialty"><a href="/dich-vu-y-te/kham-chuyen-khoa/noi-khoa-s17">Nội khoa</a></div>
      </body></html>`

    const doctor = expectType(
      extractEntity({
        type: 'doctor',
        url: 'https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa/bs-nguyen-van-b-i999',
        html,
        fetchedAt: FETCHED_AT,
      }),
      'doctor',
    )

    expect(doctor.specialtyIds).toEqual(['specialty-noi-khoa'])
  })

  it('quét toàn bộ link khi selector không khớp (tên class đã hash)', () => {
    const html = `
      <html><body>
        <h1>BS. Nguyễn Văn C</h1>
        <a href="/dich-vu-y-te/kham-chuyen-khoa/noi-khoa-s17">Nội khoa</a>
        <a href="/co-so-y-te/benh-vien-ung-buou-hung-viet-p137">BV Ung Bướu</a>
      </body></html>`

    const doctor = expectType(
      extractEntity({
        type: 'doctor',
        url: 'https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa/bs-nguyen-van-c-i1000',
        html,
        fetchedAt: FETCHED_AT,
      }),
      'doctor',
    )

    expect(doctor.specialtyIds).toEqual(['specialty-noi-khoa'])
    expect(doctor.facilityIds).toEqual(['facility-benh-vien-ung-buou-hung-viet'])
  })

  it('chuyên khoa tự tham chiếu, không thu thập chuyên khoa anh em', () => {
    const html = `
      <html><body>
        <h1>Tim mạch</h1>
        <a href="/dich-vu-y-te/kham-chuyen-khoa/co-xuong-khop-s1">Cơ xương khớp</a>
      </body></html>`

    const specialty = expectType(
      extractEntity({
        type: 'specialty',
        url: 'https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa/tim-mach-s3',
        html,
        fetchedAt: FETCHED_AT,
      }),
      'specialty',
    )

    expect(specialty.id).toBe('specialty-tim-mach')
    expect(specialty.specialtyIds).toEqual(['specialty-tim-mach'])
  })

  it('trích xuất địa chỉ cơ sở y tế từ data-testid', () => {
    const html = `
      <html><body>
        <h1 data-testid="clinic-place-title">Bệnh viện Bệnh Nhiệt đới Trung ương</h1>
        <div data-testid="clinic-place-address">Tầng 1 toà nhà 3 tầng Thôn Bầu, xã Thiên Lộc, Hà Nội</div>
      </body></html>`

    const facility = expectType(
      extractEntity({
        type: 'facility',
        url: 'https://bookingcare.vn/co-so-y-te/benh-vien-benh-nhiet-doi-trung-uong-p111',
        html,
        fetchedAt: FETCHED_AT,
      }),
      'facility',
    )

    expect(facility.name).toBe('Bệnh viện Bệnh Nhiệt đới Trung ương')
    expect(facility.address).toBe('Tầng 1 toà nhà 3 tầng Thôn Bầu, xã Thiên Lộc, Hà Nội')
    expect(facility.area).toBe('xã Thiên Lộc')
    expect(facility.city).toBe('Hà Nội')
  })

  it('không lấy hotline BookingCare trong footer làm số điện thoại cơ sở', () => {
    const html = `
      <html><body>
        <h1 data-testid="clinic-place-title">Bệnh viện A</h1>
        <div data-testid="clinic-place-address">123 Lê Lợi, Quận 1, TP.HCM</div>
        <footer><a href="tel:02473012468">024-7301-2468</a></footer>
      </body></html>`

    const facility = expectType(
      extractEntity({
        type: 'facility',
        url: 'https://bookingcare.vn/co-so-y-te/benh-vien-a-p1',
        html,
        fetchedAt: FETCHED_AT,
      }),
      'facility',
    )

    expect(facility.phone).toBe('')
  })

  it('trích xuất tên bác sĩ từ khối clinic-title', () => {
    const html = `
      <html><body>
        <span data-testid="clinic-title"><h1>BS.CKII Lê Hồng Anh</h1></span>
        <meta property="og:title" content="Thầy thuốc ưu tú, Tiến sĩ Nguyễn Xuân Thành - Bệnh viện 108">
      </body></html>`

    const doctor = expectType(
      extractEntity({
        type: 'doctor',
        url: 'https://bookingcare.vn/dich-vu-y-te/kham-chuyen-khoa/bsckii-le-hong-anh-i1128',
        html,
        fetchedAt: FETCHED_AT,
      }),
      'doctor',
    )

    expect(doctor.name).toBe('BS.CKII Lê Hồng Anh')
  })
})
