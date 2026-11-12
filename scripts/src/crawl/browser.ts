import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

/** Hướng dẫn cài browser khi Playwright chưa có Chromium trên máy. */
export const BROWSER_INSTALL_HINT =
  'Chưa cài Chromium cho Playwright. Chạy: pnpm --filter @bookingcare/scripts crawl:install'

export type BrowserCheck = {
  ok: boolean
  executablePath: string
  hint?: string
}

/** Đường dẫn Chromium mà Playwright dự kiến dùng (rỗng nếu platform không hỗ trợ). */
function resolveExecutablePath(): string {
  try {
    return chromium.executablePath()
  } catch {
    return ''
  }
}

/**
 * Kiểm tra Chromium của Playwright đã được tải về máy chưa.
 *
 * Crawler render bằng Playwright nên thiếu browser thì **không trang nào** tải
 * được: mọi loại thực thể đều ra 0 bản ghi mà log chỉ báo "lỗi N" — không có
 * lý do. Kiểm tra này chặn trước tình huống đó.
 */
export function checkBrowserAvailable(
  executablePath: string | undefined = undefined,
  exists: (path: string) => boolean = existsSync,
): BrowserCheck {
  const path = executablePath ?? resolveExecutablePath()

  if (path !== '' && exists(path)) {
    return { ok: true, executablePath: path }
  }
  return { ok: false, executablePath: path, hint: BROWSER_INSTALL_HINT }
}
