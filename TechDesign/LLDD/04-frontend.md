# LLDD 04 — Frontend

> Phiên bản 0.4 · Ngày 2026-11-03 · Trạng thái: Đã triển khai (M1–M7)
> Liên quan: [HLDD](../HLDD/HLDD.md) · [01 Database schema](01-database-schema.md) · [06 Risk Regime](06-risk-regime.md) · [BRD 02](../../BRD/02-business-requirements.md)
> Mã nguồn: `proxy.ts`, `app/[lang]/{layout,page}.tsx`, `app/api/{brief,series/[key],watchlist}/route.ts`, `app/globals.css`, `components/{TopBar.tsx,ui,panels,charts}`, `lib/{queries,i18n,format,use-theme}.ts`, `lib/data/series.ts`, `messages/{vi,en}.json`, `scripts/copy-maplibre-worker.mjs`

## 1. Routing

| Đường dẫn | Xử lý |
|---|---|
| `/` hoặc bất kỳ path nào chưa có locale | `proxy.ts` chọn locale theo thứ tự: cookie `lang` → `Accept-Language` bắt đầu bằng `en` → mặc định `vi`. Sau đó redirect sang `/<locale><path>` |
| `/vi`, `/en` | `app/[lang]/layout.tsx` (root layout) + `app/[lang]/page.tsx` (dashboard) |
| `/vi/crypto`, `/en/crypto` | `app/[lang]/crypto/page.tsx` (trang crypto, xem §3a) |
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
Hàng 1  Bản đồ [xl:12]: bản đồ + cột "Cảnh báo & động đất lớn"
Hàng 2  Brief [xl:5]                     │ Điểm đáng chú ý [xl:7]
Hàng 3  Vital Signs [xl:12] (+ hàng "Bạn đã ghim" nếu có watchlist)
Hàng 4  Yield curve [xl:6]               │ Lạm phát vs lãi suất [xl:6]      (lưới 2×2)
        Căng thẳng thị trường [xl:6]     │ Nhịp đập kinh tế Mỹ [xl:6]
Hàng 5  Tin tức [xl:8]                   │ Lịch sắp tới [xl:4]
Hàng 6  Trending [xl:4] │ Prediction [xl:4] │ Hành tinh & sức khỏe [xl:4]
Hàng 7  Góc Việt Nam [xl:12]
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
- **Hàng 1:** bản đồ chiếm cả hàng, cao 360 / 440 / 520px (mobile / `md` / `xl`), xem §9.
- **Hàng 2:** Brief và Điểm đáng chú ý nằm cạnh nhau. Điểm đáng chú ý có tối đa 8 thẻ (`findNotables`), nên hiện hết mà không cần cuộn. Chân Brief (`mt-auto`) luôn nằm đáy panel.
- **Brief:** hiện tiêu đề chính và 3 ý đầu (`BRIEF_SHOWN`), các ý còn lại nằm trong `<details>` "Xem thêm N ý" (không cần JS). Mỗi ý có ảnh nhỏ của bài báo đầu tiên được trích dẫn mà có ảnh. `getLatestBrief` tra ảnh theo URL nguồn trong `articles` (`BriefView.images`).
- **Ảnh bài báo** (`components/ui/Thumb.tsx`): dùng `<img>` thường, `loading="lazy"`, `referrerPolicy="no-referrer"`, `alt=""` vì tiêu đề bên cạnh đã là chữ. Chỉ nhận URL `https://`; ảnh lỗi thì tự ẩn. Không dùng `next/image`, vì bộ tối ưu ảnh của Next sẽ bắt server web tải URL bên ngoài, trái quy tắc "web không gọi ra ngoài". Ảnh do trình duyệt tải thẳng từ báo, giống tile bản đồ.
- **Điểm đáng chú ý:** chỉ số do `findNotables` chọn (xem [05 §3a](05-ai-pipeline.md)), mỗi thẻ có giá trị, thay đổi, chip lý do (Nguy hiểm, Lưu ý, Tăng/Giảm mạnh bất thường, Cao/Thấp nhất 1 năm) và ghi chú AI (hoặc `explain` khi chưa có). Ghi chú AI cũng hiện trong hộp thoại của các tile Vital Signs và Nhịp đập kinh tế.
- **Lịch:** gộp ForexFactory (`items.calendar`, sự kiện từ 3 giờ trước trở đi), lịch FOMC từ `config/fomc.ts` và `items.launch`, cửa sổ 21 ngày, nhóm theo ngày (Asia/Ho_Chi_Minh). **Cuộc họp FOMC kế tiếp luôn hiển thị** dù nằm ngoài cửa sổ.
- **Trending:** tab mặc định là Wikipedia EN, vì top của vi.wikipedia thường bị bot đẩy lượt xem.
- **Prediction:** thang lãi suất Fed của Kalshi (chỉ hiện các mức có xác suất 2–98%, nếu không có thì 6 mức đầu) và các sự kiện Polymarket, mỗi outcome có thanh meter (track là bước nhạt của cùng hue).
- **Hành tinh & sức khỏe:** CO₂ Mauna Loa (so 1 năm trước), dị thường nhiệt độ GISTEMP (kèm trung bình 12 tháng), AQI của 10 thành phố (chấm màu trạng thái + nhãn chữ, không chỉ dựa vào màu) và tin WHO DON.
- **TopBar:** có thanh điều hướng Tổng quan / Crypto (`section`); `LangSwitch` giữ nguyên trang khi đổi ngôn ngữ (`/vi/crypto` → `/en/crypto`).
- **Việt Nam:** VN-Index (kèm độ rộng thị trường), USD/VND, bảng giá vàng VN, chênh SJC so với vàng thế giới quy đổi (1 lượng = 37,5 g), tỷ giá Vietcombank, tin VnExpress.

