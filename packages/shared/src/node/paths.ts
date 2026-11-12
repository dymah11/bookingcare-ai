import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Tìm thư mục gốc của monorepo (nơi có `pnpm-workspace.yaml`) bằng cách đi ngược lên.
 * Nhờ vậy các script chạy từ bất kỳ thư mục con nào cũng trỏ đúng `data/`.
 */
export function findRepoRoot(startDir: string): string {
  let current = resolve(startDir)
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return resolve(startDir)
}

export function resolveFromRoot(root: string, ...segments: string[]): string {
  return resolve(root, ...segments)
}
