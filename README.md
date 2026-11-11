# WhatHappend

Dashboard cá nhân "thế giới đang diễn ra gì": thị trường, vĩ mô, tin tức, bản đồ sự kiện, lịch, xu hướng, thị trường dự đoán, môi trường và góc Việt Nam. Đầu trang Tổng quan là dải "Có gì mới từ lần trước" (những gì đổi kể từ lần bạn xem trước) và các chủ đề chi phối thị trường (khai báo trong `config/themes.ts`), mỗi chủ đề cho biết đang nóng lên hay hạ nhiệt, tin mới, kèo và tác động tới Việt Nam. Trang `/vi/macro` khám sức khoẻ kinh tế thế giới: 8 chỉ số toàn cầu, nhận định tuần do AI viết, bảng sức khoẻ 15 nền kinh tế cộng Việt Nam, đồng hồ chu kỳ theo chỉ báo sớm OECD và bản đồ tăng trưởng, lạm phát của mọi nước. Trang `/vi/vietnam` gom thị trường, tỷ giá, vàng, tăng trưởng, lạm phát, lãi suất NHNN và dự báo IMF của Việt Nam. Trang `/vi/crypto` riêng cho crypto: top coin, Fear & Greed, DVOL, stablecoin, funding/OI, USDT/VND P2P, mạng Bitcoin, kèo Polymarket và tin crypto. Trang `/vi/tech` cho công nghệ: cổ phiếu công nghệ và bán dẫn (Mỹ, châu Á, FPT, CMC), trạng thái AWS, Google Cloud, Azure, Cloudflare, GitHub, Vercel, OpenAI, Claude, model AI mới kèm giá (OpenRouter), nghiên cứu AI (Hugging Face), lỗ hổng đang bị khai thác (CISA KEV), Hacker News và tin công nghệ. Giao diện song ngữ Việt/Anh, có ba giao diện: sáng, tối và Anthropic (nền kem, tiêu đề serif).

## Chạy

Cần Node ≥ 22.13 (dùng `node:sqlite` có sẵn trong Node).

```bash
npm install
cp .env.example .env.local      # tuỳ chọn: điền AI_API_KEY (Gemini hoặc Claude) để có bản tin AI, dịch tiêu đề và diễn giải chỉ số
npm run fetch -- all            # lấy dữ liệu lần đầu (khoảng 1 phút)
npm run dev:all                 # worker (tự khởi động lại khi sửa code) + web; mở http://localhost:3000
```

Hai tiến trình chạy độc lập:

| Lệnh | Việc |
|---|---|
| `npm run worker` | Bộ lập lịch: gọi các nguồn khi đến hạn, ghi vào `data/whathappend.db`. Không tự nạp code mới: sửa code thì khởi động lại, web hiện dải cảnh báo khi worker chạy code cũ hoặc đã dừng |
| `npm run worker:watch` | Như trên, nhưng tự khởi động lại mỗi khi một file worker dùng thay đổi (`dev:all` chạy cách này) |
| `npm run dev` / `npm run build && npm start` | Web Next.js, chỉ đọc từ SQLite và không gọi API bên ngoài |
| `npm run fetch -- <id…>` / `npm run fetch -- all` | Chạy một hoặc nhiều nguồn một lần (gõ `npm run fetch` để xem danh sách id) |
| `npm run typecheck` / `npm run lint` | Kiểm tra kiểu và lint |
| `npm test` | Test tự động (`node:test`, file trong `test/`, DB `:memory:`, không gọi mạng) |

Tất cả nguồn dữ liệu đều không cần key, trừ phần AI. Thiếu key AI thì tin hiển thị tiêu đề gốc và panel bản tin hướng dẫn cách bật.

### Chạy nền bằng Docker

`compose.yaml` chạy web (bản production) và worker từ cùng một image, tự bật lại khi Docker khởi động. DB nằm trong volume `whathappend_data` (không phải `./data`), key AI đọc từ `.env.local` lúc chạy, không đóng vào image.

```bash
docker compose up -d --build     # build và chạy; mở http://localhost:3000
docker compose logs -f worker    # xem worker
docker compose down              # dừng (dữ liệu vẫn giữ trong volume)
```

Dừng `npm run worker` và `npm run dev` trước khi chạy: mỗi DB chỉ một worker, và web Docker dùng cổng 3000. Sau khi sửa code hoặc `.env.local` thì chạy lại `docker compose up -d --build`.

## Cấu hình AI

Đặt trong `.env.local` (đã gitignore, không bao giờ gửi xuống trình duyệt):