## 3a. Trang crypto (`app/[lang]/crypto/page.tsx`, `components/panels/CryptoPanels.tsx`)

Cùng TopBar, Ticker, lưới và `AutoRefresh` với dashboard. Mọi panel đọc `getCrypto(lang)` (bọc `cache()`, một lần mỗi request).

```
Hàng 1  Chỉ số sống còn của crypto [xl:12]: 8 tile CRYPTO_SIGNS + thẻ Fear & Greed
Hàng 2  Top coin [xl:8]                  │ Đòn bẩy & nhu cầu trong nước [xl:4]
Hàng 3  Mạng Bitcoin [xl:4] │ Coin đang hot [xl:4] │ Kèo crypto [xl:4]
Hàng 4  Tin crypto [xl:12] (2 cột từ md)
```

| Panel | Component | `sources` |
|---|---|---|
| Chỉ số sống còn | `CryptoVitals`: tile BTC, ETH, SOL, vốn hóa, BTC.D, DVOL, stablecoin, USDT/VND (đều mở `TileDetail`), thẻ Fear & Greed (meter 0–100, hôm qua/tuần/tháng trước, sparkline 90 ngày) | `yahoo`, `coingecko`, `fng`, `deribit`, `defillama`, `binance` |
| Top coin | `TopCoinsBody`: giá, 1h/24h/7d, vốn hóa, so với ATH, sparkline 7 ngày. Dưới `sm` chỉ còn #, mã, giá, 24h, 7d | `coingecko` |
| Đòn bẩy & nhu cầu trong nước | `DerivsBody`: funding 8h và quy năm, OI và % đổi 24h; USDT/VND P2P (giá mua/bán, so với USD bán ra Vietcombank) | `binance`, `vcb` |
| Mạng Bitcoin | `NetworkBody`: ngày halving ước tính, meter tiến độ epoch, phí sat/vB, điều chỉnh độ khó, hashrate so với 30 ngày trước | `mempool` |
| Coin đang hot | `TrendingCoinsBody` | `coingecko` |
| Kèo crypto | `CryptoOddsBody` → `PolyEvents` (dùng chung với panel Prediction) | `polymarket` |
| Tin crypto | `CryptoNewsBody` (`getCryptoNews`) | `rss`, `translate` |

