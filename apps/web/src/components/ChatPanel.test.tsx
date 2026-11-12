import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ChatPanel } from './ChatPanel'

function renderPanel(overrides: Partial<ComponentProps<typeof ChatPanel>> = {}) {
  return render(
    <ChatPanel messages={[]} loading={false} onSend={vi.fn()} {...overrides} />,
  )
}

describe('ChatPanel', () => {
  it('hiển thị lịch sử tin nhắn', () => {
    renderPanel({
      messages: [{ role: 'user', content: 'Bệnh viện tim mạch ở đâu?' }],
    })

    expect(screen.getByText('Bệnh viện tim mạch ở đâu?')).toBeInTheDocument()
  })

  it('gửi nội dung khi bấm nút Gửi', () => {
    const onSend = vi.fn()
    renderPanel({ onSend })

    fireEvent.change(screen.getByLabelText('Câu hỏi của bạn'), { target: { value: 'Tim mạch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }))

    expect(onSend).toHaveBeenCalledWith('Tim mạch')
  })

  it('không gửi khi nội dung rỗng', () => {
    const onSend = vi.fn()
    renderPanel({ onSend })

    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }))

    expect(onSend).not.toHaveBeenCalled()
  })

  it('hiển thị thẻ kết quả của đúng tin nhắn', () => {
    renderPanel({
      messages: [
        { role: 'user', content: 'Câu hỏi 1' },
        {
          role: 'assistant',
          content: 'Kết quả 1',
          cards: [
            {
              kind: 'facility',
              id: 'facility-bv-1',
              title: 'Bệnh viện Mẫu Tim mạch',
              subtitle: 'tim mạch',
              url: 'https://bookingcare.vn/benh-vien/bv-1',
              fields: [{ label: 'Khu vực', value: 'Quận 1, TP.HCM' }],
            },
          ],
        },
        { role: 'user', content: 'Câu hỏi 2' },
      ],
    })

    expect(screen.getByText('Kết quả 1')).toBeInTheDocument()
    expect(screen.getByText('Bệnh viện Mẫu Tim mạch')).toBeInTheDocument()
    expect(screen.getByText('Quận 1, TP.HCM')).toBeInTheDocument()
    // Chỉ một khối "Kết quả" — thuộc về tin nhắn có cards.
    expect(screen.getAllByText('Kết quả')).toHaveLength(1)
  })

  it('hiển thị mã booking của đúng tin nhắn', () => {
    renderPanel({
      messages: [
        {
          role: 'assistant',
          content: 'Đã tạo draft',
          booking: {
            code: 'BC-7F3A9C21',
            draftId: 'draft-1',
            url: 'https://bookingcare.vn/tim-bam-kham?x=1',
            target: 'Khám tim mạch',
            patientName: 'Nguyễn Văn A',
            date: '2026-12-01',
            time: '09:00',
          },
        },
      ],
    })

    expect(screen.getByText('BC-7F3A9C21')).toBeInTheDocument()
  })

  it('hiển thị trạng thái đang tải kèm đồng hồ', () => {
    renderPanel({ loading: true, status: 'Đang tra cứu: search_facilities…' })

    expect(screen.getByText(/Đang tra cứu: search_facilities/)).toBeInTheDocument()
  })
})
