import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import {
  bookingDraftInputSchema,
  type CrawledEntity,
  type EntityType,
  type Logger,
  type SearchResult,
} from '@bookingcare/shared'
import type { BookingDraftStore } from '../booking/drafts.js'
import type { EntityCatalog } from '../retrieval/catalog.js'
import type { RetrievalStore } from '../retrieval/store.js'
import type { ChatSession } from './session.js'
import type { BookingEvent, ResultCard } from './types.js'

/** Ngân sách ký tự cho kết quả tool — giữ tổng input token thấp. */
const MAX_TOOL_RESULT_CHARS = 1600

export type ToolContext = {
  store: RetrievalStore
  catalog: EntityCatalog
  drafts: BookingDraftStore
  logger: Logger
  session: ChatSession
  /** Thẻ kết quả tích luỹ trong lượt này (để đẩy sang UI). */
  cards: ResultCard[]
  /** Sự kiện booking tích luỹ trong lượt này. */
  bookings: BookingEvent[]
}

export const searchDoctorsSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Từ khoá tìm bác sĩ: tên, chuyên khoa hoặc cơ sở y tế. Ví dụ "tim mạch", "bác sĩ Nguyễn".'),
  specialty: z.string().optional().describe('Chuyên khoa cần tìm, ví dụ "Tim mạch".'),
  area: z.string().optional().describe('Tỉnh/thành hoặc quận, ví dụ "Hà Nội".'),
  limit: z.number().int().min(1).max(8).optional().describe('Số kết quả tối đa, mặc định 5.'),
})

export const searchFacilitiesSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Từ khoá tìm cơ sở y tế: tên, chuyên khoa hoặc khu vực. Ví dụ "bệnh viện đa khoa hà nội".'),
  specialty: z.string().optional().describe('Chuyên khoa cần tìm, ví dụ "Tim mạch".'),
  area: z.string().optional().describe('Tỉnh/thành hoặc quận, ví dụ "TP.HCM".'),
  limit: z.number().int().min(1).max(8).optional().describe('Số kết quả tối đa, mặc định 5.'),
})

export const searchServicesSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Từ khoá tìm dịch vụ khám: tên gói khám, chuyên khoa. Ví dụ "khám tổng quát", "gói khám mắt".'),
  specialty: z.string().optional().describe('Chuyên khoa của dịch vụ, ví dụ "Nội khoa".'),
  area: z.string().optional().describe('Tỉnh/thành hoặc quận, ví dụ "Đà Nẵng".'),
  limit: z.number().int().min(1).max(8).optional().describe('Số kết quả tối đa, mặc định 5.'),
})

export const getEntityDetailsSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      'Id của thực thể, lấy từ kết quả search trước đó. Ví dụ "doctor-nguyen-van-an".',
    ),
  type: z
    .enum(['specialty', 'facility', 'doctor', 'service'])
    .optional()
    .describe('Loại thực thể, nếu đã biết.'),
})

export const createBookingDraftSchema = z.object({
  service_or_doctor: z
    .string()
    .min(1)
    .describe('Tên dịch vụ khám hoặc bác sĩ mà người dùng chọn.'),
  specialty_id: z.string().optional().describe('Id chuyên khoa nếu đã biết.'),
  facility_id: z.string().optional().describe('Id cơ sở y tế nếu đã biết.'),
  doctor_id: z.string().optional().describe('Id bác sĩ nếu đã biết.'),
  service_id: z.string().optional().describe('Id dịch vụ khám nếu đã biết.'),
  patient_name: z.string().optional().describe('Họ tên người đặt lịch.'),
  patient_phone: z.string().optional().describe('Số điện thoại liên hệ.'),
  preferred_date: z.string().optional().describe('Ngày mong muốn, định dạng YYYY-MM-DD.'),
  preferred_time: z.string().optional().describe('Giờ mong muốn, định dạng HH:mm (24 giờ).'),
  note: z.string().optional().describe('Ghi chú thêm cho cơ sở y tế.'),
  confirm: z
    .boolean()
    .default(false)
    .describe('Chỉ đặt true sau khi người dùng đã xác nhận rõ ràng.'),
})

function toCard(hit: SearchResult): ResultCard {
  const fields: { label: string; value: string }[] = []
  if (hit.specialty !== '') fields.push({ label: 'Chuyên khoa', value: hit.specialty })
  if (hit.area !== '') fields.push({ label: 'Khu vực', value: hit.area })

  return {
    kind: hit.type as EntityType,
    id: hit.id,
    title: hit.name,
    subtitle: hit.specialty !== '' ? hit.specialty : hit.area,
    url: hit.url,
    fields,
  }
}

