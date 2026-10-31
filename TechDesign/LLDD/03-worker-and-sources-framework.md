# LLDD 03 — Worker và framework nguồn dữ liệu

> Phiên bản 0.3 · Ngày 2026-10-31 · Trạng thái: Đã triển khai
> Liên quan: [HLDD](../HLDD/HLDD.md) · [01 Database schema](01-database-schema.md) · [LLDD 02 Data sources](02-data-sources.md) · [07 Kiểm thử và vận hành](07-testing-and-operations.md)
> Mã nguồn: `config/sources.ts`, `lib/sources/{types,http,store,runner,index}.ts`, `worker/index.ts`, `scripts/fetch.ts`

## 1. Interface

```ts
// lib/sources/types.ts
interface SourceContext {
  db: DatabaseSync;               // node:sqlite
  log: (msg: string) => void;     // đã gắn tiền tố "[<id>]"
}

interface Source {
  id: SourceId;                                   // khóa của SOURCE_META
  intervalMs: number;                             // lấy từ SOURCE_META
  requiresEnv?: string[];                         // thiếu env → nguồn bị bỏ qua (skipped)
  needsAi?: boolean;                              // cần AI provider đã cấu hình (lib/ai/config.ts)
  isDue?: (now: number, status: SourceStatusRow | undefined, db: DatabaseSync) => boolean; // ghi đè luật đến hạn (có thể đọc cờ trong bảng kv)
  run(ctx: SourceContext): Promise<number>;       // lấy → kiểm tra → ghi; trả về số bản ghi
}
```

**`config/sources.ts` (`SOURCE_META`)** khai báo `intervalMs`, `requiresEnv` và `needsAi` cho mọi nguồn. File này **không import fetcher**, nhờ vậy web server dùng được nó để tính stale mà không phải bundle code fetcher. `SourceId = keyof typeof SOURCE_META`.

Mỗi fetcher spread meta của mình, ví dụ `lib/sources/usgs.ts`:

```ts
export const usgs: Source = { id: "usgs", ...SOURCE_META.usgs, async run({ db }) { … } };
```

## 2. Runner (`lib/sources/runner.ts`)

| Hàm | Hành vi |
|---|---|
| `getStatus(db, id)` | Đọc dòng `source_status` của nguồn |
| `missingEnv(source)` | Những gì nguồn còn thiếu: env trong `requiresEnv` chưa đặt, cộng thêm `aiStatus().reason` nếu `needsAi` mà AI chưa cấu hình (ví dụ `set AI_API_KEY (Gemini or Claude) in .env.local`) |
| `isDue(source, db, now)` | Dùng `source.isDue(now, status, db)` nếu có. Chưa có status → đến hạn ngay. Lần trước thành công → đến hạn sau `intervalMs`. Lần trước lỗi → sau `max(60 000 ms, intervalMs / 4)` |
| `runSource(source, db, log)` | Thiếu env thì trả `{ skipped: true }` và **không ghi status**. Nếu không thì chạy `source.run`, bắt mọi lỗi (cắt message còn 500 ký tự), upsert `source_status` (`last_ok` chỉ cập nhật khi thành công), chèn một dòng `fetch_log` và xóa log cũ hơn 7 ngày. Trả về `RunResult { id, ok, count, error?, durationMs, skipped? }` |

```
runSource
  ├─ missingEnv? ──yes──► return skipped
  ├─ t0 = now
  ├─ try count = await source.run(ctx)        → ok
  │  catch err                                 → ok = false, error = message[0..500]
  ├─ UPSERT source_status (last_ok = COALESCE(new, old))
  ├─ INSERT fetch_log
  └─ DELETE fetch_log WHERE at < now − 7 ngày
```

## 3. Scheduler (`worker/index.ts`)

- Khi khởi động, in danh sách nguồn bị bỏ qua vì thiếu env.
- Gọi `tick()` ngay, sau đó lặp lại mỗi **`TICK_MS = 20 000`**.
- `tick()` duyệt từng nguồn, bỏ qua nếu nguồn đang chạy (`running: Set`), thiếu env, hoặc chưa đến hạn. Ngược lại thì gọi `runSource` **không chờ**: các nguồn chạy song song, mỗi nguồn tối đa 1 lần chạy cùng lúc.
- Log có dạng `HH:MM:SS ok <id> (<n> rows, <ms>ms)` hoặc `HH:MM:SS FAIL <id>: <error>`.
- Thời điểm đến hạn tính theo DB (`last_run`), nên restart worker không làm mọi nguồn chạy lại cùng lúc.
- Daily Brief (`lib/ai/brief.ts`) dùng `isDue(now, status, db)` riêng:
  - Nếu lần chạy gần nhất lỗi và chưa quá 30 phút → chưa đến hạn (tránh gọi lại liên tục).
  - Đến hạn khi **một trong hai**: (a) bảng `briefs` chưa có bản cho ngày hôm nay (theo giờ Asia/Ho_Chi_Minh) và giờ hiện tại ≥ 06:00; (b) cờ `kv['brief:force']` (do nút "Viết lại" trên web đặt) mới hơn bản brief gần nhất.
  - Thêm điều kiện: có ít nhất 15 bài trong 24 giờ qua.

## 4. CLI chạy tay (`scripts/fetch.ts`)

```bash
npm run fetch -- usgs            # chạy một nguồn
npm run fetch -- usgs fred rss   # chạy nhiều nguồn
npm run fetch -- all             # chạy tất cả, lần lượt từng nguồn
npm run fetch                    # in hướng dẫn và danh sách nguồn
```

