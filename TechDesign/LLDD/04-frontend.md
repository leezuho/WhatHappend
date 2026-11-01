# LLDD 04 — Frontend

> Phiên bản 0.3 · Ngày 2026-10-31 · Trạng thái: Đã triển khai (M1–M7)
> Liên quan: [HLDD](../HLDD/HLDD.md) · [01 Database schema](01-database-schema.md) · [06 Risk Regime](06-risk-regime.md) · [BRD 02](../../BRD/02-business-requirements.md)
> Mã nguồn: `proxy.ts`, `app/[lang]/{layout,page}.tsx`, `app/api/{brief,series/[key],watchlist}/route.ts`, `app/globals.css`, `components/{TopBar.tsx,ui,panels,charts}`, `lib/{queries,i18n,format,use-theme}.ts`, `lib/data/series.ts`, `messages/{vi,en}.json`, `scripts/copy-maplibre-worker.mjs`

## 1. Routing

| Đường dẫn | Xử lý |
|---|---|
| `/` hoặc bất kỳ path nào chưa có locale | `proxy.ts` chọn locale theo thứ tự: cookie `lang` → `Accept-Language` bắt đầu bằng `en` → mặc định `vi`. Sau đó redirect sang `/<locale><path>` |
| `/vi`, `/en` | `app/[lang]/layout.tsx` (root layout) + `app/[lang]/page.tsx` (dashboard) |
| Locale lạ | `hasLocale()` sai → `notFound()` |

- `proxy.ts` matcher bỏ qua `_next`, `api` và các file có phần mở rộng.
- `generateStaticParams` trả về `vi` và `en`, nên khung trang được prerender cho cả hai.
- `generateMetadata` lấy `title` và `description` từ từ điển.

## 2. Root layout

- `<html lang={lang} suppressHydrationWarning>`.
- Script inline trong `<head>` gán `document.documentElement.dataset.theme` **trước khi vẽ trang**: lấy giá trị đã lưu trong `localStorage.theme`, nếu không có thì theo `prefers-color-scheme`.
- `app/globals.css` được import tại đây.

## 3. Bố cục trang

Lưới `grid-cols-1` → `md:grid-cols-2` → `xl:grid-cols-12`, `max-w-[1600px]`, `gap-4`.

```
TopBar: MarketClocks · RegimeBadge · LangSwitch · ThemeToggle      (sticky)
        Ticker (dải giá chạy ngang)
Hàng 1  Brief [xl:5]                     │ Bản đồ [xl:7]
                                         │ Điểm đáng chú ý [xl:7]
Hàng 2  Vital Signs [xl:12] (+ hàng "Bạn đã ghim" nếu có watchlist)
Hàng 3  Yield curve [xl:6]               │ Lạm phát vs lãi suất [xl:6]      (lưới 2×2)
        Căng thẳng thị trường [xl:6]     │ Nhịp đập kinh tế Mỹ [xl:6]
Hàng 4  Tin tức [xl:8]                   │ Lịch sắp tới [xl:4]
Hàng 5  Trending [xl:4] │ Prediction [xl:4] │ Hành tinh & sức khỏe [xl:4]
Hàng 6  Góc Việt Nam [xl:12]
```

| Panel | Component (thân) | Nguồn (`sources`) dùng để tính trạng thái |
|---|---|---|
| Brief | `BriefBody` (`ContentPanels.tsx`) + `BriefRefresh` | `brief` |
| Bản đồ | `MapBody` → `MapView` (client) | `usgs`, `gdacs`, `eonet`, `gdelt` |
| Điểm đáng chú ý | `HighlightsBody` (`MarketPanels.tsx`), mỗi thẻ mở `TileDetail` | `insights`, `yahoo`, `fred` |
| Vital Signs | `VitalSigns` (`MarketPanels.tsx`) | `yahoo`, `fred`, `vnindex` |
| Yield curve | `YieldCurvePanel` | `fred` |
| Lạm phát vs lãi suất | `InflationRatesPanel` | `imf`, `bis` |
| Căng thẳng thị trường | `StressPanel` (small multiples VIX, HY OAS, STLFSI, GPR MA7) | `yahoo`, `fred`, `gpr` |
| Nhịp đập kinh tế Mỹ | `EconomyPulse` (8 KPI tile: Claims, Sahm, GDPNow, CPI y/y, Fed funds, 5y5y, Fed BS, GSCPI) | `fred`, `gscpi` |
| Tin tức | `NewsBody` → `NewsList` (client, lọc region/topic) | `rss`, `translate` |
| Lịch | `CalendarBody` (`WorldPanels.tsx`) | `calendar`, `launches` |
| Trending | `TrendingBody` (tab Wikipedia EN / HN / Wikipedia VI) | `wikipedia`, `hackernews` |
| Prediction | `PredictionBody` | `polymarket`, `kalshi` |
| Hành tinh & sức khỏe | `EnvBody` | `co2`, `gistemp`, `airquality`, `who` |
| Việt Nam | `VietnamBody` | `vnindex`, `sjc`, `vcb` |

