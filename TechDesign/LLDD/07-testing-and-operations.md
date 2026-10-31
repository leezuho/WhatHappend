# LLDD 07 — Kiểm thử và vận hành

> Phiên bản 0.3 · Ngày 2026-10-31 · Trạng thái: Đã kiểm chứng (AI đã chạy thật với Gemini; Claude chưa)
> Liên quan: [HLDD](../HLDD/HLDD.md) · [01 Database schema](01-database-schema.md) · [03 Worker](03-worker-and-sources-framework.md) · [BRD 03 NFR](../../BRD/03-non-functional-requirements.md)

## 1. Kế hoạch kiểm chứng

| # | Bước | Lệnh hoặc thao tác | Kỳ vọng |
|---|---|---|---|
| V1 | Từng nguồn | `npm run fetch -- <source-id>` | In `ok <id>: N rows`, không có lỗi `Unexpected response shape`, N > 0 |
| V2 | Tất cả nguồn | `npm run fetch -- all` | Mọi nguồn `ok` hoặc `skip` (thiếu key); exit code 0 |
| V3 | Worker | `npm run worker`, chạy hết một vòng | Mọi dòng `source_status` có `ok = 1` (trừ nguồn bị skip) |
| V4 | Giao diện | `npm run dev`, mở `http://localhost:3000/vi` và `/en` | Mọi panel có dữ liệu và giờ cập nhật mới; `/` chuyển sang `/vi` |
| V5 | Song ngữ | Bấm VI/EN | Chuỗi giao diện, tiêu đề tin và Brief đổi ngôn ngữ; số định dạng đúng locale |
| V6 | Đối chiếu số liệu | So sánh thủ công | US10Y khớp FRED (DGS10); BTC khớp giá BTC-USD trên Yahoo/sàn lớn (lệch < 1%); động đất gần nhất khớp USGS |
| V7 | Cô lập lỗi | Đặt sai `AI_API_KEY`, hoặc chặn mạng tới một host (ví dụ `/etc/hosts`) | Chỉ panel liên quan hiện "Lỗi nguồn"/"Dữ liệu cũ"; trang và worker vẫn chạy |
| V8 | Thiếu key | Xóa `AI_API_KEY` (hoặc đặt `AI_PROVIDER` sai) | Worker in `AI: off` và `skip translate/brief: <lý do>`; Brief hiện "Cần API key"; tin hiện tiêu đề gốc |
| V14 | AI chạy thật | `npm run fetch -- translate`, rồi `npm run fetch -- brief` | `ok`; bài báo có `title_vi`/`title_en`/`region`/`topic`; panel Brief có bản tin, chân panel ghi tên model |
| V15 | Viết lại Brief end-to-end | Chạy worker, bấm "Viết lại" (hoặc `curl -X POST /api/brief`) | Ở tick kế tiếp worker viết brief mới; panel hiện bản mới |
| V9 | Theme | Đổi theme, tải lại trang | Không bị nháy màu; lựa chọn được ghi nhớ |
| V10 | Build và chất lượng mã | `npm run build`, `npm run lint`, `npm run typecheck` | Không lỗi |
| V11 | Reduced motion | Bật "Reduce motion" trong hệ điều hành | Ticker đứng yên |
| V12 | Chi tiết và watchlist | Bấm một KPI tile, đổi khoảng 3T/1N/2N/5N, bấm "Ghim" | Hộp thoại hiện lịch sử (tải từ `/api/series/[key]`); sau khi ghim, tile xuất hiện ở hàng "Bạn đã ghim" |
| V13 | Bản đồ | Mở panel bản đồ, xem console trình duyệt | Có nền bản đồ và các chấm; không có "Worker failed to load" |

### 1.1 Kết quả kiểm chứng (2026-10-31)

| Hạng mục | Kết quả |
|---|---|
| `npx tsc --noEmit` | Sạch |
| `npm run lint` | Sạch (0 lỗi, 0 cảnh báo) |
| `npm run build` | Thành công; `/vi`, `/en` là Partial Prerender (◐), `/api/*` dynamic (ƒ) |
| `npm run fetch` (V1/V2) | 24 nguồn dữ liệu đều `ok`; `translate` và `brief` bị `skip` cho tới khi cấu hình AI |
| Giao diện (V4, V9, V12, V13) | Chụp màn hình qua Chrome headless: sáng/tối, bản đồ có chấm, mọi biểu đồ, hộp thoại chi tiết, hàng "Bạn đã ghim" |
| AI với Gemini (V5, V14, V15) | **Đã chạy thật** với key Google AI Studio gói miễn phí:<br/>• `translate`: 220 mục trong 41 giây, tiếng Việt chất lượng tốt.<br/>• `brief`: chạy bằng `gemini-3.8-flash` (alias `gemini-flash-latest`) trên 90 tiêu đề, mất 2–3 phút.<br/>• Nút "Viết lại" → worker → brief mới đã kiểm chứng.<br/>• `gemini-pro-latest` bị 429 `limit: 0`, nên mặc định đổi sang Flash.<br/>• Một lần 503 "high demand", nên đã bật retry SDK. |
| AI với Claude | Adapter qua kiểm tra kiểu nhưng **chưa gọi thật** (chưa có key) |

