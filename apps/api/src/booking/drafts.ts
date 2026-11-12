import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { bookingDraftInputSchema, bookingDraftListSchema, type BookingDraft } from '@bookingcare/shared'
import { buildBookingCareUrl } from './url.js'

export type BookingDraftStoreOptions = {
  /** Đường dẫn file JSON lưu draft, ví dụ `data/processed/booking-drafts.json`. */
  filePath: string
  /** Gốc của bookingcare.vn để sinh deep-link. */
  baseUrl: string
}

/** Mã booking hiển thị cho người dùng, ví dụ "BC-7F3A9C21". */
export function generateBookingCode(): string {
  return `BC-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

/**
 * Lưu booking draft cục bộ.
 *
 * Đặt lịch là mô phỏng: hệ thống không gọi API đặt lịch thật của bookingcare.vn,
 * chỉ ghi nhận lựa chọn của người dùng và trả về link để họ tự hoàn tất.
 */
export class BookingDraftStore {
  private readonly filePath: string
  private readonly baseUrl: string
  private cache: BookingDraft[] | null = null

  constructor(options: BookingDraftStoreOptions) {
    this.filePath = options.filePath
    this.baseUrl = options.baseUrl
  }

  async list(): Promise<BookingDraft[]> {
    return [...(await this.readAll())]
  }

  async get(id: string): Promise<BookingDraft | undefined> {
    const drafts = await this.readAll()
    return drafts.find((draft) => draft.id === id)
  }

  async create(rawInput: unknown): Promise<BookingDraft> {
    const input = bookingDraftInputSchema.parse(rawInput)
    const draft: BookingDraft = {
      id: randomUUID(),
      code: generateBookingCode(),
      createdAt: new Date().toISOString(),
      status: 'draft',
      input,
      bookingcareUrl: buildBookingCareUrl(this.baseUrl, input),
    }

    const drafts = await this.readAll()
    drafts.push(draft)
    await this.persist(drafts)

    return draft
  }

  private async readAll(): Promise<BookingDraft[]> {
    if (this.cache) {
      return this.cache
    }

    try {
      const raw = await readFile(this.filePath, 'utf8')
      const json = JSON.parse(raw) as unknown
      const parsed = bookingDraftListSchema.safeParse(json)
      this.cache = parsed.success ? parsed.data : []
    } catch {
      this.cache = []
    }

    return this.cache
  }

  private async persist(drafts: BookingDraft[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, `${JSON.stringify(drafts, null, 2)}\n`, 'utf8')
    this.cache = drafts
  }
}