function entityToCard(entity: CrawledEntity): ResultCard {
  const fields: { label: string; value: string }[] = []
  if (entity.type === 'facility') {
    if (entity.address !== '') fields.push({ label: 'Địa chỉ', value: entity.address })
    if (entity.area !== '' || entity.city !== '') {
      fields.push({ label: 'Khu vực', value: [entity.area, entity.city].filter(Boolean).join(', ') })
    }
    if (entity.phone !== '') fields.push({ label: 'Điện thoại', value: entity.phone })
  }
  if (entity.type === 'doctor' && entity.title !== '') {
    fields.push({ label: 'Chức danh', value: entity.title })
  }
  if (entity.type === 'service' && entity.price !== undefined) {
    fields.push({ label: 'Giá', value: `${entity.price} ${entity.currency}` })
  }
  if (entity.specialtyIds.length > 0) {
    fields.push({ label: 'Chuyên khoa', value: entity.specialtyIds.join(', ') })
  }

  return {
    kind: entity.type,
    id: entity.id,
    title: entity.name,
    subtitle: entity.description.slice(0, 120),
    url: entity.url,
    fields,
  }
}

function describeEntity(entity: CrawledEntity): string {
  const lines = [`${entity.name} (${entity.type})`]

  if (entity.type === 'facility') {
    if (entity.address !== '') lines.push(`Địa chỉ: ${entity.address}`)
    const area = [entity.area, entity.city].filter(Boolean).join(', ')
    if (area !== '') lines.push(`Khu vực: ${area}`)
    if (entity.phone !== '') lines.push(`Điện thoại: ${entity.phone}`)
  }

  if (entity.type === 'doctor' && entity.title !== '') {
    lines.push(`Chức danh: ${entity.title}`)
  }

  if (entity.type === 'service' && entity.price !== undefined) {
    lines.push(`Giá: ${entity.price} ${entity.currency}`)
  }

  if (entity.specialtyIds.length > 0) {
    lines.push(`Chuyên khoa: ${entity.specialtyIds.join(', ')}`)
  }
  if (entity.description !== '') lines.push(entity.description.slice(0, 600))
  lines.push(`URL: ${entity.url}`)

  return lines.join('\n')
}

