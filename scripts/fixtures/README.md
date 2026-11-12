# Dữ liệu mẫu (synthetic)

`seed-entities.json` là **dữ liệu tổng hợp do AI tạo**, dùng để chạy thử pipeline
(`pnpm seed` → `pnpm index` → `pnpm eval:retrieval`) khi chưa có dữ liệu crawl thật.

- Tên mọi cơ sở/bác sĩ đều có tiền tố **"Mẫu"** để không lẫn với cơ sở thật.
- URL trỏ tới `bookingcare.vn` chỉ để mô phỏng định dạng URL crawl được, **không
  khẳng định những trang đó tồn tại**.
- Giá, địa chỉ và thông tin trong file hoàn toàn là hư cấu.

Khi đã chạy `pnpm crawl --all` với dữ liệu thật, hãy xoá các file
`data/processed/{specialties,facilities,doctors,services}.json` do seed tạo ra
(trước khi chạy lại `pnpm index`).
