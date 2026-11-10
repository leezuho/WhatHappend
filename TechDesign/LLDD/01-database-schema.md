# LLDD 01 — Database schema

> Phiên bản 0.2 · Ngày 2026-10-31 · Trạng thái: Đã triển khai
> Liên quan: [HLDD](../HLDD/HLDD.md) · [03 Worker và framework nguồn](03-worker-and-sources-framework.md) · [04 Frontend](04-frontend.md)
> Mã nguồn: `lib/db/index.ts` (schema, `getDb`, `tx`), `lib/sources/store.ts` (các thao tác ghi)

## 1. Tổng quan

- **Engine:** SQLite 3.53 qua `node:sqlite` (`DatabaseSync`) có sẵn trong Node 26.
- **File:** `process.env.DB_PATH`, mặc định `./data/whathappend.db`. Thư mục được tạo tự động.
- **Khởi tạo:** `openDb(file)` mở một file (hoặc `:memory:` cho test), chạy PRAGMA rồi `CREATE TABLE IF NOT EXISTS`. `getDb()` gọi `openDb` một lần cho `DB_PATH` (mặc định `data/whathappend.db`) và lưu singleton vào `globalThis.__whDb` (để sống sót qua HMR của Next dev). Không có migration framework; muốn đổi schema thì sửa SQL tập trung trong `lib/db/index.ts`.
- **PRAGMA:**

| PRAGMA | Giá trị | Lý do |
|---|---|---|
| `journal_mode` | `WAL` | Worker ghi và web đọc đồng thời |
| `busy_timeout` | `5000` | Chờ tối đa 5 giây khi gặp khóa thay vì lỗi ngay |
| `synchronous` | `NORMAL` | Đủ an toàn với WAL, ghi nhanh hơn |

- **Transaction:** `tx(db, fn)` chạy `BEGIN IMMEDIATE` → `fn()` → `COMMIT`. Nếu có lỗi thì `ROLLBACK` rồi ném lại lỗi.
- **Thời gian:** mọi cột `ts`, `*_at`, `last_*` là **ms epoch**. Điểm dữ liệu theo ngày dùng 00:00 UTC (`dayTs`).

## 2. Sơ đồ quan hệ

```
series 1 ───< observations          (series_id → series.id)
series 1 ─── 0..1 quotes            (series_id → series.id, chỉ với công cụ giao dịch trong ngày)
watchlist                           (series_id = SeriesKey trong config/series.ts, không phải series.id)

articles      (độc lập; loại trùng bằng id = hash URL và title_key)
events        (độc lập; nhóm theo source)
items         (độc lập; nhóm theo kind)
briefs        (theo date + lang)

source_status 1 ───< fetch_log      (theo tên source)
kv            (cờ key/value dùng chung giữa web và worker)
```

Không khai báo `FOREIGN KEY`. Quan hệ là quy ước, đảm bảo bằng code ghi.

## 3. Các bảng

### 3.1 `series` — danh mục chuỗi thời gian
| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | TEXT | PK | Mã series, ví dụ `yahoo:^GSPC`, `fred:DGS10` |
| `source` | TEXT | NOT NULL | Id nguồn đã ghi series này |
| `updated_at` | INTEGER | NOT NULL | Lần ghi gần nhất |

Tên hiển thị, đơn vị, cực tính (tăng là tốt/xấu) và ngưỡng **không** lưu trong DB mà nằm trong `config/series.ts` (`SERIES`, `VITAL_SIGNS`).

### 3.2 `observations` — điểm dữ liệu (`WITHOUT ROWID`)
| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `series_id` | TEXT | PK (1) | → `series.id` |
| `ts` | INTEGER | PK (2) | Thời điểm. Dữ liệu ngày = 00:00 UTC |
| `value` | REAL | NOT NULL | Giá trị |

Ghi bằng upsert theo `(series_id, ts)`. Điểm có giá trị không hữu hạn (`NaN`, `Infinity`) bị bỏ qua.