| Biến | Ý nghĩa |
|---|---|
| `AI_PROVIDER` | `gemini` hoặc `anthropic`. Bỏ trống thì tự đoán từ key: `sk-ant-…` là Claude, còn lại là Gemini |
| `AI_API_KEY` | Key của provider. Cũng nhận `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY` |
| `AI_MODEL_BRIEF` | Model viết bản tin và diễn giải chỉ số. Mặc định `gemini-flash-latest` / `claude-sonnet-5-5` |
| `AI_MODEL_FAST` | Model dịch và gắn nhãn tiêu đề. Mặc định `gemini-flash-lite-latest` / `claude-haiku-5-5` |
| `AI_DAILY_LIMIT_BRIEF`, `AI_DAILY_LIMIT_FAST` | Số lần gọi tối đa mỗi ngày cho từng model. Mặc định 20 cho model brief của Gemini (gói miễn phí); `0` = không giới hạn |
| `COINGECKO_API_KEY` | Không thuộc AI, tùy chọn. Key Demo miễn phí của CoinGecko, nên đặt khi chạy trên cloud (IP dùng chung dễ bị 429) |

Với key Gemini miễn phí, dòng Pro không có hạn mức (lỗi 429 `limit: 0`). Muốn dùng `gemini-pro-latest` cho bản tin thì cần gói trả phí. Sau khi sửa `.env.local`, khởi động lại cả worker lẫn web.

## Cảnh báo Telegram (tuỳ chọn)

Worker gửi tin qua một bot Telegram khi trạng thái rủi ro đổi, số liệu Mỹ lệch dự báo, Vietcombank bán đô cách trần biên độ dưới 2%, chênh lệch vàng SJC đổi mạnh trong ngày, một kèo Polymarket đổi từ 15 điểm trong 24 giờ, hoặc một đám mây đang dùng báo sự cố lớn. Mỗi điều kiện chỉ gửi một lần cho tới khi nó hết.

1. Tạo bot với [@BotFather](https://t.me/BotFather), lấy token.
2. Nhắn bot một tin bất kỳ, rồi mở `https://api.telegram.org/bot<token>/getUpdates` để lấy `chat.id`.
3. Đặt `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID` trong `.env.local`, khởi động lại worker. Thử ngay bằng `npm run fetch -- telegram`: lần đầu bot gửi tin "Đã bật cảnh báo" kèm các điều kiện đang có.

Ngưỡng, danh sách đám mây theo dõi và ngôn ngữ tin nhắn nằm trong `config/alerts.ts`.

## Cấu trúc

```
app/[lang]/            trang dashboard (vi | en), proxy.ts chuyển / → /vi
app/api/               brief (yêu cầu viết lại), series/[key] (lịch sử), watchlist
components/panels/     các panel; components/charts/ biểu đồ; components/ui/ khung chung
config/                danh mục chỉ số (series.ts), lịch chạy (sources.ts), chủ đề chi phối (themes.ts), feed, quốc gia, FOMC, thành phố
lib/sources/           mỗi nguồn một file: fetch → zod → upsert
lib/ai/                lớp provider (Gemini / Claude), dịch + phân loại tiêu đề, bản tin hằng ngày, diễn giải chỉ số, nhận định tuần, ghi chú chủ đề
lib/queries.ts         lớp đọc cho UI (lib/queries-macro.ts, -vietnam.ts, -tech.ts cho từng trang); lib/signals/ Risk Regime, quy tắc chọn chỉ số đáng chú ý, tính toán vĩ mô
worker/, scripts/      bộ lập lịch (kèm khóa một worker) và CLI fetch
test/                  test tự động cho parser, tín hiệu, lịch AI, khóa worker, chặn cross-origin
BRD/, TechDesign/      tài liệu nghiệp vụ, HLDD, LLDD
TODO.md                việc để sau (trang Vĩ mô, trang Việt Nam, Phase 2–3 trang Công nghệ)
```

Thêm một nguồn mới: tạo `lib/sources/<id>.ts`, khai báo chu kỳ trong `config/sources.ts`, đăng ký trong `lib/sources/index.ts`. Chi tiết xem `TechDesign/LLDD/03-worker-and-sources-framework.md`.

## Lưu ý

- Một số endpoint là không chính thức (Yahoo Finance, SSI, vang.today, PNJ, Vietcombank, trang trạng thái AWS), chỉ dùng cho mục đích cá nhân và có thể hỏng bất cứ lúc nào. Khi một nguồn lỗi, panel của nó hiện "Dữ liệu cũ" hoặc "Lỗi nguồn", phần còn lại của trang vẫn chạy bình thường.
- Muốn xoá dữ liệu thì dừng worker rồi xoá thư mục `data/`.
- Web chỉ nghe trên `127.0.0.1` vì không có đăng nhập. Muốn mở cho máy khác trong mạng nhà thì chạy `npx next dev -H 0.0.0.0`.
- Chỉ một worker được chạy trên mỗi file DB; worker thứ hai sẽ báo lỗi và thoát.