- Id không tồn tại thì báo lỗi và exit 1.
- Mỗi nguồn in ra `ok`, `skip` hoặc `FAIL`. Exit code là 1 nếu có ít nhất một nguồn FAIL.
- CLI đi qua `runSource`, nên vẫn cập nhật `source_status` và `fetch_log` như worker.
- Script npm khai báo trong `package.json`: `worker` = `node --env-file-if-exists=.env.local --import tsx worker/index.ts`, `fetch` = `node --env-file-if-exists=.env.local --import tsx scripts/fetch.ts`. Cả hai **nạp `.env.local`** (thiếu file chỉ in cảnh báo). Ngoài ra có `typecheck` (`tsc --noEmit`) và `dev:all` (worker + `next dev`).

## 5. HTTP helpers (`lib/sources/http.ts`)

| Hàm | Mô tả |
|---|---|
| `fetchText(url, opts)` | Trả về text |
| `fetchBuffer(url, opts)` | Trả về `Buffer` (dùng cho file xls/xlsx) |
| `fetchJson(url, schema, opts)` | Thêm `Accept: application/json` và parse bằng zod `safeParse`. Sai định dạng thì ném lỗi `Unexpected response shape from <host>: <path>: <message>` (tối đa 3 issue) |
| `parseCsv(text)` | Parser CSV gần chuẩn RFC 4180: hỗ trợ trường có ngoặc kép, `""` escape, CRLF; bỏ dòng rỗng |

`FetchOpts`: `timeoutMs` (mặc định **20 000**), `headers`, `method`, `body`, `browserUA`.

**Chính sách request:**
- User-Agent mặc định nhận diện ứng dụng (`… WhatHappendDashboard/0.1`). `browserUA: true` thì dùng UA Chrome cho các host chặn bot.
- Tối đa **2 lần thử**:
  - HTTP 5xx hoặc 429: chờ 1,5 giây × số lần đã thử rồi thử lại.
  - HTTP 4xx khác: ném lỗi ngay, không retry.
  - Lỗi mạng hoặc timeout: thử lại ngay một lần.

## 6. Store helpers (`lib/sources/store.ts`)

| Helper | Tóm tắt (chi tiết ở [01](01-database-schema.md#5-cách-ghi-store-helpers)) |
|---|---|
| `upsertSeries(db, seriesId, source, points: Point[])` | Upsert `observations`, cập nhật `series.updated_at`, bỏ điểm không hữu hạn |
| `upsertQuotes(db, quotes: QuoteRow[])` | Upsert `quotes` |
| `replaceItems(db, kind, items: ItemRow[])` | Thay toàn bộ snapshot của `kind`; `data` được `JSON.stringify` |
| `replaceEvents(db, source, events: EventRow[])` | Thay events của `source`, giữ lại `title_vi` |
| `hashId(input)` | sha1 → 16 ký tự hex |
| `dayTs(date)` | 00:00 UTC của ngày tương ứng |

## 7. Cách thêm một nguồn mới

1. Thêm khóa vào `SOURCE_META` trong `config/sources.ts` với `intervalMs`, và `requiresEnv` / `needsAi` nếu cần.
2. Tạo `lib/sources/<id>.ts`:
   - khai báo zod schema cho phản hồi;
   - viết `run({ db, log })` gọi `fetchJson`/`fetchText`;
   - map sang `Point` / `QuoteRow` / `ItemRow` / `EventRow`;
   - gọi store helper và trả về số bản ghi.
3. Thêm 1 dòng vào mảng `sources` trong `lib/sources/index.ts`.
4. Nếu cần key thì thêm biến vào `.env.example`.
5. Chạy `npm run fetch -- <id>` và kiểm tra dòng `ok`, sau đó kiểm tra dữ liệu trong DB.
6. Gắn nguồn vào panel tương ứng qua prop `sources={["<id>"]}` để có trạng thái stale.

## 8. Chu kỳ cập nhật (theo `SOURCE_META` hiện tại)

| Nhóm | Nguồn → chu kỳ |
|---|---|
| Thị trường | `yahoo` 3 phút |
| Vĩ mô | `fred` 6 giờ · `bis` 12 giờ · `imf`, `gpr`, `gscpi` 24 giờ |
| Tin tức và AI | `rss` 10 phút · `gdelt` 15 phút · `translate` 5 phút* · `brief` 24 giờ* (lúc 06:00) |
| Bản đồ | `usgs` 10 phút · `gdacs` 30 phút · `eonet` 1 giờ |
| Trending / lịch / dự đoán | `hackernews` 20 phút · `polymarket`, `kalshi` 15 phút · `wikipedia`, `calendar`, `launches` 3 giờ |
| Môi trường và sức khỏe | `airquality` 1 giờ · `who` 6 giờ · `co2`, `gistemp` 24 giờ |
| Việt Nam | `vnindex` 3 phút · `sjc` 30 phút · `vcb` 1 giờ |

\* `needsAi`: cần AI provider đã cấu hình (`AI_API_KEY`, Gemini hoặc Claude). Lúc khởi động, worker in `AI: <provider> (brief …, fast …)` hoặc `AI: off`, rồi in một dòng `skip <id>: <lý do>` cho mỗi nguồn còn thiếu cấu hình. Cả 26 nguồn đã được cài đặt.
