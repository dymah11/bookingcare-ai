import { describe, expect, it } from 'vitest'
import { isPathAllowed, parseRobots } from './robots.js'

const ROBOTS = `
User-agent: *
Disallow: /admin
Disallow: /api
Allow: /api/public

User-agent: bookingcare-ai
Disallow: /private
`

describe('parseRobots', () => {
  it('lấy nhóm khớp user agent', () => {
    const rules = parseRobots(ROBOTS, 'bookingcare-ai/0.1')
    expect(rules.disallow).toContain('/private')
  })

  it('fallback về nhóm * khi không có nhóm khớp', () => {
    const rules = parseRobots(ROBOTS, 'some-other-bot/1.0')
    expect(rules.disallow).toContain('/admin')
  })

  it('trả về rỗng khi robots.txt trống', () => {
    const rules = parseRobots('', 'bookingcare-ai/0.1')
    expect(rules.allow).toEqual([])
    expect(rules.disallow).toEqual([])
  })
})

describe('isPathAllowed', () => {
  const rules = parseRobots(ROBOTS, 'bookingcare-ai/0.1')

  it('chặn đường dẫn bị disallow', () => {
    expect(isPathAllowed(rules, '/private/x')).toBe(false)
  })

  it('cho phép đường dẫn không bị chặn', () => {
    expect(isPathAllowed(rules, '/benh-vien/1')).toBe(true)
  })

  it('allow thắng khi disallow cùng tiền tố', () => {
    // Nhóm `*` mới có Disallow: /api + Allow: /api/public
    const starRules = parseRobots(ROBOTS, 'some-other-bot/1.0')
    expect(isPathAllowed(starRules, '/api/public')).toBe(true)
    expect(isPathAllowed(starRules, '/api/secret')).toBe(false)
  })
})