async function runSearch(
  ctx: ToolContext,
  type: EntityType,
  query: string,
  specialty: string | undefined,
  area: string | undefined,
  limit: number,
  label: string,
): Promise<string> {
  const hits = await ctx.store.search(query, { type, specialty, area, k: limit })

  if (hits.length === 0) {
    return `Không tìm thấy ${label} nào khớp "${query}" trong dữ liệu hiện có. Hãy nói rõ với người dùng rằng chưa có dữ liệu và gợi ý họ xem trực tiếp trên bookingcare.vn.`
  }

  ctx.cards.push(...hits.map(toCard))

  const lines = hits.map(
    (hit, index) =>
      `${index + 1}. ${hit.name}${hit.specialty !== '' ? ` | ${hit.specialty}` : ''}${hit.area !== '' ? ` | ${hit.area}` : ''} | ${hit.url}`,
  )

  const text = lines.join('\n')
  return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…` : text
}

export function createSearchDoctorsTool(ctx: ToolContext): DynamicStructuredTool {
  return DynamicStructuredTool.from({
    name: 'search_doctors',
    description:
      'Tìm bác sĩ theo tên, chuyên khoa hoặc khu vực. Trả về tối đa 8 bác sĩ kèm chuyên khoa, khu vực và link nguồn.',
    schema: searchDoctorsSchema,
    func: async (input: z.infer<typeof searchDoctorsSchema>) =>
      runSearch(
        ctx,
        'doctor',
        input.query,
        input.specialty,
        input.area,
        input.limit ?? 5,
        'bác sĩ',
      ),
  })
}

export function createSearchFacilitiesTool(ctx: ToolContext): DynamicStructuredTool {
  return DynamicStructuredTool.from({
    name: 'search_facilities',
    description:
      'Tìm bệnh viện, phòng khám hoặc cơ sở y tế theo tên, chuyên khoa hoặc khu vực. Trả về tối đa 8 cơ sở kèm địa chỉ, khu vực và link nguồn.',
    schema: searchFacilitiesSchema,
    func: async (input: z.infer<typeof searchFacilitiesSchema>) =>
      runSearch(
        ctx,
        'facility',
        input.query,
        input.specialty,
        input.area,
        input.limit ?? 5,
        'cơ sở y tế',
      ),
  })
}

export function createSearchServicesTool(ctx: ToolContext): DynamicStructuredTool {
  return DynamicStructuredTool.from({
    name: 'search_services',
    description:
      'Tìm dịch vụ khám hoặc gói khám theo tên, chuyên khoa hoặc khu vực. Trả về tối đa 8 dịch vụ kèm giá (nếu có) và link nguồn.',
    schema: searchServicesSchema,
    func: async (input: z.infer<typeof searchServicesSchema>) =>
      runSearch(
        ctx,
        'service',
        input.query,
        input.specialty,
        input.area,
        input.limit ?? 5,
        'dịch vụ khám',
      ),
  })
}

export function createGetEntityDetailsTool(ctx: ToolContext): DynamicStructuredTool {
  return DynamicStructuredTool.from({
    name: 'get_entity_details',
    description:
      'Lấy chi tiết đầy đủ của một bác sĩ, cơ sở y tế, dịch vụ hoặc chuyên khoa đã biết id (lấy id từ kết quả search trước đó).',
    schema: getEntityDetailsSchema,
    func: async (input: z.infer<typeof getEntityDetailsSchema>) => {
      const entity = ctx.catalog.get(input.id)
      if (entity === undefined) {
        return `Không tìm thấy thực thể có id "${input.id}" trong catalog.`
      }

      ctx.cards.push(entityToCard(entity))
      return describeEntity(entity)
    },
  })
}

export function createBookingDraftTool(ctx: ToolContext): DynamicStructuredTool {
  return DynamicStructuredTool.from({
    name: 'create_booking_draft',
    description:
      'Tạo booking draft (mô phỏng, KHÔNG đặt lịch thật) và trả mã booking + link bookingcare.vn. Gọi lần đầu với confirm=false để xin người dùng xác nhận, chỉ gọi lại với confirm=true sau khi họ đồng ý rõ ràng.',
    schema: createBookingDraftSchema,
    func: async (input: z.infer<typeof createBookingDraftSchema>) => {
      const missing: string[] = []
      if (input.patient_name === undefined || input.patient_name.trim() === '') missing.push('họ tên')
      if (input.patient_phone === undefined || input.patient_phone.trim() === '') {
        missing.push('số điện thoại')
      }
      if (input.preferred_date === undefined || input.preferred_date.trim() === '') {
        missing.push('ngày mong muốn')
      }
      if (input.preferred_time === undefined || input.preferred_time.trim() === '') {
        missing.push('giờ mong muốn')
      }

      if (missing.length > 0) {
        return `Còn thiếu thông tin: ${missing.join(', ')}. Hãy hỏi người dùng các thông tin này rồi gọi lại tool.`
      }

      const parsed = bookingDraftInputSchema.safeParse({
        specialtyId: input.specialty_id ?? '',
        hospitalId: input.facility_id ?? '',
        serviceId: input.service_id ?? '',
        doctorId: input.doctor_id ?? '',
        date: input.preferred_date,
        time: input.preferred_time,
        patientName: input.patient_name,
        patientPhone: input.patient_phone,
        note: input.note,
      })

      if (!parsed.success) {
        const issue = parsed.error.issues[0]?.message ?? 'không rõ'
        return `Thông tin đặt lịch chưa đúng định dạng (${issue}). Hãy hỏi lại người dùng.`
      }

      const draftInput = parsed.data

      if (input.confirm !== true) {
        ctx.session.pendingBooking = { input: draftInput, createdAt: new Date().toISOString() }

        return [
          'Cần người dùng xác nhận trước khi tạo booking draft:',
          `- Dịch vụ / bác sĩ: ${input.service_or_doctor}`,
          `- Ngày: ${draftInput.date} lúc ${draftInput.time}`,
          `- Họ tên: ${draftInput.patientName}`,
          `- Điện thoại: ${draftInput.patientPhone}`,
          'Hãy hỏi lại người dùng; chỉ khi họ nói rõ đồng ý thì mới gọi lại tool với confirm=true.',
        ].join('\n')
      }

      const draft = await ctx.drafts.create(draftInput)
      ctx.session.pendingBooking = null

      ctx.bookings.push({
        code: draft.code,
        draftId: draft.id,
        url: draft.bookingcareUrl,
        target: input.service_or_doctor,
        patientName: draft.input.patientName,
        date: draft.input.date,
        time: draft.input.time,
      })

      return `Đã tạo booking draft ${draft.code} (mô phỏng — chưa đặt lịch thật). Người dùng cần mở link ${draft.bookingcareUrl} để hoàn tất đặt lịch trên bookingcare.vn.`
    },
  })
}

/** Tạo đủ 5 tool cho agent. */
export function createAgentTools(ctx: ToolContext): DynamicStructuredTool[] {
  return [
    createSearchDoctorsTool(ctx),
    createSearchFacilitiesTool(ctx),
    createSearchServicesTool(ctx),
    createGetEntityDetailsTool(ctx),
    createBookingDraftTool(ctx),
  ]
}
