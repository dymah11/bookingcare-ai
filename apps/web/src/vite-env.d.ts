/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL của API. Để trống thì dùng relative URL (`/api/...`). */
  readonly VITE_API_BASE_URL?: string
}
