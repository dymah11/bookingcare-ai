import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { EntityType } from '@bookingcare/shared'

export type CacheManifestEntry = {
  url: string
  type: EntityType
  file: string
  fetchedAt: string
  status: number
}

/**
 * Cache HTML thô.
 *
 * Mỗi URL được lưu thành `data/raw/html/{type}/{sha1(url)}.html`; chạy lại
 * crawler sẽ đọc từ cache nên không phải tải lại trang.
 */
export class HtmlCache {
  private readonly root: string
  private readonly manifestPath: string

  constructor(rawDir: string) {
    this.root = resolve(rawDir, 'html')
    this.manifestPath = resolve(rawDir, 'manifest.jsonl')
  }

  filePath(url: string, type: EntityType): string {
    const key = createHash('sha1').update(url).digest('hex')
    return resolve(this.root, type, `${key}.html`)
  }

  async read(url: string, type: EntityType): Promise<string | null> {
    try {
      return await readFile(this.filePath(url, type), 'utf8')
    } catch {
      return null
    }
  }

  async write(
    url: string,
    type: EntityType,
    html: string,
    status: number,
    fetchedAt: string,
  ): Promise<string> {
    const path = this.filePath(url, type)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, html, 'utf8')

    const entry: CacheManifestEntry = { url, type, file: path, fetchedAt, status }
    await appendFile(this.manifestPath, `${JSON.stringify(entry)}\n`, 'utf8')

    return path
  }
}
