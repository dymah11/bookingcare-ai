/**
 * Không augment `Express.Request`/`Express.Locals` ở đây: các generic của
 * `@types/express` khác nhau giữa các phiên bản nên augment dễ sinh lỗi
 * "All declarations of 'Request' must have identical type parameters".
 *
 * Context của request (requestId, startedAt) được lưu trong WeakMap — xem
 * `src/middleware/request-context.ts`.
 */
export {}