### 3.3 `quotes` — giá mới nhất
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `series_id` | TEXT PK | → `series.id` |
| `price` | REAL NOT NULL | Giá hiện tại |
| `change` | REAL | Thay đổi tuyệt đối trong ngày |
| `change_pct` | REAL | Thay đổi % trong ngày |
| `market_state` | TEXT | Trạng thái phiên do nguồn cung cấp (nếu có) |
| `ts` | INTEGER NOT NULL | Thời điểm của giá |

### 3.4 `articles` — tin tức
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | TEXT PK | Hash của URL đã chuẩn hóa (`hashId`, sha1 cắt 16 ký tự hex) |
| `url` | TEXT NOT NULL | Link bài gốc |
| `source` | TEXT NOT NULL | Tên báo hiển thị (`BBC`, `VnExpress`…) |
| `lang` | TEXT NOT NULL | Ngôn ngữ của tiêu đề gốc |
| `region`, `topic` | TEXT | Phân loại (taxonomy ở [05](05-ai-pipeline.md)) |
| `title` | TEXT NOT NULL | Tiêu đề gốc |
| `title_en`, `title_vi` | TEXT | Bản dịch (AI điền sau) |
| `title_key` | TEXT NOT NULL | Tiêu đề đã chuẩn hóa, dùng loại trùng giữa các nguồn |
| `summary`, `image` | TEXT | Mô tả ngắn và ảnh (nếu feed có) |
| `published_at` | INTEGER NOT NULL | Thời điểm đăng |
| `fetched_at` | INTEGER NOT NULL | Thời điểm thu thập |

Index: `articles_published (published_at DESC)` và `articles_title_key (title_key)`.

### 3.5 `events` — sự kiện có tọa độ (bản đồ)
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | TEXT PK | `<source>:<id gốc>`, ví dụ `usgs:us7000abcd` |
| `source` | TEXT NOT NULL | `usgs`, `gdacs`, `eonet`… |
| `type` | TEXT NOT NULL | `earthquake`, `cyclone`, `wildfire`, `conflict`… |
| `title`, `title_vi` | TEXT | Tiêu đề gốc và bản dịch |
| `lat`, `lng` | REAL NOT NULL | Tọa độ |
| `severity` | REAL | Độ lớn theo nguồn (ví dụ độ Richter) |
| `level` | TEXT | `green` / `orange` / `red` nếu nguồn có. USGS PAGER `yellow` được map sang `orange` |
| `url` | TEXT | Link chi tiết |
| `ts` | INTEGER NOT NULL | Thời điểm xảy ra |

Index: `events_ts (ts DESC)`.

### 3.6 `items` — danh sách snapshot
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `kind` | TEXT | PK (1). Loại danh sách: `wiki_en`, `wiki_vi`, `hn`, `polymarket`, `kalshi_fed`, `launch`, `calendar`, `airquality`, `who`, `gold_vn`, `vcb`, `vn_breadth`, và của trang Công nghệ: `status`, `ai_models`, `hf_papers`, `hf_models`, `kev`, `kev_vendors`, `tech_caps` (dạng `data` xem [LLDD 02](02-data-sources.md)) |
| `id` | TEXT | PK (2). Id trong nguồn |
| `rank` | INTEGER NOT NULL | Thứ tự trong snapshot (0 là đầu tiên) |
| `title`, `title_vi` | TEXT | Tiêu đề và bản dịch |
| `url` | TEXT | Link |
| `ts` | INTEGER | Thời điểm liên quan (ngày đóng, giờ phóng…) |
| `data` | TEXT | JSON tự do theo `kind` |
| `fetched_at` | INTEGER NOT NULL | Thời điểm snapshot |

### 3.7 `briefs` — AI Daily Brief
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `date` | TEXT | PK (1). `YYYY-MM-DD` theo Asia/Ho_Chi_Minh |
| `lang` | TEXT | PK (2). `vi` / `en` |
| `content` | TEXT NOT NULL | JSON `{ headline, bullets: [{ title, body, refs }] }` (xem [05](05-ai-pipeline.md)) |
| `created_at` | INTEGER NOT NULL | Thời điểm tạo |

