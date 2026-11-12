import { resolve } from 'node:path'
import { findRepoRoot } from '@bookingcare/shared/node'
import { loadEnv, type Env } from '@bookingcare/shared'

export type ScriptConfig = {
  env: Env
  /** Thư mục gốc của monorepo. */
  root: string
  rawDir: string
  processedDir: string
  evalCasesDir: string
  evalResultsDir: string
}

export function loadScriptConfig(
  source: Record<string, string | undefined> = process.env,
): ScriptConfig {
  const root = findRepoRoot(process.cwd())
  const env = loadEnv(source)
  const dataDir = resolve(root, env.DATA_DIR)

  return {
    env,
    root,
    rawDir: resolve(dataDir, 'raw'),
    processedDir: resolve(dataDir, 'processed'),
    evalCasesDir: resolve(root, 'eval', 'cases'),
    evalResultsDir: resolve(root, 'eval', 'results'),
  }
}
