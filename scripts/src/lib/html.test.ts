import { describe, expect, it } from 'vitest'
import { decodeEntities, extractLinks, extractTitle, stripTags } from './html.js'

describe('stripTags', () => {
  it('bỏ tag và gộp khoảng trắng', () => {
    expect(stripTags('<p>Bệnh viện   A</p><p>Bệnh viện B</p>')).toBe('Bệnh viện A Bệnh viện B')
  })

  it('bỏ nội dung script và style', () => {
    const html = '<style>.a{color:red}</style><script>alert(1)</script><p>Chữ</p>'
    expect(stripTags(html)).toBe('Chữ')
  })

  it('giải mã entity cơ bản', () => {
    expect(decodeEntities('A &amp; B &lt;C&gt;')).toBe('A & B <C>')
  })
})

describe('extractTitle', () => {
  it('lấy nội dung thẻ title', () => {
    expect(extractTitle('<html><head><title>Bệnh viện A</title></head></html>')).toBe('Bệnh viện A')
  })

  it('trả chuỗi rỗng khi không có title', () => {
    expect(extractTitle('<div>không có title</div>')).toBe('')
  })
})

describe('extractLinks', () => {
  it('trả về link tuyệt đối', () => {
    const links = extractLinks(
      '<a href="/benh-vien/1">Bệnh viện 1</a><a href="#top">Top</a>',
      'https://bookingcare.vn/chuyen-khoa',
    )

    expect(links).toEqual(['https://bookingcare.vn/benh-vien/1'])
  })

  it('bỏ qua link không hợp lệ', () => {
    expect(extractLinks('<a href="http://">x</a>', 'https://bookingcare.vn/')).toEqual([])
  })
})
