import { loadEnv, type Env } from '@bookingcare/shared'

export type { Env }

/**
 * Đọc env từ `process.env` (đã được nạp qua dotenv ở entrypoint).
 * Không có giá trị nào được hardcode trong mã nguồn.
 */
export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  return loadEnv(source)
}
