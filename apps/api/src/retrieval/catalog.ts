import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  crawledEntityListSchema,
  ENTITY_FILE_NAMES,
  type CrawledEntity,
  type EntityType,
} from '@bookingcare/shared'

/**
 * Catalog thực thể đầy đủ, nạp từ `data/processed/{type}.json`.
 *
 * Retrieval index chỉ giữ chunk + metadata rút gọn; khi cần chi tiết đầy đủ
 * (giá, địa chỉ, điện thoại, mô tả) thì đọc từ catalog này.
 */
export class EntityCatalog {
  private readonly entities = new Map<string, CrawledEntity>()

  constructor(entities: CrawledEntity[]) {
    for (const entity of entities) {
      this.entities.set(entity.id, entity)
    }
  }

  get size(): number {
    return this.entities.size
  }

  get(id: string): CrawledEntity | undefined {
    return this.entities.get(id)
  }

  list(type?: EntityType): CrawledEntity[] {
    const all = [...this.entities.values()]
    return type === undefined ? all : all.filter((entity) => entity.type === type)
  }

  static async load(processedDir: string): Promise<EntityCatalog> {
    const entities: CrawledEntity[] = []

    for (const fileName of Object.values(ENTITY_FILE_NAMES)) {
      const raw = await readFile(resolve(processedDir, `${fileName}.json`), 'utf8').catch(() => null)
      if (raw === null) continue

      let json: unknown
      try {
        json = JSON.parse(raw) as unknown
      } catch {
        continue
      }

      const parsed = crawledEntityListSchema.safeParse(json)
      if (parsed.success) {
        entities.push(...parsed.data)
      }
    }

    return new EntityCatalog(entities)
  }
}
