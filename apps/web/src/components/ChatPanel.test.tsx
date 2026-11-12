import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ChatPanel } from './ChatPanel'

function renderPanel(overrides: Partial<ComponentProps<typeof ChatPanel>> = {}) {
  return render(
    <ChatPanel
      messages={[]}
      cards={[]}
      booking={null}
      loading={false}
      onSend={vi.fn()}
      {...overrides}
    />,
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

  it('hiển thị thẻ kết quả', () => {
    renderPanel({
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
    })

    expect(screen.getByText('Bệnh viện Mẫu Tim mạch')).toBeInTheDocument()
    expect(screen.getByText('Quận 1, TP.HCM')).toBeInTheDocument()
  })

  it('hiển thị mã booking', () => {
    renderPanel({
      booking: {
        code: 'BC-7F3A9C21',
        draftId: 'draft-1',
        url: 'https://bookingcare.vn/tim-bam-kham?x=1',
        target: 'Khám tim mạch',
        patientName: 'Nguyễn Văn A',
        date: '2026-12-01',
        time: '09:00',
      },
    })

    expect(screen.getByText('BC-7F3A9C21')).toBeInTheDocument()
  })

  it('hiển thị trạng thái đang tải', () => {
    renderPanel({ loading: true })

    expect(screen.getByText('Đang tra cứu dữ liệu…')).toBeInTheDocument()
  })
})
