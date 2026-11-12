import type { BookingDraftInput } from '@bookingcare/shared'

/**
 * Sinh deep-link quay lại bookingcare.vn cho một booking draft.
 *
 * Lưu ý: đường dẫn `/tim-bam-kham` cùng tên tham số là giả định theo site
 * hiện tại — cần đối chiếu lại với bookingcare.vn trước khi đưa vào production
 * (xem mục "Giới hạn đã biết" trong README).
 */
function setIfPresent(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
): void {
  if (value !== undefined && value !== '') {
    params.set(key, value)
  }
}

export function buildBookingCareUrl(baseUrl: string, input: BookingDraftInput): string {
  const params = new URLSearchParams()

  setIfPresent(params, 'chuyen_khoa', input.specialtyId)
  setIfPresent(params, 'benh_vien', input.hospitalId)
  setIfPresent(params, 'dich_vu', input.serviceId)
  setIfPresent(params, 'bac_si', input.doctorId)

  params.set('ngay_kham', input.date)
  params.set('gio_kham', input.time)

  const base = baseUrl.replace(/\/+$/, '')
  return `${base}/tim-bam-kham?${params.toString()}`
}
