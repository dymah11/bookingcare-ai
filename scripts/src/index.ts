import { config as loadDotenv } from 'dotenv'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  buildTermIndex,
  chunkEntities,
  chunkToDocuments,
  cleanText,
  createLogger,
  crawledEntityListSchema,
  dedupeChunks,
  dedupeEntities,
  ENTITY_FILE_NAMES,
  OpenAIEmbedder,
  RETRIEVAL_INDEX_FILENAME,
  serializeTermIndex,
  type CrawledEntity,
  type RetrievalIndexFile,
} from '@bookingcare/shared'
import { findRepoRoot } from '@bookingcare/shared/node'
import { loadScriptConfig } from './config.js'

/** Đọc entity đã crawl từ `data/processed/{type}.json`. */
async function loadEntities(processedDir: string): Promise<CrawledEntity[]> {
  const entities: CrawledEntity[] = []

  for (const fileName of Object.values(ENTITY_FILE_NAMES)) {
    const path = resolve(processedDir, `${fileName}.json`)
    const raw = await readFile(path, 'utf8').catch(() => null)
    if (raw === null) continue

    let json: unknown
    try {
      json = JSON.parse(raw) as unknown
    } catch {
      continue
    }

    const parsed = crawledEntityListSchema.safeParse(json)
    if (!parsed.success) {
      continue
    }

    entities.push(...parsed.data)
  }

  return entities
}

/** Làm sạch text của entity: NFC → bỏ HTML → gộp khoảng trắng. */
function cleanEntity(entity: CrawledEntity): CrawledEntity {
  const base = {
    name: cleanText(entity.name),
    description: cleanText(entity.description),
  }

  if (entity.type === 'facility') {
    return {
      ...entity,
      ...base,
      address: cleanText(entity.address),
      area: cleanText(entity.area),
      city: cleanText(entity.city),
      phone: cleanText(entity.phone),
    }
  }

  if (entity.type === 'doctor') {
    return { ...entity, ...base, title: cleanText(entity.title) }
  }

  if (entity.type === 'service') {
    return { ...entity, ...base, priceNote: cleanText(entity.priceNote) }
  }

  return { ...entity, ...base }
}

async function main(): Promise<void> {
  const root = findRepoRoot(process.cwd())
  loadDotenv({ path: resolve(root, '.env') })

  const config = loadScriptConfig()
  const logger = createLogger({
    level: config.env.LOG_LEVEL,
    base: { service: 'scripts', script: 'index' },
  })

  const rawEntities = await loadEntities(config.processedDir)
  const entities = dedupeEntities(rawEntities.map(cleanEntity))
  const chunks = dedupeChunks(chunkEntities(entities))

  logger.info('corpus_ready', {
    raw: rawEntities.length,
    afterDedupe: entities.length,
    chunks: chunks.length,
  })

  const documents = chunkToDocuments(chunks)
  const bm25Unaccented = serializeTermIndex(buildTermIndex(documents.unaccented))
  const bm25Accented = serializeTermIndex(buildTermIndex(documents.accented))

  // Embedding là tùy chọn: thiếu OPENAI_API_KEY thì index vẫn dùng được với BM25.
  let embeddings: number[][] = []
  let embeddingModel = ''

  if (config.env.OPENAI_API_KEY.trim() !== '' && chunks.length > 0) {
    const embedder = new OpenAIEmbedder({
      apiKey: config.env.OPENAI_API_KEY,
      model: config.env.EMBEDDING_MODEL,
    })
    embeddings = await embedder.embedMany(chunks.map((chunk) => chunk.text))
    embeddingModel = config.env.EMBEDDING_MODEL
    logger.info('embeddings_built', { model: embeddingModel, count: embeddings.length })
  } else {
    logger.warn('embeddings_skipped', {
      reason:
        config.env.OPENAI_API_KEY.trim() === ''
          ? 'Thiếu OPENAI_API_KEY — chỉ dùng BM25'
          : 'Không có chunk để embedding',
    })
  }

  const index: RetrievalIndexFile = {
    version: 1,
    createdAt: new Date().toISOString(),
    embeddingModel,
    dimension: embeddings[0]?.length ?? 0,
    chunks,
    bm25Unaccented,
    bm25Accented,
    embeddings,
  }

  await mkdir(config.processedDir, { recursive: true })
  const outputPath = resolve(config.processedDir, RETRIEVAL_INDEX_FILENAME)
  await writeFile(outputPath, JSON.stringify(index), 'utf8')

  logger.info('index_built', {
    file: outputPath,
    chunks: chunks.length,
    terms: Object.keys(bm25Unaccented.terms).length,
    accentedTerms: Object.keys(bm25Accented.terms).length,
    embeddings: embeddings.length,
  })
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main().catch((error: unknown) => {
    console.error('Dựng index thất bại:', error)
    process.exitCode = 1
  })
}