### 3.8 `source_status` — trạng thái hiện tại của từng nguồn
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `source` | TEXT PK | Id nguồn (`SourceId`) |
| `ok` | INTEGER NOT NULL | 1 nếu lần chạy gần nhất thành công |
| `error` | TEXT | Lỗi của lần gần nhất (tối đa 500 ký tự) |
| `count` | INTEGER | Số bản ghi lần gần nhất |
| `last_run` | INTEGER NOT NULL | Lần chạy gần nhất, thành công hay lỗi |
| `last_ok` | INTEGER | Lần thành công gần nhất. Giữ nguyên giá trị cũ khi chạy lỗi (`COALESCE`) |

### 3.9 `fetch_log` — lịch sử chạy
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | INTEGER PK | Tự tăng |
| `source`, `ok`, `count`, `error` | | Như trên |
| `duration_ms` | INTEGER | Thời gian chạy |
| `at` | INTEGER NOT NULL | Thời điểm ghi |

**Thời hạn lưu:** sau mỗi lần chạy, bản ghi cũ hơn **7 ngày** bị xóa.

### 3.10 `kv` — cờ dùng chung giữa web và worker
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `key` | TEXT PK | Tên cờ, ví dụ yêu cầu tạo lại Brief (tên cụ thể chốt khi cài đặt M3) |
| `value` | TEXT | Giá trị (tự do, có thể là JSON) |
| `updated_at` | INTEGER NOT NULL | Thời điểm đặt cờ |

Web server ghi cờ (ví dụ khi bấm nút "Làm mới" Brief). Worker đọc cờ trong `isDue` của nguồn liên quan.

Các khoá đang dùng: `brief:force` (yêu cầu viết lại bản tin), `ai:calls:<ngày Thái Bình Dương>:<model>` (số lần gọi AI trong ngày) và `ai:exhausted:<model>` (ngày model hết quota), xem LLDD 05 §4.1; `macro:note` (nhận định vĩ mô tuần, JSON `StoredMacroNote`), LLDD 05 §3b; `tech:note` (nhận định công nghệ tuần, `StoredTechNote`), LLDD 05 §3c. Các nguồn cũng giữ trạng thái nhỏ ở đây (LLDD 02): `vnstocks:shares` (số cổ phiếu lưu hành của VN30, làm mới mỗi ngày), `sbvrate:backfilled-to` (ngày đã lùi tới khi nạp lịch sử tỷ giá trung tâm), `ibrate:done` (60 bài Thời báo Ngân hàng đã đọc).

### 3.11 `watchlist`
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `series_id` | TEXT PK | **`SeriesKey`** được ghim (ví dụ `move`, `hy`, `cpi`), tức khóa trong `config/series.ts`, không phải `series.id` |
| `added_at` | INTEGER NOT NULL | Thời điểm ghim, dùng để sắp thứ tự hiển thị |

Ghi bởi `POST /api/watchlist` (web). Đọc bởi `getWatchlist()`; khóa không còn trong `SERIES` bị bỏ qua.

### 3.12 `insights` — AI diễn giải chỉ số đáng chú ý
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `key` | TEXT PK | **`SeriesKey`** (ví dụ `brent`, `cpi`) |
| `basis` | TEXT NOT NULL | Các lý do lúc viết, sắp xếp và nối bằng `+` (ví dụ `crit+move`). Có lý do mới chưa nằm trong `basis` thì viết lại; lý do chỉ mất đi thì chờ lần làm mới 12 giờ |
| `content` | TEXT NOT NULL | JSON `{ en, vi, sources: [{ title, url, source }], model }` (xem [05](05-ai-pipeline.md)) |
| `created_at` | INTEGER NOT NULL | Thời điểm viết. Web chỉ hiện ghi chú dưới 24 giờ (`INSIGHT_MAX_AGE`) |

Ghi bởi nguồn `insights` (worker). Đọc bởi `getHighlights()` / `getInsightNotes()`. Bảng mới tạo bằng `CREATE TABLE IF NOT EXISTS`, nên DB cũ không cần xóa.

## 4. Quy ước id