Lưu ý chất lượng dữ liệu đã biết:
- Điểm nóng GDELT khá nhiễu (địa điểm gán sai, URL không liên quan).
- Top vi.wikipedia thường bị bot đẩy lượt xem (vì vậy tab mặc định là Wikipedia EN).
- Các endpoint không chính thức (Yahoo, SSI, vang.today, PNJ, Vietcombank) có thể đổi hoặc bị chặn bất cứ lúc nào.

## 2. Runbook

### 2.1 Cài đặt lần đầu
```bash
npm install
cp .env.example .env.local      # tùy chọn: AI_PROVIDER + AI_API_KEY (Gemini hoặc Claude) cho dịch và Brief
npm run fetch -- all            # nạp dữ liệu lần đầu
```

### 2.2 Chạy hằng ngày
```bash
# Terminal 1 — web (predev/prebuild tự chép worker MapLibre vào public/vendor/)
npm run dev                     # hoặc: npm run build && npm run start
# Terminal 2 — worker
npm run worker
```
Mở `http://localhost:3000`. Web chỉ nghe trên `127.0.0.1` (script `dev`/`start` đặt `-H 127.0.0.1`) vì ứng dụng không có đăng nhập. Muốn xem từ máy khác trong mạng nhà thì chạy `npx next dev -H 0.0.0.0` và tự chịu việc mọi máy cùng mạng đều vào được.

### 2.3 Biến môi trường (`.env.local`)

| Biến | Dùng cho | Thiếu thì |
|---|---|---|
| `AI_PROVIDER` | Chọn provider: `gemini` hoặc `anthropic` | Đoán từ key (`sk-ant-…` là Claude, còn lại là Gemini). Giá trị khác hai giá trị trên thì AI bị tắt kèm lý do |
| `AI_API_KEY` | Key cho nguồn `translate`, `brief`. Cũng nhận `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY` | Không có dịch và Brief |
| `AI_MODEL_BRIEF`, `AI_MODEL_FAST` | Đổi model cho Brief / dịch | Gemini: `gemini-flash-latest` / `gemini-flash-lite-latest`. Claude: `claude-sonnet-5-5` / `claude-haiku-5-5` |
| `DB_PATH` | Vị trí file SQLite | Mặc định `./data/whathappend.db` |

Không nguồn dữ liệu nào cần key: FRED dùng CSV công khai, chất lượng không khí dùng Open-Meteo, CoinGecko không dùng.

`npm run worker` và `npm run fetch` nạp `.env.local` qua `--env-file-if-exists`; `next dev`/`next start` tự nạp `.env.local`. Biến môi trường chỉ được đọc lúc khởi động, nên sau khi sửa `.env.local` phải **khởi động lại cả worker lẫn web**. Web cần khởi động lại để chip "Cần API key" và panel Brief cập nhật. `.env.local` chứa key nên phải nằm trong `.gitignore` (mẫu `.env*`) và nên có quyền 600.

### 2.4 Reset dữ liệu
```bash
# dừng worker và web trước
rm -rf ./data
npm run fetch -- all
```

### 2.5 Kiểm tra trạng thái bằng `sqlite3`
```bash
sqlite3 data/whathappend.db
```
```sql
-- Trạng thái mọi nguồn
SELECT source, ok, count,
       datetime(last_run/1000,'unixepoch','localtime') AS last_run,
       datetime(last_ok/1000,'unixepoch','localtime')  AS last_ok,
       substr(error,1,80) AS error
FROM source_status ORDER BY ok, source;

-- 20 lần chạy gần nhất bị lỗi
SELECT source, datetime(at/1000,'unixepoch','localtime') AS at, duration_ms, substr(error,1,100)
FROM fetch_log WHERE ok = 0 ORDER BY at DESC LIMIT 20;

-- Thời gian chạy trung bình theo nguồn (7 ngày)
SELECT source, count(*) AS runs, round(avg(duration_ms)) AS avg_ms, sum(ok=0) AS fails
FROM fetch_log GROUP BY source ORDER BY fails DESC;

-- Kích thước dữ liệu
SELECT 'observations', count(*) FROM observations UNION ALL
SELECT 'articles', count(*) FROM articles UNION ALL
SELECT 'events', count(*) FROM events UNION ALL
SELECT 'items', count(*) FROM items;
```

Muốn buộc một nguồn chạy lại ngay khi worker đang chạy: `DELETE FROM source_status WHERE source = '<id>';`, hoặc dùng `npm run fetch -- <id>`.