Đơn vị `$B` (tỷ USD) hiển thị dạng rút gọn theo ngôn ngữ: `$2.59T` / `$2,59 NT`, khớp với `fmtCompact` trong các bảng.

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
| `getTiles(keys)` | KPI tile: giá trị, thay đổi, sparkline 30 ngày, biên độ 1 năm (`range`, có thể vắng). **CPI** được đổi sang lạm phát so cùng kỳ (YoY) |
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
| `NewsList` | Lọc theo region rồi topic (chip có `aria-pressed`), hiện tối đa 40 tin, "x phút trước" tính từ `now` do server truyền vào. Trên cùng là tối đa 3 thẻ ảnh lớn (`pickFeatured`): trong 15 tin đầu, lấy tin có ảnh được nhiều báo đưa nhất (`alsoIn`), hòa thì lấy tin mới hơn. Các tin còn lại có ảnh nhỏ bên phải. Khi gộp cùng câu chuyện, tin thiếu ảnh mượn ảnh của bản ở báo khác. Tin crypto (`CryptoNewsBody`) cũng có ảnh nhỏ |
| `MapView` | Xem §9 |
| `BriefRefresh` | POST `/api/brief`, rồi `router.refresh()`; hiện "Đã yêu cầu…" khi đang chờ |
| `TileDetail` | Bọc KPI tile thành nút; mở `<dialog>` với lịch sử 3T/1N/2N/5N tải từ `/api/series/[key]`, và nút ghim/bỏ ghim (POST `/api/watchlist`). Series đã ghim hiện ở hàng "Bạn đã ghim" dưới Vital Signs |
| `LineChart` | Recharts, nhận dữ liệu đã serialize; có nút chuyển sang **chế độ xem bảng**. `area` tô mờ dưới series đầu; `zones` vẽ dải "Lưu ý"/"Nguy hiểm" theo `Threshold` của series |
| `DumbbellChart` | HTML/CSS thuần (client): mỗi thực thể một hàng, hai chấm trên cùng trục, đường nối giữa hai chấm; cột phải ghi hiệu b − a. Rê chuột hoặc focus bàn phím hiện tooltip, có chế độ xem bảng |
| `Sparkline` (server) | SVG thuần: đường màu `--muted` trên lớp tô gradient, điểm cuối chấm `--s1`. `fluid` giãn theo bề rộng thẻ (`preserveAspectRatio="none"` + `vector-effect: non-scaling-stroke`), chấm cuối là phần tử HTML để luôn tròn |

## 7. Đặc tả biểu đồ (Recharts, theo phương pháp dataviz)

- **Chọn dạng biểu đồ:**
  - Một con số quan trọng → KPI tile, không vẽ chart.
  - Diễn biến theo thời gian → line chart.
  - So sánh hai thước đo cùng đơn vị giữa các quốc gia → dumbbell (lạm phát vs lãi suất): độ dài đường nối chính là lãi suất thực, hàng xếp theo lãi suất thực giảm dần, cột phải ghi số. Việt Nam (BIS không công bố lãi suất) chỉ có một chấm, nằm cuối.
  - Nhiều thước đo khác đơn vị → small multiples (panel Căng thẳng), không gộp trục.
- **Nét vẽ:**
  - Line 2px, đầu và chỗ nối bo tròn.
  - Area fill khoảng 10% opacity.
  - Grid và trục là hairline 1px, nét liền, màu `--grid` / `--axis`.
  - Marker tối thiểu 8px, có viền 2px màu surface.
- **Tương tác:**
  - Line/area có crosshair dọc và một tooltip liệt kê **mọi series** tại điểm X đó; giá trị in đậm trước tên series.
  - Dumbbell có tooltip riêng cho từng hàng (cả khi focus bằng bàn phím).
- **Nhận diện:**
  - Từ 2 series trở lên luôn có legend; nếu ≤ 4 series thì thêm nhãn trực tiếp ở cuối đường.
  - Màu series cố định theo thực thể, không theo thứ hạng.