Ghi chú hành vi từng panel:
- **Hàng 1:** Bản đồ và Điểm đáng chú ý xếp chồng trong một cột. Ở `xl`, khung bản đồ (`h-0 flex-1`, tối thiểu 240px) giãn ra lấp phần chiều cao còn lại so với Brief, còn danh sách Điểm đáng chú ý tối đa 264px rồi cuộn. Chân Brief (`mt-auto`) luôn nằm đáy panel.
- **Điểm đáng chú ý:** chỉ số do `findNotables` chọn (xem [05 §3a](05-ai-pipeline.md)), mỗi thẻ có giá trị, thay đổi, chip lý do (Nguy hiểm, Lưu ý, Tăng/Giảm mạnh bất thường, Cao/Thấp nhất 1 năm) và ghi chú AI (hoặc `explain` khi chưa có). Ghi chú AI cũng hiện trong hộp thoại của các tile Vital Signs và Nhịp đập kinh tế.
- **Lịch:** gộp ForexFactory (`items.calendar`, sự kiện từ 3 giờ trước trở đi), lịch FOMC từ `config/fomc.ts` và `items.launch`, cửa sổ 21 ngày, nhóm theo ngày (Asia/Ho_Chi_Minh). **Cuộc họp FOMC kế tiếp luôn hiển thị** dù nằm ngoài cửa sổ.
- **Trending:** tab mặc định là Wikipedia EN, vì top của vi.wikipedia thường bị bot đẩy lượt xem.
- **Prediction:** thang lãi suất Fed của Kalshi (chỉ hiện các mức có xác suất 2–98%, nếu không có thì 6 mức đầu) và các sự kiện Polymarket, mỗi outcome có thanh meter (track là bước nhạt của cùng hue).
- **Hành tinh & sức khỏe:** CO₂ Mauna Loa (so 1 năm trước), dị thường nhiệt độ GISTEMP (kèm trung bình 12 tháng), AQI của 10 thành phố (chấm màu trạng thái + nhãn chữ, không chỉ dựa vào màu) và tin WHO DON.
- **Việt Nam:** VN-Index (kèm độ rộng thị trường), USD/VND, bảng giá vàng VN, chênh SJC so với vàng thế giới quy đổi (1 lượng = 37,5 g), tỷ giá Vietcombank, tin VnExpress.

## 4. Mẫu Panel (`components/ui/Panel.tsx`)

```tsx
<Panel lang title subtitle sources={["fred"]} className actions?>
  <YieldCurveContent lang={lang} />   {/* async server component */}
</Panel>
```

- **Khung tĩnh** (thuộc static shell): `<section>` bo góc, viền `border-line`, nền `bg-surface`, tiêu đề `h2` và subtitle.
- **Dòng trạng thái** (`PanelStatusLine`, nằm trong `<Suspense fallback={null}>`) gọi `getPanelStatus(sources)`:
  - Thiếu key và chưa từng chạy được → hiện chip "Cần API key", tooltip liệt kê các env còn thiếu. Với nguồn `needsAi`, tooltip là `AI_ENV_HINT` = "AI_API_KEY (Gemini or Claude)", tính từ `aiStatus()`.
  - Có `lastOk` → hiện "Cập nhật HH:MM" (giờ Asia/Ho_Chi_Minh).
  - Panel stale khi có nguồn mà `now − last_ok > 3 × intervalMs`, **hoặc** lần chạy gần nhất lỗi (`ok = 0`). Khi đó hiện chip gồm chấm `bg-warning` và nhãn "Lỗi nguồn" hoặc "Dữ liệu cũ", tooltip liệt kê `source: error`. Trạng thái không bao giờ chỉ thể hiện bằng màu.