## 3. Xử lý sự cố

| Triệu chứng | Nguyên nhân có thể | Cách xử lý |
|---|---|---|
| Panel "Dữ liệu cũ" nhưng không lỗi | Worker không chạy | Kiểm tra terminal worker, chạy `npm run worker` |
| Panel "Lỗi nguồn" với `Unexpected response shape` | API đổi định dạng | Chạy `npm run fetch -- <id>` để xem lỗi, cập nhật zod schema và mapping trong `lib/sources/<id>.ts` |
| `HTTP 403` / `HTTP 401` | Thiếu hoặc sai key, hoặc bị chặn UA | Kiểm tra `.env.local`; thử `browserUA: true` cho host đó |
| `HTTP 429` lặp lại | Gọi quá nhiều | Tăng `intervalMs` trong `config/sources.ts` |
| `database is locked` | Transaction dài, hoặc `npm run fetch` chạy song song với worker | Giữ transaction ngắn; `busy_timeout` là 5 giây. Worker không chết vì lỗi này, lần chạy đó được ghi log `FAIL` |
| Worker in `another worker is already running … exiting` | Đã có worker khác chạy trên cùng DB (ví dụ một terminal khác, hoặc `dev:all` cũ) | Dừng worker kia. Worker chết đột ngột thì khóa tự hết hạn sau 60 giây (cùng máy: giành lại ngay khi pid không còn) |
| Chip "cần key" dù đã thêm key | Tiến trình chưa nạp lại env | Khởi động lại web và worker |
| Số liệu không đổi dù worker chạy | Trang không làm mới | Kiểm tra `AutoRefresh`; tải lại trang; đảm bảo hàm query gọi `await connection()` |
| Lỗi hydration ở đồng hồ | Render giờ phía server | `MarketClocks` đọc đồng hồ qua `useSyncExternalStore` với snapshot server = `null` (hiện `--:--`) |
| Bản đồ chỉ có nền xám, console báo "Worker failed to load" | Worker MapLibre không được phục vụ (MapLibre 6 dùng `import.meta.url`, hỏng khi bundle bằng Turbopack) | Chạy `node scripts/copy-maplibre-worker.mjs` (tự chạy qua `predev`/`prebuild`), kiểm tra `GET /vendor/maplibre-gl-worker.mjs` trả 200; xem [HLDD ADR-09](../HLDD/HLDD.md#adr-09--tự-phục-vụ-worker-của-maplibre) |
| ESLint báo hàng nghìn cảnh báo trong `public/vendor` | Quét nhầm file worker đã chép | `public/vendor/**` phải nằm trong `globalIgnores` của `eslint.config.mjs` |
| Nút "Viết lại" Brief không có tác dụng | Worker không chạy, AI chưa cấu hình, lần chạy trước lỗi chưa quá 30 phút, hoặc brief gần nhất chưa cũ 10 phút | Route chỉ ghi cờ `kv['brief:force']`. Worker phải chạy và in `AI: <provider>`. Xem `source_status` của `brief` |
| Brief lỗi `429 … limit: 0` (Gemini) | Model không có hạn mức ở gói miễn phí (ví dụ Pro) | Dùng model Flash (`AI_MODEL_BRIEF=gemini-flash-latest`, mặc định) hoặc nâng lên gói trả phí |
| Brief hoặc dịch lỗi `429` sau khi đã chạy nhiều lần | Hết hạn mức theo phút hoặc ngày | Chờ; worker tự thử lại sau `max(1 phút, interval/4)` (brief: sau 30 phút) |
| Lỗi `503 … high demand` | Provider quá tải tạm thời | SDK Gemini tự thử lại 4 lần (5 → 60 giây); nếu vẫn lỗi, bộ lập lịch sẽ thử lại sau |
| Worker in `AI: off` hoặc `skip translate: AI_PROVIDER must be …` | Sai `AI_PROVIDER` hoặc thiếu key | Sửa `.env.local` theo lý do trong log, rồi khởi động lại worker và web |
| Build báo "blocking route" / "uncached data" | Truy cập dữ liệu ngoài `<Suspense>` | Đặt nội dung vào `Panel` (đã có `Suspense`) hoặc bọc `<Suspense>` |
| Brief không tạo lúc 06:00 | Máy ngủ, AI chưa cấu hình, hết hạn mức, hoặc lỗi | Xem `source_status` của `brief`; bấm nút làm mới; worker sẽ tạo bù khi thức dậy (vì `isDue` chỉ yêu cầu ≥ 06:00 và chưa có brief hôm nay) |
| DB lớn bất thường | Tích lũy observations | `rss` đã tự xóa bài cũ hơn 14 ngày và `fetch_log` giữ 7 ngày; nếu vẫn lớn thì reset DB |