- **Không dùng biểu đồ hai trục tung.** Hai đơn vị khác nhau thì tách 2 chart hoặc quy về cùng gốc (index).
- **Chữ** dùng token ink (`text-ink`, `text-ink-2`, `text-muted`), không dùng màu series.
- **KPI tile** gồm `label` · `value` và `delta` cùng một dòng (delta có dấu, giá: %, lợi suất/spread: bp; màu = hướng × "tăng là tốt hay xấu", ví dụ VIX tăng = `--down`) · sparkline 30 ngày giãn hết bề rộng thẻ · **thanh biên độ 1 năm** (`RangeBar`: nhãn "1N"/"1Y", thấp và cao 1 năm, chấm `--s1` ở vị trí hiện tại, cùng màu chấm cuối sparkline) · trạng thái ngưỡng (chấm + nhãn "Lưu ý"/"Nguy hiểm", viền `warning`/`critical`). Thanh biên độ chỉ hiện khi lịch sử dài ≥ 300 ngày (`yearRange` trong `lib/data/series.ts`); CPI dùng 12 tháng YoY gần nhất.
- **Dải ngưỡng** (panel Căng thẳng): `ReferenceArea` màu `--warning` (từ `warn` tới `crit`) và `--critical` (vượt `crit`), 10% opacity, `ifOverflow="hidden"`; dải mở được cho cạnh xa tính từ dữ liệu, vì Recharts hiểu cạnh bỏ trống là đáy trục. Đường `warn` màu `--warning`. Chú thích dưới panel ghi tên hai dải bằng chữ.
- **Chế độ xem bảng:** mọi `LineChart`/`DumbbellChart` có nút "Bảng"/"Biểu đồ".

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

- MapLibre GL qua `react-map-gl/maplibre`, tile vector OpenFreeMap (không cần key): style `positron` khi sáng, `dark` khi tối, theo `useTheme()`. `styleDiffing={false}` để đổi theme là tải lại style đầy đủ (phát `style.load`).
- **Hai phép chiếu**, nút "Quả cầu | Phẳng" (lưu `localStorage["map-projection"]`, đọc qua `useSyncExternalStore`, server luôn render quả cầu). Phép chiếu **không** truyền qua prop `projection` của react-map-gl: prop này gọi `setProjection` ngay khi đổi, và MapLibre ném "Style is not done loading" nếu style chưa tải xong (xảy ra ngay sau hydrate khi đã lưu "Phẳng", hoặc khi bấm nút lúc đang đổi theme). `trySetProjection` áp nó trong `onLoad`, sau mỗi `style.load` (đổi theme làm mất phép chiếu), và khi nút được bấm; nếu style chưa sẵn sàng thì đợi `style.load`.
  - **Quả cầu** (mặc định): `projection="globe"`, khí quyển qua `sky.atmosphere-blend` (tắt dần từ zoom 4 tới 6), nền ngoài quả cầu là lớp CSS `.wh-space` (bầu trời nhạt ở theme sáng, nền sâu có sao ở theme tối; canvas trong suốt ngoài quả cầu). Mở ở Đông Nam Á (kinh độ 105), zoom tính theo chiều thấp của khung (`globeZoom`). **Tự xoay** 2°/giây theo chiều Trái Đất thật (kinh độ tâm giảm) bằng `requestAnimationFrame` + `jumpTo`; dừng khi con trỏ trong bản đồ (chạy lại sau 3 giây kể từ khi rời), khi đang chọn một sự kiện, khi zoom > 3, khi panel ra khỏi màn hình (`IntersectionObserver`), khi tab ẩn, và không bao giờ chạy khi `prefers-reduced-motion`.
  - **Phẳng**: Mercator, `renderWorldCopies={false}`. Chỉ tắt world copies ở chế độ phẳng: lúc khởi tạo nó kẹp tâm vào một bề rộng thế giới, làm quả cầu mở sai kinh độ.