| Đối tượng | Mẫu | Ví dụ |
|---|---|---|
| Series từ Yahoo | `yahoo:<symbol>` | `yahoo:^GSPC`, `yahoo:DX-Y.NYB` |
| Series từ FRED | `fred:<series id>` | `fred:DGS10`, `fred:T10Y2Y` |
| Series từ nguồn khác | `<prefix>:<mã>` | `vn:VNINDEX`, `bis:US`, `imf:PCPIPCH:VNM`, `imf:CPI_M:JPN`, `sbv:REFI`, `wb:GDP:VNM`, `cnbc:ID10Y-ID`, `ibge:UNE:BRA`, `gpr:GPRD`, `nyfed:GSCPI`, `noaa:co2`, `giss:global`, `goldvn:SJL1L10:sell`, `vcb:USD:sell` |
| Series theo chỉ số × quốc gia | `<nguồn>:<chỉ số>:<mã vùng>` | `oecd:CLI:USA`, `oecd:CPI:EA20`, `oecd:BCI:DEU`, `imf:LUR:JPN`, `imf:NGDP_RPCH:WEOWORLD` (nhóm IMF), `bis:REER:DE`, `bis:GAP:XM`. Tháng và quý lưu ở ngày đầu kỳ; năm ở 1/1 |
| Series dẫn xuất | `calc:<tên>` | `calc:GLOBAL_LIQ`, `calc:NETLIQ_US`, `calc:RECPROB_US` (ghi bởi `fred`, xem LLDD 02 §2.2) |
| Event | `<source>:<id gốc>` | `usgs:us7000abcd` |
| Article | `hashId(url chuẩn hóa)` | `3f9a0c…` (16 hex) |

## 5. Cách ghi (store helpers)

| Helper | Bảng | Cách ghi |
|---|---|---|
| `upsertSeries(db, seriesId, source, points)` | `observations` + `series` | Upsert từng điểm trong 1 transaction, cập nhật `series.updated_at`. Trả về số điểm hợp lệ |
| `upsertQuotes(db, quotes)` | `quotes` | Upsert theo `series_id` |
| `replaceItems(db, kind, items)` | `items` | Xóa toàn bộ `kind` rồi chèn lại theo thứ tự (`rank` = vị trí). Đây là thay snapshot. Dòng không tự mang `titleVi` thì **giữ `title_vi` cũ** khi cùng `id` và tiêu đề không đổi, để kèo Polymarket hay bài Hugging Face không bị gửi đi dịch lại sau mỗi lần chạy |
| `replaceEvents(db, source, events)` | `events` | Đọc trước các `title_vi` đã có, xóa toàn bộ events của `source`, chèn lại và **giữ lại `title_vi`** theo id để không phải dịch lại. Bỏ qua điểm có tọa độ không hợp lệ |
| `upsertEvents(db, source, events)` | `events` | Upsert theo `id` (dùng cho GDELT: ô lưới 1° cập nhật dần, có `title_vi` ghi sẵn); nguồn tự xóa ô cũ hơn 24 giờ |
| Articles (trong `rss.ts`) | `articles` | `INSERT OR IGNORE` theo `id` (hash URL chuẩn hóa); xóa bài cũ hơn 14 ngày. Trùng tin giữa các báo (cùng `title_key`) **không** bị bỏ khi ghi mà được gộp lúc đọc (`getNews`) |

Mọi thao tác đều idempotent: chạy lại cùng dữ liệu không sinh bản ghi trùng.

## 6. Truy vấn mẫu

```sql
-- Sparkline 30 ngày
SELECT ts, value FROM observations
WHERE series_id = 'yahoo:^GSPC' AND ts >= :since ORDER BY ts;

-- Giá trị mới nhất và giá trị liền trước (cho delta)
SELECT ts, value FROM observations WHERE series_id = 'fred:DGS10' ORDER BY ts DESC LIMIT 2;

-- Tin mới nhất theo khu vực
SELECT * FROM articles WHERE region = :region ORDER BY published_at DESC LIMIT 30;

-- Nguồn đang lỗi
SELECT source, error, datetime(last_run/1000,'unixepoch') FROM source_status WHERE ok = 0;
```
