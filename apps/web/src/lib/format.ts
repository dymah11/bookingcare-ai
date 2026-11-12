export function formatPrice(price: number | undefined, currency = 'VND'): string {
  if (price === undefined || Number.isNaN(price)) {
    return ''
  }
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(price)
}

export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return isoDate
  }
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function truncate(text: string, limit = 120): string {
  if (text.length <= limit) {
    return text
  }
  return `${text.slice(0, limit - 1).trimEnd()}…`
}
