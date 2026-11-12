import { findRepoRoot } from '@bookingcare/shared/node'
import { resolve } from 'node:path'
import type { Env } from './env.js'

/** Thư mục gốc của monorepo (có `pnpm-workspace.yaml`). */
export function repoRoot(): string {
  return findRepoRoot(process.cwd())
}

/** Đường dẫn tuyệt đối trong thư mục dữ liệu, ví dụ `data/processed/index.json`. */
export function dataPath(env: Env, ...segments: string[]): string {
  return resolve(repoRoot(), env.DATA_DIR, ...segments)
}