- **Thân panel** nằm trong `<Suspense fallback={<PanelSkeleton/>}>`. `EmptyState` hiện khi không có dữ liệu.

## 5. Query layer (`lib/queries.ts`, `lib/data/series.ts`)

- Mọi hàm đọc đều `async` và **gọi `await connection()` trước** truy vấn SQL đồng bộ. Lý do: bật Cache Components thì truy vấn đồng bộ sẽ bị đóng băng vào static shell (xem [HLDD ADR-05](../HLDD/HLDD.md#adr-05--cache-components-connection-và-suspense)).
- `lib/data/series.ts` chứa các hàm SQL thuần dùng chung cho UI và worker: `getPoints`, `getLastPoints`, `getTile` (quote trực tiếp được ưu tiên hơn điểm quan sát cuối), `getDetailPoints`, `getWatchlistKeys`.
- Các hàm trong `lib/queries.ts`:

| Hàm | Trả về |
|---|---|
| `getPanelStatus(ids)` | `{ lastOk, stale, failing[], missingKey[] }` |
| `getTiles(keys)` | KPI tile: giá trị, thay đổi, sparkline 30 ngày. **CPI** được đổi sang lạm phát so cùng kỳ (YoY) |
| `getYieldCurve()` | 11 kỳ hạn × (mới nhất, 1 tháng trước, 1 năm trước) |
| `getCountryMacro(lang)` | Lạm phát/tăng trưởng IMF năm hiện tại + lãi suất BIS mới nhất |
| `getHistory(ids, days)` | Lịch sử cho small multiples |
| `getRegime()` | Kết quả Risk Regime ([LLDD 06](06-risk-regime.md)) |
| `getTicker()` | Mọi quote cho dải ticker |
| `getMapEvents(lang)` | Sự kiện 14 ngày, gán nhóm `quake` / `hazard` / `news` |
| `getNews(lang, limit)` | Tin 3 ngày, gộp theo `title_key` (kèm danh sách "cùng tin") |
| `getLatestBrief(lang)` | Brief mới nhất, có key hay không, thời điểm đã yêu cầu viết lại |
| `getVietnam(lang)` | Dữ liệu panel Việt Nam |
| `getItems(kind, lang)` | Snapshot list theo `kind`, ưu tiên `title_vi` khi locale `vi` |
| `getCalendar(lang, days)` | Lịch đã gộp (xem §3) |
| `getEnv(lang)` | CO₂, GISTEMP, AQI, WHO |
| `getWatchlist()` | Danh sách `SeriesKey` đã ghim |
| `requestNow()` | `Date.now()` theo từng request, dùng cho nhãn "x phút trước" (tránh gọi hàm không thuần trong lúc render) |

- Đơn vị hiển thị: Claims dùng số thô (ngưỡng 260 000 / 300 000); bảng cân đối Fed hiển thị theo nghìn tỷ USD (`$T`, FRED đơn vị triệu ÷ 1e6).

### 5.1 Route handlers (ghi/đọc nhỏ từ client)

| Route | Hành vi |
|---|---|
| `POST /api/brief` | Chỉ ghi cờ `kv['brief:force']`. Worker thấy cờ ở tick kế tiếp và viết brief (tối đa một lần mỗi 10 phút); web không gọi AI |
| `GET /api/series/[key]?days=` | Lịch sử một `SeriesKey` (7–3650 ngày, mặc định 730) cho hộp thoại chi tiết; khóa lạ → 404 |
| `POST /api/watchlist` `{ key, on }` | Ghim/bỏ ghim một `SeriesKey` vào bảng `watchlist` (cột `series_id` lưu `SeriesKey`) |

Hai route `POST` trả 403 cho request mà trình duyệt đánh dấu là từ origin khác (`Sec-Fetch-Site` khác `same-origin`/`none`, hoặc `Origin` khác host), xem `lib/same-origin.ts`. Next.js không chống CSRF cho route handler và ứng dụng không có đăng nhập, nên nếu thiếu bước này thì bất kỳ trang nào đang mở cũng gửi được `POST` tới localhost. Request không có hai header đó (curl, script trên máy) vẫn được nhận.

Kiểu dữ liệu brief dùng chung nằm ở `lib/ai/brief-shared.ts`, cấu hình AI ở `lib/ai/config.ts`. Cả hai không import SDK, nên bundle web không kéo theo `@google/genai` hay `@anthropic-ai/sdk`. `getLatestBrief` trả `hasKey = isAiConfigured()`. Khi chưa cấu hình, panel Brief hiện hướng dẫn đặt `AI_API_KEY` (Gemini hoặc Claude). Chân panel Brief ghi tên model thật mà provider trả về, ví dụ `gemini-3.8-flash`.

## 6. Client components

| Component | Hành vi |
|---|---|
| `MarketClocks` | Giờ địa phương của LA (America/Los_Angeles, chỉ hiện giờ vì bờ Tây Mỹ không có sàn lớn) và trạng thái `open` / `break` / `closed` của NY (America/New_York 09:30–16:00), LDN (Europe/London 08:00–16:30), HCM (Asia/Ho_Chi_Minh 09:00–11:30, 13:00–14:45), SHA (Asia/Shanghai 09:30–11:30, 13:00–15:00), TYO (Asia/Tokyo 09:00–11:30, 12:30–15:30), MEL (Australia/Melbourne, chung múi giờ với Sydney nên dùng giờ ASX 10:00–16:00). Xếp từ trái sang phải theo UTC offset tăng dần; thứ tự này giữ nguyên quanh năm dù có giờ mùa hè. Chỉ Thứ 2–Thứ 6, chưa tính ngày lễ. Rê chuột vào mã hiện tên thành phố và sàn. Đồng hồ là một external store 30 giây đọc qua `useSyncExternalStore`; snapshot phía server là `null` nên khung tĩnh hiện `--:--`. Không có `setState` trong effect |
| `ThemeToggle` | Đọc theme qua `useTheme()` (`lib/use-theme.ts`: `useSyncExternalStore` + `MutationObserver` trên `<html data-theme>`); click thì đổi `data-theme` và lưu `localStorage.theme` |
| `LangSwitch` | Hai link `/vi` và `/en`; khi click ghi cookie `lang` (1 năm) để proxy nhớ lựa chọn; có `aria-current` |
| `AutoRefresh` | Gọi `router.refresh()` mỗi 60 giây khi tab đang hiện, và gọi ngay khi tab hiện lại |
| `Ticker` (server) | Hai bản sao danh sách trượt ngang với CSS `@keyframes ticker` 90 giây; dừng khi rê chuột; tắt khi `prefers-reduced-motion` |
| `RegimeBadge` (server) | `<details>` hiện nhãn regime; mở ra thấy điểm, z-score từng thành phần và ngưỡng |
| `Tabs` | Tab phía client bọc các pane đã render ở server (dùng cho Trending) |
| `NewsList` | Lọc theo region rồi topic (chip có `aria-pressed`), hiện tối đa 40 tin, "x phút trước" tính từ `now` do server truyền vào |
| `MapView` | Xem §9 |
| `BriefRefresh` | POST `/api/brief`, rồi `router.refresh()`; hiện "Đã yêu cầu…" khi đang chờ |
| `TileDetail` | Bọc KPI tile thành nút; mở `<dialog>` với lịch sử 3T/1N/2N/5N tải từ `/api/series/[key]`, và nút ghim/bỏ ghim (POST `/api/watchlist`). Series đã ghim hiện ở hàng "Bạn đã ghim" dưới Vital Signs |
| `LineChart`, `BarChart` | Recharts, nhận dữ liệu đã serialize; có nút chuyển sang **chế độ xem bảng** |

## 7. Đặc tả biểu đồ (Recharts, theo phương pháp dataviz)

- **Chọn dạng biểu đồ:**
  - Một con số quan trọng → KPI tile, không vẽ chart.
  - Diễn biến theo thời gian → line chart.
  - So sánh giữa các quốc gia → cột nhóm (lạm phát vs lãi suất), lãi suất thực ghi bằng chữ bên dưới.
  - Nhiều thước đo khác đơn vị → small multiples (panel Căng thẳng), không gộp trục.
- **Nét vẽ:**
  - Line 2px, đầu và chỗ nối bo tròn.
  - Area fill khoảng 10% opacity.
  - Grid và trục là hairline 1px, nét liền, màu `--grid` / `--axis`.
  - Bar dày tối đa 24px, đầu bo 4px.
  - Marker tối thiểu 8px, có viền 2px màu surface.
- **Tương tác:**
  - Line/area có crosshair dọc và một tooltip liệt kê **mọi series** tại điểm X đó; giá trị in đậm trước tên series.
  - Bar có tooltip riêng cho từng cột.
- **Nhận diện:**
  - Từ 2 series trở lên luôn có legend; nếu ≤ 4 series thì thêm nhãn trực tiếp ở cuối đường.
  - Màu series cố định theo thực thể, không theo thứ hạng.
- **Không dùng biểu đồ hai trục tung.** Hai đơn vị khác nhau thì tách 2 chart hoặc quy về cùng gốc (index).
- **Chữ** dùng token ink (`text-ink`, `text-ink-2`, `text-muted`), không dùng màu series.
- **KPI tile** gồm `label` · `value` · `delta` có dấu (giá: %, lợi suất/spread: bp), màu = hướng × "tăng là tốt hay xấu" (ví dụ VIX tăng = `--down`) · sparkline 30 ngày · trạng thái ngưỡng (chấm + nhãn "Lưu ý"/"Nguy hiểm", viền `warning`/`critical`). Tile là **container query** (`@container`): hẹp hơn 200px thì sparkline xếp xuống dưới giá trị, giá trị không bị cắt.
- **Chế độ xem bảng:** mọi `LineChart`/`BarChart` có nút "Bảng"/"Biểu đồ".

## 8. Token màu (`app/globals.css`)

| Token | Sáng | Tối | Dùng cho |
|---|---|---|---|
| `--page` / `--surface` / `--surface-2` | `#f9f9f7` / `#fcfcfb` / `#f3f2ee` | `#0d0d0d` / `#1a1a19` / `#232321` | Nền trang, nền panel, nền phụ |
| `--ink` / `--ink-2` / `--muted` | `#0b0b0b` / `#52514e` / `#898781` | `#ffffff` / `#c3c2b7` / `#898781` | Chữ chính, chữ phụ, nhãn trục |
| `--grid` / `--axis` / `--border` | `#e1e0d9` / `#c3c2b7` / `rgba(11,11,11,.1)` | `#2c2c2a` / `#383835` / `rgba(255,255,255,.1)` | Lưới, trục, viền |
| `--up` / `--down` | `#006300` / `#c0302f` | `#0ca30c` / `#ef6b6b` | Chữ delta |
| `--s1`…`--s8` | `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #008300 #4a3aa7 #e34948` | `#3987e5 #d95926 #199e70 #c98500 #d55181 #008300 #9085e9 #e66767` | Màu series theo **thứ tự cố định** |
| `--good` / `--warning` / `--serious` / `--critical` | `#0ca30c` / `#fab219` / `#ec835a` / `#d03b3b` | giống bên sáng | Trạng thái, luôn kèm biểu tượng và nhãn |
| `--accent` / `--on-accent` | `var(--ink)` / `var(--surface)` | như bên sáng (theo `--ink` tối) | Nút đang chọn: ngôn ngữ, theme, tab, bộ lọc tin, khoảng thời gian |
| `--display` | font sans như thân bài | như bên sáng | Logo, tiêu đề panel, tiêu đề Brief (`font-display`) |

**Theme thứ ba `anthropic`** (`[data-theme="anthropic"]`): nền giấy ngà ấm (`--page #f0eee6`, `--surface #faf9f5`, `--surface-2 #e8e6dc`), chữ `#141413` / `#3d3d3a` / `#73726c`, accent đất nung `#b4532f` (chữ trắng đạt 4,98:1), tiêu đề serif (`ui-serif, Georgia…`). Màu series và màu trạng thái giữ nguyên bảng sáng đã kiểm định. Đây là theme sáng: `useTheme()` trả `light` (bản đồ dùng `positron`), còn `useThemeName()` trả tên đầy đủ. `ThemeToggle` là nút ba lựa chọn, lưu vào `localStorage.theme`.

- Token được map sang Tailwind qua `@theme inline` (`bg-surface`, `text-ink-2`, `bg-s1`…).
- Biến thể `dark:` dùng `[data-theme="dark"]`. Media query `prefers-color-scheme` là phương án dự phòng khi không có JS, và bỏ qua cả `light` lẫn `anthropic`.
- Font: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Lớp `.tabular` dùng cho cột số và trục.

## 9. Bản đồ (`components/panels/MapView.tsx`)

- MapLibre GL qua `react-map-gl/maplibre`, tile vector OpenFreeMap (không cần key): style `positron` khi sáng, `dark` khi tối, theo `useTheme()`.
- **Worker của MapLibre:** MapLibre 6 tìm file worker qua `import.meta.url`, cách này hỏng khi bundle bằng Turbopack ("Worker failed to load"). `scripts/copy-maplibre-worker.mjs` (chạy qua hook `predev`/`prebuild`) chép `maplibre-gl-worker.mjs` vào `public/vendor/`, và `MapView` gọi `setWorkerUrl("/vendor/maplibre-gl-worker.mjs")`. Xem [HLDD ADR-09](../HLDD/HLDD.md#adr-09--tự-phục-vụ-worker-của-maplibre).
- **Tối đa 3 màu phân loại** (bản đồ là ngữ cảnh "all-pairs" nên chỉ 3 slot đầu đạt chuẩn):
  - `quake` (`--s1`): `type = earthquake` (USGS, GDACS EQ, EONET);
  - `hazard` (`--s2`): cyclone, flood, drought, volcano, wildfire, storm, tsunami, landslide, heat;
  - `news` (`--s3`): điểm nóng GDELT (conflict, protest).
- Bán kính: động đất theo độ lớn (4,5 → 4px, 8 → 13px), các loại khác theo `level`. **Mức cảnh báo là vòng viền** màu trạng thái (`red` → `--critical`, `orange` → `--serious`), có chú giải "Cảnh báo cam/đỏ".
- Hàng chip lọc theo nhóm (kèm số lượng) phía trên bản đồ; nút "Danh sách" chuyển sang bảng sự kiện (tương đương chế độ xem bảng).
- Rê chuột hiện popup (tiêu đề theo locale + thời gian); click mở link nguồn.

## 10. i18n và định dạng

- `messages/en.json` là hình mẫu kiểu (`Dict`). `messages/vi.json` được gán kiểu `Dict`, nên thiếu khóa là lỗi TypeScript.
- Mọi chuỗi giao diện (kể cả `aria-label`, nhãn sản phẩm vàng, tên thành phần Risk Regime, tiêu đề FOMC trong `getCalendar`) lấy từ `getDict(lang)`. Không viết `lang === "vi" ? … : …` hay bảng `{ en, vi }` trong component. Component client nhận chuỗi qua props từ server component.
- `lib/i18n.ts`:
  - `locales = ["vi", "en"]`, `defaultLocale = "vi"`;
  - `hasLocale`, `getDict`;
  - `Bi = { en, vi }` + `pick(text, locale)` cho chuỗi song ngữ khai báo trong config;
  - `intlLocale(locale)` trả về `vi-VN` hoặc `en-US`.
- `lib/format.ts` dùng `Intl`: `fmtNumber`, `fmtCompact`, `fmtSigned`, `fmtPct`, `fmtTime` (mặc định Asia/Ho_Chi_Minh), `fmtDate`, `fmtDateTime`, `fmtRelative`.
- Nội dung động: hiện `title_vi` / `title_en` theo locale, không có thì hiện `title` gốc.