- **Nhãn nền gọn:** khi style tải xong (`tuneLabels`), mọi lớp chữ chỉ hiện một ngôn ngữ (`name:vi` → `name:en` → `name` ở trang vi; `name:en` → `name` ở trang en) thay vì "Latin\nchữ bản địa", và chỉ tên quốc gia hiện ở mọi mức zoom; thành phố, biển, đường chỉ hiện từ zoom 3.
- **Worker của MapLibre:** MapLibre 6 tìm file worker qua `import.meta.url`, cách này hỏng khi bundle bằng Turbopack ("Worker failed to load"). `scripts/copy-maplibre-worker.mjs` (chạy qua hook `predev`/`prebuild`) chép `maplibre-gl-worker.mjs` vào `public/vendor/`, và `MapView` gọi `setWorkerUrl("/vendor/maplibre-gl-worker.mjs")`. Xem [HLDD ADR-09](../HLDD/HLDD.md#adr-09--tự-phục-vụ-worker-của-maplibre).
- **Tối đa 3 màu phân loại** (bản đồ là ngữ cảnh "all-pairs" nên chỉ 3 slot đầu đạt chuẩn):
  - `quake` (`--s1`): `type = earthquake` (USGS, GDACS EQ, EONET);
  - `hazard` (`--s2`): cyclone, flood, drought, volcano, wildfire, storm, tsunami, landslide, heat;
  - `news` (`--s3`): điểm nóng GDELT (conflict, protest).
- **Hai source GeoJSON:**
  - `news`: điểm nóng GDELT. Ở zoom thấp là các **đốm sáng**, **một hue `--s3`**: quầng `circle-blur: 1` cỡ theo `severity` (số lần GDELT nhắc tới) và một lõi nhỏ là bậc sáng hơn (theme tối) hoặc đậm hơn (theme sáng) của cùng hue. Chỗ nhiều điểm thì quầng chồng lên nhau sáng hơn, nên mật độ vẫn đọc là độ lớn. Không dùng lớp `heatmap`: trên quả cầu, điểm mạnh bị bão hoà thành ô vuông. Từ zoom 3,5 (`NEWS_POINTS_ZOOM`) đốm sáng mờ dần và hiện chấm rê chuột được.
  - `events`: động đất và thiên tai luôn là chấm. `circle-sort-key` đưa cảnh báo đỏ/cam và trận động đất mạnh lên trên, để chúng không bị các chấm yếu che.
- Bán kính: động đất theo độ lớn (4,5 → 4px, 8 → 13px), các loại khác theo `level`. **Mức cảnh báo là vòng viền** màu trạng thái (`red` → `--critical`, `orange` → `--serious`), có chú giải "Cảnh báo cam/đỏ".
- **Độ cũ:** `age` (giờ, tính từ sự kiện mới nhất nên không cần đồng hồ) làm mờ động đất/thiên tai: 0,95 → 0,85 sau 24 giờ → 0,5 sau 7 ngày → 0,3 sau 14 ngày. Cảnh báo đỏ/cam không mờ. Chú giải ghi "Càng mờ càng cũ".
- **Quầng nhấp nháy:** các sự kiện trong `topAlerts` có thêm `Marker` HTML với hai vòng CSS (`.map-pulse`) nở ra lệch pha, màu theo mức cảnh báo (hoặc màu nhóm cho động đất M6+). `opacityWhenCovered={0}` ẩn chúng ở mặt khuất của quả cầu; `pointer-events: none` để rê chuột vẫn trúng lớp chấm. Khi `prefers-reduced-motion` thì là một vòng tĩnh.
- **Khung nhìn ban đầu (phẳng):** `bounds` kinh độ −170…180, vĩ độ −50…72, tự khớp theo kích thước panel. Có nút +/− (`NavigationControl`).
- **Cột "Cảnh báo & động đất lớn"** (`topAlerts`, tối đa 6): cảnh báo đỏ, rồi cam, rồi động đất từ M6 trở lên, mạnh trước. Điểm nóng GDELT không vào danh sách, vì số lần nhắc quá nhiễu để xếp hạng. Mỗi dòng ghi nhãn mức cảnh báo bằng chữ, không chỉ dựa vào màu viền. Bấm vào thì bản đồ `flyTo` tới vị trí đó (zoom ≥ 4,5) và giữ popup. "Toàn cầu" quay về khung nhìn ban đầu của phép chiếu đang dùng và cho quả cầu xoay lại. Khi bật `prefers-reduced-motion` thì chuyển ngay, không có hiệu ứng bay. Ở `lg` cột nằm bên phải bản đồ, nhỏ hơn thì nằm bên dưới.
- Hàng chip lọc theo nhóm (kèm số lượng) phía trên bản đồ, áp dụng cho cả cột cảnh báo. Nút "Danh sách" chuyển sang bảng sự kiện (tương đương chế độ xem bảng).
- Rê chuột hiện popup (chấm màu nhóm, tiêu đề theo locale, mức cảnh báo, thời gian); click mở link nguồn, click chỗ trống thì bỏ chọn. Popup, nút +/− và dòng bản quyền dùng token của dashboard (`.wh-map …` trong `globals.css`), nên theme tối không còn hộp trắng.

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
