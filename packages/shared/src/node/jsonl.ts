import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export function parseJsonl<T>(content: string): T[] {
  const rows: T[] = []
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (line === '') continue
    rows.push(JSON.parse(line) as T)
  }
  return rows
}

export async function readJsonl<T>(filePath: string): Promise<T[]> {
  const content = await readFile(filePath, 'utf8')
  return parseJsonl<T>(content)
}

export async function writeJsonl<T>(filePath: string, rows: T[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const content = rows.map((row) => JSON.stringify(row)).join('\n')
  await writeFile(filePath, content === '' ? '' : `${content}\n`, 'utf8')
}

export async function appendJsonl<T>(filePath: string, row: T): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await appendFile(filePath, `${JSON.stringify(row)}\n`, 'utf8')
}
