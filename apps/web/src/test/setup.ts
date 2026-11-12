import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// `globals: false` nên React Testing Library không tự đăng ký cleanup —
// phải gọi tay để DOM không bị dồn giữa các test.
afterEach(() => {
  cleanup()
})
