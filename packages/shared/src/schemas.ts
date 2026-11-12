import { z } from 'zod'

export const chatRoleSchema = z.enum(['user', 'assistant', 'system'])

export const chatMessageSchema = z.object({
  role: chatRoleSchema,
  content: z.string().min(1).max(8000),
})

export const chatRequestSchema = z.object({
  message: z.string().min(1, 'message không được rỗng').max(4000, 'message quá dài'),
  history: z.array(chatMessageSchema).max(20, 'history quá dài').default([]),
})

/**
 * Body của `POST /api/chat`.
 *
 * `sessionId` cho phép nhớ lịch sử giữa các lượt; nếu không có thì server tự
 * sinh. `stream: true` (hoặc `Accept: text/event-stream`) trả về SSE.
 */
export const chatTurnRequestSchema = z.object({
  sessionId: z.string().min(1).max(128).optional(),
  message: z.string().min(1, 'message không được rỗng').max(4000, 'message quá dài'),
  history: z.array(chatMessageSchema).max(20).optional(),
  stream: z.boolean().optional(),
})

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'q không được rỗng').max(200, 'q quá dài'),
  topK: z.coerce.number().int().min(1).max(50).default(5),
  type: z.string().min(1).max(50).optional(),
  specialty: z.string().min(1).max(100).optional(),
  area: z.string().min(1).max(100).optional(),
})

export const bookingDraftInputSchema = z.object({
  specialtyId: z.string().default(''),
  hospitalId: z.string().default(''),
  serviceId: z.string().default(''),
  doctorId: z.string().default(''),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date phải có dạng YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'time phải có dạng HH:mm'),
  patientName: z.string().min(1).max(120),
  patientPhone: z.string().min(8).max(20),
  note: z.string().max(500).optional(),
})

export const bookingDraftSchema = z.object({
  id: z.string().min(1),
  /** Mã booking hiển thị cho người dùng, ví dụ "BC-7F3A9C21". */
  code: z.string().default(''),
  createdAt: z.string().min(1),
  status: z.literal('draft'),
  input: bookingDraftInputSchema,
  bookingcareUrl: z.string().url(),
})

export const bookingDraftListSchema = z.array(bookingDraftSchema)

export const serializedTermIndexSchema = z.object({
  totalDocuments: z.number().int().nonnegative(),
  totalTerms: z.number().int().nonnegative(),
  averageDocumentLength: z.number().nonnegative(),
  documentLengths: z.record(z.string(), z.number().nonnegative()),
  terms: z.record(
    z.string(),
    z.object({
      documentFrequency: z.number().int().nonnegative(),
      postings: z.record(z.string(), z.number().nonnegative()),
    }),
  ),
})

export const chunkMetadataSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  name: z.string(),
  specialty: z.string(),
  area: z.string(),
  url: z.string().url(),
  specialtyIds: z.array(z.string()),
})

export const chunkSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  metadata: chunkMetadataSchema,
})

export const retrievalIndexSchema = z.object({
  version: z.literal(1),
  createdAt: z.string().min(1),
  embeddingModel: z.string(),
  dimension: z.number().int().nonnegative(),
  chunks: z.array(chunkSchema),
  bm25Unaccented: serializedTermIndexSchema,
  bm25Accented: serializedTermIndexSchema,
  embeddings: z.array(z.array(z.number())),
})

export const retrievalEvalExpectedSchema = z.object({
  /** Tên (hoặc id) của thực thể đúng — so khớp không phân biệt dấu/hoa thường. */
  name: z.string().min(1),
  id: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
})

export const retrievalEvalCaseSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  expected: z.array(retrievalEvalExpectedSchema).min(1),
  tags: z.array(z.string()).default([]),
})

export const retrievalEvalFileSchema = z.object({
  version: z.literal(1),
  queries: z.array(retrievalEvalCaseSchema),
})

/** Kịch bản hội thoại dùng để thử nhanh agent. */
export const chatScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  turns: z.array(z.object({ user: z.string().min(1) })).min(1),
  expect: z
    .object({
      /** Tool bắt buộc phải được gọi trong kịch bản. */
      mustUseTools: z.array(z.string()).default([]),
      /** Cụm từ không được xuất hiện trong câu trả lời. */
      mustNotSay: z.array(z.string()).default([]),
      /** Cụm từ bắt buộc phải xuất hiện trong câu trả lời. */
      mustSay: z.array(z.string()).default([]),
      /** Không được tạo booking draft trong kịch bản này. */
      mustNotCreateBooking: z.boolean().default(false),
      /** Số vòng tool call tối đa được phép dùng. */
      maxToolRounds: z.number().int().min(0).max(5).default(2),
    })
    .default({}),
  tags: z.array(z.string()).default([]),
})

export const chatScenarioFileSchema = z.object({
  version: z.literal(1),
  scenarios: z.array(chatScenarioSchema),
})

export const evalCaseSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  expect: z
    .object({
      mustInclude: z.array(z.string()).default([]),
      mustNotInclude: z.array(z.string()).default([]),
    })
    .default({}),
  tags: z.array(z.string()).default([]),
})

export type SearchQuery = z.infer<typeof searchQuerySchema>
export type ChatRequestBody = z.infer<typeof chatRequestSchema>
export type ChatTurnRequestBody = z.infer<typeof chatTurnRequestSchema>
export type BookingDraftInputParsed = z.infer<typeof bookingDraftInputSchema>
export type RetrievalEvalCase = z.infer<typeof retrievalEvalCaseSchema>
export type RetrievalEvalExpected = z.infer<typeof retrievalEvalExpectedSchema>
export type ChatScenario = z.infer<typeof chatScenarioSchema>
export type EvalCase = z.infer<typeof evalCaseSchema>
