# CLAUDE.md — bookingcare-ai

Trợ lý AI tìm kiếm, hỏi đáp và đặt lịch khám dựa trên dữ liệu công khai của
[bookingcare.vn](https://bookingcare.vn).

## Mục tiêu

- **Tìm kiếm**: tìm bệnh viện, chuyên khoa, bác sĩ, dịch vụ khám theo từ khoá
  tiếng Việt.
- **Hỏi đáp**: trả lời câu hỏi về dịch vụ khám, giá, địa chỉ, chuyên khoa dựa
  trên dữ liệu đã truy xuất (RAG).
- **Đặt lịch**: hỗ trợ người dùng chọn bác sĩ/ngày/giờ rồi tạo *booking draft*
  và trả link quay lại bookingcare.vn.

## Stack

- **TypeScript** (strict) toàn bộ repo, pnpm workspaces.
- **LangChain.js (LangGraph)** cho luồng trợ lý: retrieve → answer → booking.
- **React** (Vite) cho web app.
- Node + Express cho API server.

## Model

Toàn bộ suy luận dùng **Google Gemini** (một API key cho cả 3 vai trò).

| Vai trò | Model (mặc định) | Reasoning |
| --- | --- | --- |
| Trợ lý (assistant) | `gemini-2.5-flash` | `GEMINI_THINKING_LEVEL` / `GEMINI_THINKING_BUDGET` |
| Judge (eval) | `gemini-2.5-flash` | như trên |
| Embedding (truy xuất) | `gemini-embedding-001` | — |

Model ID đọc từ biến môi trường `GEMINI_MODEL` / `GEMINI_JUDGE_MODEL` /
`GEMINI_EMBEDDING_MODEL` (xem `.env.example`), không hardcode trong mã nguồn.

**Suy luận:** dòng Gemini 3+ dùng `thinkingConfig.thinkingLevel`
(`low` | `medium` | `high`), dòng Gemini 2.5 dùng `thinkingConfig.thinkingBudget`
(số token). `buildThinkingConfig()` trong `packages/shared/src/gemini.ts` chọn đúng
tham số theo tên model để không gửi tham số không hợp lệ.

## Ràng buộc mỗi lượt hội thoại

- Thời gian: **trung bình ≤ 10s** cho một lượt hội thoại.
- Input: **≤ 30k token** mỗi lượt (phải cắt ngữ cảnh truy xuất trước khi gọi model).
- Output: **≤ 500 token** mỗi lượt (`maxTokens: 500`).

Các ràng buộc này được cấu hình trong `apps/api/src/config/` và kiểm tra lại ở
`scripts/eval.ts`.

## Quy ước

- **Strict TypeScript**: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`,
  `noUnusedParameters`, `verbatimModuleSyntax`. Không dùng `any` trong mã nghiệp vụ.
- **Validate bằng zod**: mọi input HTTP, env, và dữ liệu crawl đều qua schema zod
  trước khi dùng.
- **Không hardcode key**: mọi secret nằm trong `.env` (gitignore). `.env.example`
  chỉ chứa placeholder. Không bao giờ commit `.env`.
- **Log có cấu trúc**: log dạng JSON một dòng (`packages/shared/src/logger.ts`),
  kèm `requestId`, `service`, `durationMs`.
- **Test**: mỗi module có test cơ bản bằng **vitest**. Chạy `pnpm test` ở root.
- **Không hardcode giá trị môi trường** trong mã; đọc qua `loadEnv()`.

## Đặt lịch là mô phỏng

- API **không** gọi vào hệ thống đặt lịch thật của bookingcare.vn.
- Đặt lịch chỉ tạo một **booking draft** (lưu cục bộ, `data/processed/booking-drafts.json`)
  và trả về **link sang bookingcare.vn** để người dùng tự hoàn tất thao tác đặt lịch.
- Draft phải chứa đủ thông tin để người dùng chỉ cần bấm link: chuyên khoa, bệnh viện,
  bác sĩ, ngày, giờ, thông tin liên hệ.

## Ranh giới lâm sàng

- Trợ lý **không chẩn đoán bệnh**, không đưa ra lời khuyên y tế cá nhân, không kê
  đơn thuốc.
- Trợ lý **chỉ trả lời dựa trên dữ liệu đã truy xuất** từ corpus bookingcare.vn.
- Nếu dữ liệu truy xuất không đủ để trả lời, trợ lý phải nói rõ không tìm thấy thông
  tin và gợi ý người dùng tìm trực tiếp trên bookingcare.vn.
- Mọi câu trả lời có dữ liệu đều kèm trích dẫn (link nguồn).

## Cấu trúc repo

```
apps/web        # Vite + React + TS
apps/api        # Node + Express + TS (LangGraph agent)
packages/shared # types + zod schemas + truy xuất dùng chung
scripts/        # crawl → index → eval
data/           # raw (crawl output) + processed (index, drafts)
eval/           # cases + results
```

## Agent (apps/api/src/agent)

- **Model**: Gemini (`GEMINI_MODEL`, mặc định `gemini-2.5-flash`), `maxOutputTokens: 500`,
  suy luận theo `GEMINI_THINKING_LEVEL` / `GEMINI_THINKING_BUDGET`.
- **System prompt**: [`apps/api/prompts/system.vi.md`](apps/api/prompts/system.vi.md) —
  tiếng Việt, chỉ dựa trên dữ liệu truy xuất, nói rõ khi không có dữ liệu,
  không chẩn đoán/kê đơn, nhắc gọi cấp cứu (115) khi có dấu hiệu khẩn cấp,
  từ chối câu hỏi ngoài phạm vi, hỏi lại khi thiếu thông tin.
- **Tool** (mô tả tiếng Việt, validate bằng zod):
  `search_doctors`, `search_facilities`, `search_services`, `get_entity_details`,
  `create_booking_draft`.
- **Ràng buộc lượt hội thoại**:
  - Tối đa **2 vòng gọi tool**; hết ngân sách thì model buộc trả lời bằng văn bản.
  - Kết quả tool **rút gọn** (tên + chuyên khoa + khu vực + link) để giữ input ≤ 30k token.
  - Lịch sử: giữ **N lượt gần nhất** + **bản tóm tắt** các lượt cũ hơn
    (`CHAT_HISTORY_TURNS`), không nhồi toàn bộ.
- **Đặt lịch là mô phỏng**: `create_booking_draft` gọi lần đầu với `confirm=false`
  để xin xác nhận; chỉ tạo draft khi gọi lại với `confirm=true`. Draft lưu ở
  `data/processed/booking-drafts.json` và trả **mã booking** + link bookingcare.vn.
- **API**: `POST /api/chat` nhận `{ sessionId?, message, stream? }`.
  - `stream: true` hoặc `Accept: text/event-stream` → **SSE**: `meta`, `delta`, `cards`, `booking`, `done`, `error`.
  - ngược lại → JSON `{ sessionId, answer, usage }`.
- **CLI**: `pnpm chat` (tương tác), `pnpm chat --script eval/chat-scenarios.json`.
  `pnpm eval:chat` chạy 10 kịch bản mẫu và kiểm tra ràng buộc.

## Crawl bookingcare.vn

Cấu trúc URL của bookingcare.vn (Next.js) — **đọc từ trang chủ**, đừng đoán:

| Loại | URL chi tiết | Trang listing |
| --- | --- | --- |
| Chuyên khoa | `/dich-vu-y-te/<nhóm>/<slug>-s<id>` | `/dich-vu-y-te/<nhóm>` |
| Cơ sở y tế | `/co-so-y-te/<slug>-p<id>` | `/co-so-y-te/tat-ca` |
| Bác sĩ | `/dich-vu-y-te/<nhóm>/<slug>-i<id>` | `/danh-sach/bac-si/noi-bat` |
| Dịch vụ | `/dich-vu/<slug>` | — (link thẳng từ trang chủ) |

- Hậu tố `-s/-p/-i` là id nội bộ của site → `stripIdSuffix()` bỏ khỏi slug để id
  khớp với `nameToSlug(name)`.
- Site **không có JSON-LD**; tên/mô tả lấy từ `og:title` + `meta[description]`.
- Tên class đã hash → dùng `data-testid` làm mốc ổn định:
  `clinic-place-title` / `clinic-place-address` (cơ sở), `clinic-title h1` (bác sĩ),
  `clinic-price-number` (giá), `province` (tỉnh/thành).
- Số điện thoại trong **footer là hotline của BookingCare** — không phải số của cơ
  sở. Không được lấy `a[href^="tel:"]` ở cấp trang.
- Tên class đã hash → `collectRelatedIds()` fallback sang quét toàn bộ link.
- Pattern nằm ở `scripts/src/crawl/config.ts`; đổi pattern phải kèm test.

## Truy xuất (retrieval)

- **Làm sạch**: chuẩn hoá Unicode NFC, bỏ HTML, gộp khoảng trắng; khử trùng lặp
  theo tên + mô tả đã chuẩn hoá.
- **Chunking**: 1 thực thể = 1 chunk; mô tả dài cắt theo câu, mỗi chunk ≤ ~500 token
  và luôn kèm tên thực thể. Metadata: `type`, `id`, `name`, `specialty`, `area`, `url`,
  `specialtyIds`.
- **Tìm kiếm lai**: BM25 trên token **bỏ dấu** + BM25 trên token **có dấu** +
  embedding (`gemini-embedding-001`), gộp bằng **Reciprocal Rank Fusion** (k = 60).
- **Index lưu file**: `data/processed/retrieval-index.json` — không dùng DB ngoài,
  nạp nhanh lúc khởi động.
- Thiếu `GEMINI_API_KEY` → bỏ nhánh embedding, tìm kiếm chỉ dùng BM25 (vẫn chạy được).

## Lệnh thường dùng

```bash
pnpm install
pnpm build        # shared → api → scripts → web
pnpm test         # vitest, toàn repo
pnpm lint         # eslint (flat config)
pnpm format       # prettier
pnpm crawl        # scripts/crawl.ts → data/raw + data/processed/{type}.json
pnpm seed         # ghi dữ liệu MẪU (synthetic) vào data/processed
pnpm index        # scripts/index.ts → data/processed/retrieval-index.json
pnpm eval         # scripts/eval.ts → eval/results (chấm chất lượng trợ lý)
pnpm eval:retrieval # scripts/eval-retrieval.ts → recall@5 + MRR
pnpm chat         # CLI thử trợ lý (tương tác)
pnpm eval:chat    # 10 kịch bản hội thoại mẫu + kiểm tra ràng buộc
pnpm doctor       # kiểm tra môi trường (config, Chromium cho Playwright, dữ liệu)
```

`pnpm crawl` dùng Playwright nên **cần Chromium**: `pnpm --filter @bookingcare/scripts
crawl:install`. Thiếu Chromium thì crawl dừng ngay với lệnh cài đặt — không phải
"chạy xong ra 0 bản ghi". Mọi lỗi tải trang được log ở `crawl_fetch_failed`.
