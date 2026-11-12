import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const sharedSrc = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url))
const sharedNodeSrc = fileURLToPath(new URL('../../packages/shared/src/node/index.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@bookingcare\/shared$/, replacement: sharedSrc },
      { find: /^@bookingcare\/shared\/node$/, replacement: sharedNodeSrc },
    ],
  },
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
