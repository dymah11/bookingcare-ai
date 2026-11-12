#!/usr/bin/env node
/**
 * Kiểm tra môi trường dev: trạng thái cấu hình và những thư mục dữ liệu
 * pipeline cần có.
 *
 * Chạy: `pnpm doctor`  (không in ra giá trị secret)
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

const lines = []
const ok = (message) => lines.push(`  [ok]   ${message}`)
const warn = (message) => lines.push(`  [warn] ${message}`)
const bad = (message) => lines.push(`  [fail] ${message}`)

lines.push('== Toolchain ==')
lines.push(`  node: ${process.version}`)

lines.push('')
lines.push('== Cấu hình (.env) ==')
const envPath = join(repoRoot, '.env')
if (!existsSync(envPath)) {
  bad('.env chưa tồn tại — chạy `cp .env.example .env`')
} else {
  ok('.env tồn tại')
  const env = readFileSync(envPath, 'utf8')
  for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) {
    const line = env.split('\n').find((item) => item.startsWith(`${key}=`))
    const value = line?.slice(key.length + 1).trim() ?? ''
    if (value === '') warn(`${key} chưa được điền`)
    else ok(`${key} đã được điền`)
  }
}

lines.push('')
lines.push('== Playwright (cần cho crawl) ==')
try {
  const { chromium } = await import('playwright')
  const executablePath = chromium.executablePath()
  if (existsSync(executablePath)) {
    ok(`Chromium đã cài: ${executablePath}`)
  } else {
    bad('chưa cài Chromium — chạy `pnpm --filter @bookingcare/scripts crawl:install`')
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  warn(`không kiểm tra được Playwright: ${reason}`)
}

lines.push('')
lines.push('== Dữ liệu pipeline ==')
const processed = join(repoRoot, 'data', 'processed')
for (const file of [
  'specialties.json',
  'facilities.json',
  'doctors.json',
  'services.json',
  'retrieval-index.json',
]) {
  const path = join(processed, file)
  if (existsSync(path)) ok(`data/processed/${file}`)
  else warn(`thiếu data/processed/${file}`)
}

const evalQueries = join(repoRoot, 'eval', 'retrieval-queries.json')
if (existsSync(evalQueries)) ok('eval/retrieval-queries.json')
else warn('thiếu eval/retrieval-queries.json')

console.log(lines.join('\n'))
