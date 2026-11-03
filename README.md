# WhatHappend

Dashboard cá nhân "thế giới đang diễn ra gì": thị trường, vĩ mô, tin tức, bản đồ sự kiện, lịch, xu hướng, thị trường dự đoán, môi trường và góc Việt Nam. Trang `/vi/crypto` riêng cho crypto: top coin, Fear & Greed, DVOL, stablecoin, funding/OI, USDT/VND P2P, mạng Bitcoin, kèo Polymarket và tin crypto. Giao diện song ngữ Việt/Anh, có ba giao diện: sáng, tối và Anthropic (nền kem, tiêu đề serif).

## Chạy

Cần Node ≥ 22.13 (dùng `node:sqlite` có sẵn trong Node).

```bash
npm install
cp .env.example .env.local      # tuỳ chọn: điền AI_API_KEY (Gemini hoặc Claude) để có bản tin AI, dịch tiêu đề và diễn giải chỉ số
npm run fetch -- all            # lấy dữ liệu lần đầu (khoảng 1 phút)
npm run dev:all                 # worker + web; mở http://localhost:3000
```

Hai tiến trình chạy độc lập:

| Lệnh | Việc |
|---|---|
| `npm run worker` | Bộ lập lịch: gọi các nguồn khi đến hạn, ghi vào `data/whathappend.db` |
| `npm run dev` / `npm run build && npm start` | Web Next.js, chỉ đọc từ SQLite và không gọi API bên ngoài |
| `npm run fetch -- <id…>` / `npm run fetch -- all` | Chạy một hoặc nhiều nguồn một lần (gõ `npm run fetch` để xem danh sách id) |
| `npm run typecheck` / `npm run lint` | Kiểm tra kiểu và lint |
| `npm test` | Test tự động (`node:test`, file trong `test/`, DB `:memory:`, không gọi mạng) |

Tất cả nguồn dữ liệu đều không cần key, trừ phần AI. Thiếu key AI thì tin hiển thị tiêu đề gốc và panel bản tin hướng dẫn cách bật.

## Cấu hình AI

Đặt trong `.env.local` (đã gitignore, không bao giờ gửi xuống trình duyệt):

| Biến | Ý nghĩa |
|---|---|
| `AI_PROVIDER` | `gemini` hoặc `anthropic`. Bỏ trống thì tự đoán từ key: `sk-ant-…` là Claude, còn lại là Gemini |
| `AI_API_KEY` | Key của provider. Cũng nhận `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY` |
| `AI_MODEL_BRIEF` | Model viết bản tin và diễn giải chỉ số. Mặc định `gemini-flash-latest` / `claude-sonnet-5-5` |
| `AI_MODEL_FAST` | Model dịch và gắn nhãn tiêu đề. Mặc định `gemini-flash-lite-latest` / `claude-haiku-5-5` |
| `COINGECKO_API_KEY` | Không thuộc AI, tùy chọn. Key Demo miễn phí của CoinGecko, nên đặt khi chạy trên cloud (IP dùng chung dễ bị 429) |

Với key Gemini miễn phí, dòng Pro không có hạn mức (lỗi 429 `limit: 0`). Muốn dùng `gemini-pro-latest` cho bản tin thì cần gói trả phí. Sau khi sửa `.env.local`, khởi động lại cả worker lẫn web.

## Cấu trúc

```
app/[lang]/            trang dashboard (vi | en), proxy.ts chuyển / → /vi
app/api/               brief (yêu cầu viết lại), series/[key] (lịch sử), watchlist
components/panels/     các panel; components/charts/ biểu đồ; components/ui/ khung chung
config/                danh mục chỉ số (series.ts), lịch chạy (sources.ts), feed, quốc gia, FOMC, thành phố
lib/sources/           mỗi nguồn một file: fetch → zod → upsert
lib/ai/                lớp provider (Gemini / Claude), dịch + phân loại tiêu đề, bản tin hằng ngày, diễn giải chỉ số
lib/queries.ts         lớp đọc cho UI; lib/signals/ chỉ báo Risk Regime và quy tắc chọn chỉ số đáng chú ý
worker/, scripts/      bộ lập lịch (kèm khóa một worker) và CLI fetch
test/                  test tự động cho parser, tín hiệu, lịch AI, khóa worker, chặn cross-origin
BRD/, TechDesign/      tài liệu nghiệp vụ, HLDD, LLDD
```

Thêm một nguồn mới: tạo `lib/sources/<id>.ts`, khai báo chu kỳ trong `config/sources.ts`, đăng ký trong `lib/sources/index.ts`. Chi tiết xem `TechDesign/LLDD/03-worker-and-sources-framework.md`.

## Lưu ý

- Một số endpoint là không chính thức (Yahoo Finance, SSI, vang.today, PNJ, Vietcombank), chỉ dùng cho mục đích cá nhân và có thể hỏng bất cứ lúc nào. Khi một nguồn lỗi, panel của nó hiện "Dữ liệu cũ" hoặc "Lỗi nguồn", phần còn lại của trang vẫn chạy bình thường.
- Muốn xoá dữ liệu thì dừng worker rồi xoá thư mục `data/`.
- Web chỉ nghe trên `127.0.0.1` vì không có đăng nhập. Muốn mở cho máy khác trong mạng nhà thì chạy `npx next dev -H 0.0.0.0`.
- Chỉ một worker được chạy trên mỗi file DB; worker thứ hai sẽ báo lỗi và thoát.
