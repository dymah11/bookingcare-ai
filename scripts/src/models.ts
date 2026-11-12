import { config as loadDotenv } from 'dotenv'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listModels, loadEnv } from '@bookingcare/shared'
import { findRepoRoot } from '@bookingcare/shared/node'

/**
 * Liệt kê model mà GEMINI_API_KEY được cấp quyền.
 *
 * Gọi `GET /v1beta/models` KHÔNG tốn quota — dùng để biết chính xác model id
 * nào dùng được, thay vì đoán rồi ăn 404 (model không còn dùng được cho key).
 */
async function main(): Promise<void> {
  const root = findRepoRoot(process.cwd())
  loadDotenv({ path: resolve(root, '.env') })

  const env = loadEnv(process.env)
  if (env.GEMINI_API_KEY.trim() === '') {
    console.error('Thiếu GEMINI_API_KEY trong .env')
    process.exitCode = 1
    return
  }

  const models = await listModels(env.GEMINI_API_KEY)

  const chat = models.filter((model) => model.supportsChat)
  const embedding = models.filter((model) => model.supportsEmbedding)

  console.log('\n== Model dùng được cho chat (generateContent) ==')
  for (const model of chat) {
    console.log(`  ${model.id}${model.displayName !== model.id ? `  (${model.displayName})` : ''}`)
  }

  console.log('\n== Model embedding (embedContent) ==')
  for (const model of embedding) {
    console.log(`  ${model.id}${model.displayName !== model.id ? `  (${model.displayName})` : ''}`)
  }

  console.log(
    `\nĐặt model dự phòng trong .env:\n  GEMINI_MODEL=${chat[0]?.id ?? '<model-id>'}\n  GEMINI_MODEL_FALLBACKS=${chat[1]?.id ?? '<model-id>'}`,
  )
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main().catch((error: unknown) => {
    console.error('Không liệt kê được model:', error)
    process.exitCode = 1
  })
}
