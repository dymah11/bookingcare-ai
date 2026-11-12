# bookingcare-ai

Trợ lý AI **tìm kiếm · hỏi đáp · đặt lịch khám** dựa trên dữ liệu công khai của
[bookingcare.vn](https://bookingcare.vn).

> ⚠️ Trợ lý **không chẩn đoán bệnh** và chỉ trả lời dựa trên dữ liệu đã truy xuất.
> Đặt lịch là **mô phỏng**: hệ thống lưu booking draft và trả link quay lại
> bookingcare.vn để người dùng tự hoàn tất.

Xem [`CLAUDE.md`](CLAUDE.md) để biết mục tiêu, stack, model, ràng buộc và quy ước của repo.

## Cấu trúc

```
apps/
  web/           # Vite + React + TypeScript (giao diện chat)
  api/           # Node + Express + TypeScript (search / chat / booking draft)
packages/
  shared/        # types + zod schemas + truy xuất lai dùng chung
scripts/         # crawl → index → eval
data/
  raw/           # cache HTML thô của crawler (gitignore)
  processed/     # {specialties,facilities,doctors,services}.json + retrieval-index.json (gitignore)
eval/
  cases/         # bộ câu hỏi đánh giá chất lượng trợ lý
  retrieval-queries.json  # 20 truy vấn đánh giá retrieval (có đáp án mong đợi)
  results/       # báo cáo mỗi lần chạy eval (gitignore)
```

## Yêu cầu

- Node.js ≥ 20.19
- pnpm ≥ 9 (repo dùng `packageManager: pnpm@10.0.0`)
- Chromium cho Playwright (chỉ cần khi crawl): `pnpm --filter @bookingcare/scripts crawl:install`

## Cài đặt

```bash
pnpm install
cp .env.example .env      # rồi điền GEMINI_API_KEY
```

Toàn bộ suy luận dùng **Google Gemini** — một API key cho cả trợ lý, judge và embedding
(lấy ở [aistudio.google.com/apikey](https://aistudio.google.com/apikey)).

Không có API key nào được hardcode trong mã nguồn. Thiếu `GEMINI_API_KEY` thì API
vẫn khởi động được; chỉ endpoint `/api/chat` trả `503`. Thiếu key thì tìm kiếm lai
chỉ dùng BM25 (không có nhánh embedding).

## Chạy

```bash
pnpm build       # shared → api → scripts → web
pnpm dev         # chạy song song api (3001) và web (5173)
pnpm dev:api
pnpm dev:web
```

Web dev server proxy `/api` sang `http://localhost:3001`, nên không phải cấu hình CORS khi dev.

## Pipeline dữ liệu

```bash
pnpm crawl          # scripts/crawl.ts → data/raw (cache HTML) + data/processed/{type}.json
pnpm seed           # ghi dữ liệu MẪU (synthetic) vào data/processed — dùng khi chưa crawl được
pnpm index          # scripts/index.ts → data/processed/retrieval-index.json
pnpm eval:retrieval # scripts/eval-retrieval.ts → recall@5 + MRR
pnpm eval           # scripts/eval.ts → chấm chất lượng câu trả lời của trợ lý
```

- `crawl` tôn trọng `robots.txt`, giới hạn số trang (`CRAWL_MAX_PAGES`), delay 1–2s
  giữa các request, concurrency tối đa 2, retry + backoff, và cache HTML thô vào
  `data/raw/html/` để chạy lại không phải tải lại.
  - `pnpm crawl --type doctors --limit 50`
  - `pnpm crawl --all`
  - `pnpm crawl --probe <url>` — in JSON-LD + selector khớp để calibrate selector.
  - Thiếu Chromium thì `crawl` **dừng ngay** kèm lệnh cài đặt, thay vì chạy xong
    rồi ra 0 bản ghi. Mọi lỗi tải trang đều được log kèm lý do ở `crawl_fetch_failed`.
    Chạy `pnpm doctor` để kiểm tra nhanh môi trường.
- `index` làm sạch → khử trùng lặp → chunk (≤ ~500 token) → dựng BM25 (bỏ dấu + có
  dấu) → embedding (nếu có `GEMINI_API_KEY`) → ghi `retrieval-index.json`.
- `eval:retrieval` đọc `eval/retrieval-queries.json` và tính **recall@5** + **MRR**.

> `pnpm seed` ghi dữ liệu **tổng hợp** (tên đều có tiền tố "Mẫu") để chạy thử khi chưa
> có dữ liệu crawl thật — xem [`scripts/fixtures/README.md`](scripts/fixtures/README.md).

## Truy xuất lai

| Thành phần | Chi tiết |
| --- | --- |
| Làm sạch | Unicode NFC → bỏ HTML/entity → gộp khoảng trắng; khử trùng lặp theo tên + mô tả |
| Chunking | 1 thực thể = 1 chunk; mô tả dài cắt theo câu, mỗi chunk ≤ ~500 token, luôn kèm tên |
| Metadata | `type`, `id`, `name`, `specialty`, `area`, `url`, `specialtyIds` |
| Xếp hạng | BM25 bỏ dấu + BM25 có dấu + embedding (`gemini-embedding-001`) |

> **Quota embedding**: free tier Gemini cho phép **100 embed-content/phút** (tính theo
> số văn bản, không theo số HTTP request). `pnpm index` tự nhịp độ theo
> `EMBEDDING_RATE_PER_MINUTE` và retry khi gặp 429. Muốn dựng index nhanh (chỉ
> BM25, không tốn quota) thì đặt `INDEX_EMBEDDINGS=false` — lỗi embedding **không**
> làm hỏng việc dựng index.
| Gộp | Reciprocal Rank Fusion (k = 60) |
| Lưu trữ | `data/processed/retrieval-index.json` — nạp nhanh lúc khởi động, không dùng DB ngoài |

Lõi truy xuất nằm ở `packages/shared/src/search/retriever.ts` nên API và script eval
dùng chung đúng một code path.

## Agent (LangGraph)

Trợ lý hội thoại nằm ở `apps/api/src/agent`, chạy trên **Gemini**
(`GEMINI_MODEL`, mặc định `gemini-3.8-flash`; `maxOutputTokens: 500`, suy luận theo
`GEMINI_THINKING_LEVEL` cho dòng 3.x — viết HOA `LOW`/`MEDIUM`/`HIGH`).

> `gemini-2.5-flash` không dùng được với key mới (404 "no longer available to new users").

```bash
pnpm models   # liệt kê model id mà key được cấp quyền — không tốn quota
```

`GEMINI_MODEL_FALLBACKS` khai báo các model dự phòng (dấu phẩy phân tách); khi
model chính lỗi 503/429/404, agent chuyển sang model kế tiếp (503 còn thử lại cùng
model một lần sau 2s vì thường chỉ quá tải tạm thời). Nếu để trống, API **tự dò**
model dùng được qua `GET /v1beta/models` — lệnh này không tốn quota.

> Tham số suy luận được truyền qua field `thinkingConfig` của
> `@langchain/google-genai` (dòng Gemini 3+ dùng `thinkingLevel` viết HOA:
> `LOW`/`MEDIUM`/`HIGH`). Nếu model của bạn không nhận `MEDIUM`, đặt
> `GEMINI_THINKING_LEVEL=low` trong `.env`.

**Tool** (mô tả tiếng Việt, validate bằng zod):

| Tool | Việc |
| --- | --- |
| `search_doctors` | Tìm bác sĩ theo tên / chuyên khoa / khu vực |
| `search_facilities` | Tìm bệnh viện, phòng khám, cơ sở y tế |
| `search_services` | Tìm dịch vụ / gói khám (kèm giá nếu có) |
| `get_entity_details` | Chi tiết đầy đủ của một thực thể theo `id` |
| `create_booking_draft` | Tạo booking draft (mô phỏng) → mã booking + link bookingcare.vn |

**Ràng buộc mỗi lượt:** tối đa **2 vòng gọi tool**; kết quả tool được rút gọn
để tổng input ≤ 30k token; lịch sử chỉ giữ **N lượt gần nhất** kèm **bản tóm tắt**
các lượt cũ (`CHAT_HISTORY_TURNS`).

**Đặt lịch là mô phỏng:** `create_booking_draft` gọi lần đầu với `confirm=false`
để xin xác nhận; chỉ tạo draft khi người dùng nói rõ đồng ý và tool được gọi lại
với `confirm=true`. Draft lưu ở `data/processed/booking-drafts.json`.

System prompt nằm ở [`apps/api/prompts/system.vi.md`](apps/api/prompts/system.vi.md):
tiếng Việt, chỉ dựa trên dữ liệu truy xuất, nói rõ khi không có dữ liệu, không
chẩn đoán/kê đơn, nhắc gọi cấp cứu (115) khi có dấu hiệu khẩn cấp, từ chối câu hỏi
ngoài phạm vi, hỏi lại khi thiếu thông tin.

### Hạn mức Gemini (gói miễn phí)

| Model | RPM | RPD |
| --- | --- | --- |
| Gemini 3.8 Flash (trợ lý + judge) | **5** | **20** |
| Gemini Embedding 1 | 100 | 1000 |

Một lượt hội thoại tốn **1–3 request model** → free tier chỉ đủ **~7–20 lượt/ngày**,
và mỗi lượt phải chờ hạn mức 5 request/phút. Vì vậy:

- **Pre-retrieval**: trước khi gọi model, hệ thống tự tìm dữ liệu bằng BM25 (không
  gọi API) rồi đưa vào prompt → lượt tìm kiếm thường chỉ cần **1 request model**.
- `GEMINI_THINKING_LEVEL=low` nếu cần tốc độ (thinking là phần tốn thời gian nhất).
- Khi hết quota, API trả sự kiện `error` với thông báo rõ ràng.

Muốn dùng nhiều hơn thì cần API trả phí — hạn mức free tier không đủ cho
một trợ lý dùng thật.

### CLI

```bash
pnpm chat                              # tương tác
pnpm chat --script eval/chat-scenarios.json
pnpm eval:chat                         # chạy 10 kịch bản mẫu + kiểm tra ràng buộc
```

## API

| Method | Path | Mô tả |
| --- | --- | --- |
| `GET` | `/api/health` | Trạng thái service, số chunk trong index |
| `GET` | `/api/search?q=tim+mach&topK=5&type=facility&specialty=tim+mach&area=hà+nội` | Tìm kiếm lai, lọc theo type/specialty/area |
| `POST` | `/api/chat` | Trợ lý hội thoại — nhận `{ sessionId?, message, stream? }` |
| `POST` | `/api/booking/draft` | Tạo booking draft, trả `bookingcareUrl` |
| `GET` | `/api/booking/drafts` | Liệt kê các draft đã lưu |

`POST /api/chat` hỗ trợ **SSE**: gửi `stream: true` hoặc `Accept: text/event-stream`.

```
event: meta     data: {"sessionId":"...","requestId":"..."}
event: delta    data: {"text":"Bệnh viện Mẫu..."}
event: cards    data: {"cards":[{"kind":"facility","id":"...","title":"...","url":"..."}]}
event: booking  data: {"booking":{"code":"BC-7F3A9C21","url":"https://bookingcare.vn/..."}}
event: done     data: {"usage":{"inputTokens":812,"outputTokens":143,"durationMs":3120,"toolRounds":1,"toolsUsed":["search_facilities"]}}
```

Không `stream` thì trả JSON `{ sessionId, answer, usage }`.

Kết quả tìm kiếm đã rút gọn: `{ id, type, name, specialty, area, url, score, snippet }`.
Mọi request/response đều được validate bằng zod; lỗi trả về dạng
`{ "error": { "code", "message", "details?" } }`.

## Kiểm thử và chất lượng

```bash
pnpm test            # vitest cho toàn bộ workspace
pnpm typecheck       # tsc theo project references
pnpm lint            # eslint (flat config, type-aware)
pnpm format          # prettier
```

## Giới hạn đã biết

- **Deep-link đặt lịch**: `buildBookingCareUrl` (`apps/api/src/booking/url.ts`) đang dùng
  đường dẫn giả định `/tim-bam-kham?...` — cần đối chiếu với URL thật của bookingcare.vn
  trước khi đưa vào production.
- **Đường dẫn & selector crawl**: `scripts/src/crawl/config.ts` chứa selector và URL
  pattern dự đoán. Crawler luôn tự dò lại link từ trang chủ và hỗ trợ
  `pnpm crawl --probe <url>` để calibrate khi markup thay đổi.
- **Chưa có dữ liệu crawl thật**: `data/processed/` đang là dữ liệu mẫu tổng hợp nếu bạn
  chưa chạy `pnpm crawl --all`. Recall@5 đo được trên dữ liệu mẫu sẽ cao hơn thực tế.
- **Embedding tốn phí**: `pnpm index` gọi Gemini embeddings theo batch cho mỗi chunk.
  Với corpus lớn nên giới hạn số chunk hoặc chạy lại theo lô.

## License

Chưa chốt license. Dữ liệu thu thập từ bookingcare.vn thuộc về chủ sở hữu của họ —
chỉ dùng cho mục đích thử nghiệm nội bộ.
