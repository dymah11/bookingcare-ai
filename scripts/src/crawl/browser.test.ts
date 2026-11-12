import { describe, expect, it } from 'vitest'
import { BROWSER_INSTALL_HINT, checkBrowserAvailable } from './browser.js'

describe('checkBrowserAvailable', () => {
  it('báo ok khi Chromium đã có trên máy', () => {
    const result = checkBrowserAvailable('C:/pw/chrome.exe', () => true)

    expect(result.ok).toBe(true)
    expect(result.executablePath).toBe('C:/pw/chrome.exe')
    expect(result.hint).toBeUndefined()
  })

  it('báo thiếu browser kèm hướng dẫn cài đặt', () => {
    const result = checkBrowserAvailable('C:/pw/chrome.exe', () => false)

    expect(result.ok).toBe(false)
    expect(result.executablePath).toBe('C:/pw/chrome.exe')
    expect(result.hint).toBe(BROWSER_INSTALL_HINT)
    expect(result.hint).toContain('crawl:install')
  })

  it('báo thiếu browser khi không xác định được đường dẫn', () => {
    const result = checkBrowserAvailable('', () => true)

    expect(result.ok).toBe(false)
    expect(result.hint).toBe(BROWSER_INSTALL_HINT)
  })
})
