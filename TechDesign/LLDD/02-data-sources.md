# LLDD 02 — Data sources

> Phiên bản 0.3 · Ngày 2026-10-31 · Trạng thái: Đã triển khai
> Liên quan: [HLDD](../HLDD/HLDD.md) · [01 Database schema](01-database-schema.md) · [03 Worker và framework nguồn](03-worker-and-sources-framework.md) · [05 AI pipeline](05-ai-pipeline.md)
> Mã nguồn: `lib/sources/<id>.ts`, `lib/ai/{translate,brief}.ts`, `config/{sources,series,feeds,countries,cities,fomc}.ts`

Mọi endpoint dưới đây đã được kiểm chứng thực tế ngày 2026-10-31 từ máy phát triển. Tất cả đều **không cần API key**, trừ hai nguồn AI cần `AI_API_KEY` (Gemini hoặc Claude, xem [LLDD 05](05-ai-pipeline.md)). Phản hồi JSON luôn được kiểm bằng zod (`fetchJson`); sai định dạng thì lần chạy thất bại và ghi vào `source_status`, không ghi dữ liệu rác.

## 1. Tổng quan

| Id | Nhóm | Endpoint chính | Chu kỳ | Đích lưu |
|---|---|---|---|---|
| `yahoo` | Thị trường | `yahoo-finance2` (`quote`, `chart`) | 3 phút (lịch sử: 1 giờ) | `quotes`, `observations` `yahoo:<symbol>` |
| `fred` | Vĩ mô Mỹ | `fred.stlouisfed.org/graph/fredgraph.csv` | 6 giờ | `observations` `fred:<code>` |
| `imf` | Vĩ mô thế giới | IMF DataMapper API v1 | 24 giờ | `observations` `imf:<ind>:<iso3>` |
| `bis` | Lãi suất điều hành | BIS SDMX `WS_CBPOL` | 12 giờ | `observations` `bis:<area>` |
| `gpr` | Rủi ro địa chính trị | `data_gpr_daily_recent.xls` | 24 giờ | `observations` `gpr:GPRD`, `gpr:GPRD_MA7` |
| `gscpi` | Chuỗi cung ứng | NY Fed GSCPI CSV | 24 giờ | `observations` `nyfed:GSCPI` |
| `rss` | Tin tức | 18 feed (`config/feeds.ts`), 5 trong đó là báo crypto | 10 phút | `articles` |
| `translate` | AI | Gemini hoặc Claude (tier `fast`) | 5 phút | cột `title_*`, `region`, `topic` |
| `brief` | AI | Gemini hoặc Claude (tier `brief`) | hằng ngày 06:00 VN | `briefs` |
| `usgs` | Bản đồ | USGS GeoJSON `4.5_week` | 10 phút | `events` (`earthquake`) |
| `gdacs` | Bản đồ | GDACS `geteventlist/SEARCH` | 30 phút | `events` |
| `eonet` | Bản đồ | NASA EONET v3 | 1 giờ | `events` |
| `gdelt` | Bản đồ | GDELT 2.0 events export (ZIP) | 15 phút | `events` (`conflict`, `protest`) |
| `wikipedia` | Xu hướng | Wikimedia top pageviews | 3 giờ | `items` `wiki_en`, `wiki_vi` |
| `hackernews` | Xu hướng | HN Algolia `front_page` | 20 phút | `items` `hn` |
| `calendar` | Lịch | ForexFactory this-week JSON | 3 giờ | `items` `calendar` |
| `launches` | Lịch | Launch Library 2 `2.3.0` | 3 giờ | `items` `launch` |
| `polymarket` | Dự đoán | Polymarket Gamma `events` | 15 phút | `items` `polymarket`, `polymarket_crypto` |
| `kalshi` | Dự đoán | Kalshi trade-api v2 (`KXFED`) | 15 phút | `items` `kalshi_fed` |
| `co2` | Môi trường | NOAA GML Mauna Loa CSV | 24 giờ | `observations` `noaa:co2`, `noaa:co2:monthly` |
| `gistemp` | Môi trường | NASA GISTEMP v4 CSV | 24 giờ | `observations` `giss:global` |
| `airquality` | Môi trường | Open-Meteo Air Quality | 1 giờ | `items` `airquality` |
| `who` | Sức khỏe | WHO Disease Outbreak News API | 6 giờ | `items` `who` |
| `vnindex` | Việt Nam | SSI iBoard | 3 phút | `quotes`, `observations` `vn:VNINDEX`, `items` `vn_breadth` |
| `sjc` | Việt Nam | vang.today (dự phòng: PNJ) | 30 phút | `items` `gold_vn`, `observations` `goldvn:<code>:sell` |
| `vcb` | Việt Nam | Vietcombank exchange-rates JSON | 1 giờ | `items` `vcb`, `observations` `vcb:USD:sell` |
| `coingecko` | Crypto | CoinGecko `global`, `coins/markets`, `search/trending` | 5 phút | `quotes`/`observations` `cg:*`, `items` `crypto_global`, `crypto_top`, `crypto_trending` |
| `fng` | Crypto | alternative.me Fear & Greed | 1 giờ | `observations` `fng:crypto`, `items` `crypto_fng` |
| `deribit` | Crypto | Deribit DVOL (BTC) | 1 giờ | `observations` `deribit:DVOL-BTC` |
| `defillama` | Crypto | DefiLlama stablecoin charts | 6 giờ | `observations` `llama:stablecoins` |
| `mempool` | Crypto | mempool.space | 10 phút | `items` `btc_network` |
| `binance` | Crypto | Binance USDⓈ-M futures + P2P | 15 phút | `items` `crypto_perps`, `usdt_p2p`, `observations` `binance:USDTVND` |

Chu kỳ khai báo trong `config/sources.ts` (`SOURCE_META`). Lịch FOMC không lấy từ API mà đặt trong `config/fomc.ts` (§5.2).

## 2. Thị trường và vĩ mô

### 2.1 `yahoo` — Yahoo Finance (`lib/sources/yahoo.ts`)
- **Thư viện:** `yahoo-finance2` 4.0.5, khởi tạo `new YahooFinance({ suppressNotices: ["yahooSurvey"] })`.
- **Mã:** lấy từ `YAHOO_SYMBOLS` trong `config/series.ts`: `^GSPC`, `^IXIC`, `^TNX`, `DX-Y.NYB`, `^VIX`, `BZ=F`, `GC=F`, `HG=F`, `BTC-USD`, `USDVND=X`, `^MOVE`.
- **Giá:** gọi `quote(symbols, { return: "array" })` một lần cho tất cả mã. Các trường dùng:
  - `regularMarketPrice`, `regularMarketChange`
  - `regularMarketChangePercent` (đã ở đơn vị %)
  - `regularMarketTime` (kiểu `Date`), `marketState`
  - Kết quả ghi vào `quotes`.
- **Lịch sử:** gọi `chart(symbol, { period1, interval: "1d" })`, **tối đa 1 lần/giờ** (mốc thời gian lưu ở `kv['yahoo:history']`).
  - Mã có dưới 200 điểm thì backfill 430 ngày (để z-score 1 năm của Risk Regime đủ dữ liệu); các lần sau chỉ lấy 10 ngày.
  - Ngày của mỗi nến tính theo `meta.exchangeTimezoneName` để sàn châu Á không bị lệch một ngày.
- **Lưu ý:**
  - Mã không tồn tại bị bỏ qua mà không báo lỗi; worker log `no quote for: …`.
  - `close` có thể là `null` (ví dụ `^MOVE`, `BTC-USD`), nên phải lọc.
  - `^TNX` là lợi suất tính bằng %, không phải ×10.
  - Yahoo chỉ có giá hiện tại của `^VNINDEX.VN`, không có lịch sử, vì vậy VN-Index lấy từ SSI.

### 2.2 `fred` — FRED, không cần key (`lib/sources/fred.ts`)
- **URL:** `https://fred.stlouisfed.org/graph/fredgraph.csv?id=<CODE>&cosd=<YYYY-MM-DD>`, lấy 3 năm gần nhất.
- **Mã:** lấy từ `FRED_CODES`:
  - Các series trong `config/series.ts`: `T10Y2Y`, `DGS2`, `BAMLH0A0HYM2`, `STLFSI4`, `ICSA`, `SAHMREALTIME`, `GDPNOW`, `WALCL`, `T5YIFR`, `CPIAUCSL`, `FEDFUNDS`, `USEPUINDXD`.
  - Các kỳ hạn của đường cong lợi suất: `DGS1MO` … `DGS30`.
- **CSV:** header là `observation_date,<CODE>`; giá trị thiếu là ô rỗng (bản cũ dùng `.`, cả hai đều bị bỏ qua).
- **Cách gọi:** mỗi mã 1 request, cách nhau 300 ms. Nguồn chỉ FAIL khi hơn một nửa số mã lỗi.
- **Lưu ý:**
  - API JSON (`api.stlouisfed.org`) bắt buộc có key, trả 400 *"api_key is not set"*. Bản CSV công khai thì không cần.
  - Có thể gộp nhiều mã vào một request (`id=A,B&cosd=d1,d2`), nhưng nếu các mã **khác tần suất** thì FRED trả về **ZIP** chứ không phải CSV. Vì vậy ta gọi từng mã.

### 2.3 `imf` — IMF DataMapper (`lib/sources/imf.ts`)
- **URL:** `https://www.imf.org/external/datamapper/api/v1/<IND>` với `IND` là `PCPIPCH` (lạm phát) hoặc `NGDP_RPCH` (tăng trưởng GDP thực).
- **Định dạng:** `values[IND][ISO3][year] = number | null`; có cả giá trị dự báo đến 2031. Một số nền kinh tế trả `null` thay vì bảng năm.
- **Lưu:** các quốc gia trong `config/countries.ts` (USA, EURO, JPN, GBR, CHN, IND, BRA, KOR, VNM), từ năm 2010, vào series `imf:<IND>:<ISO3>`, mỗi năm một điểm tại `ts = 1/1`.
- **Lưu ý:** API **bỏ qua bộ lọc quốc gia** và luôn trả về khoảng 228 nền kinh tế (~120 KB), nên phải tự lọc. Khu vực euro có mã `EURO`.

### 2.4 `bis` — Lãi suất điều hành (`lib/sources/bis.ts`)
- **URL:** `https://stats.bis.org/api/v1/data/WS_CBPOL/D.US+XM+JP+GB+CN+IN+BR+KR?lastNObservations=400&format=csv&detail=dataonly`
- **CSV:** cột `FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE`. Kết quả lưu vào series `bis:<area>`.
- **Lưu ý:**
  - Thiếu `detail=dataonly` thì CSV có thêm nhiều cột văn bản dài.
  - **BIS không có Việt Nam**: gọi `VN` trả lỗi SDMX "No data". UI hiển thị "—" kèm chú thích.

### 2.5 `gpr` — Geopolitical Risk Index (`lib/sources/gpr.ts`)
- **URL:** `https://www.matteoiacoviello.com/gpr_files/data_gpr_daily_recent.xls` (~3,3 MB). Đây là file BIFF `.xls` thật; bản `.xlsx`/`.csv` trả 404.
- **Cách đọc:** dùng thư viện `xlsx` (SheetJS 0.20.3, cài từ `cdn.sheetjs.com`).
  - Đọc Sheet1, cột `DAY` (chuỗi `YYYYMMDD`), `GPRD` và `GPRD_MA7`.
  - Giữ 3 năm, lưu vào `gpr:GPRD` và `gpr:GPRD_MA7`.

### 2.6 `gscpi` — NY Fed Global Supply Chain Pressure Index (`lib/sources/gscpi.ts`)
- **URL:** `https://www.newyorkfed.org/medialibrary/research/interactives/data/gscpi/gscpi_interactive_data.csv`
- **Định dạng:** mỗi dòng là một tháng (`30-Sep-2026`), mỗi cột là một lần công bố (vintage). Ta lấy **cột không rỗng cuối cùng**.
  - `#N/A` và các dòng `,,,` trống bị bỏ qua.
  - Giữ dữ liệu từ 2015, lưu vào `nyfed:GSCPI`.
- **Lưu ý:** file `gscpi_data.xlsx` thực chất là BIFF `.xls`, nên dùng file CSV cho đơn giản.

## 3. Tin tức và AI

### 3.1 `rss` — Feed tin tức (`lib/sources/rss.ts`, `config/feeds.ts`)
- **Feed:**
  - BBC World và Business, Guardian World, Al Jazeera, DW (`rss.dw.com/xml/rss-en-all`), France 24, NPR World
  - CNBC World và Economy, SCMP Asia
  - VnExpress Thế giới, Kinh doanh, Thời sự
  - Crypto: CoinDesk, Cointelegraph, The Block, Decrypt, Coin68 (xem §8.7)
- **Cách chạy:** dùng `rss-parser`, các feed chạy song song.
  - Chỉ lấy bài trong 3 ngày gần nhất; xóa bài cũ hơn 14 ngày.
  - `id = sha1(URL đã chuẩn hóa)`, trong đó URL đã bỏ `utm_*`, `at_*` và hash.
  - `title_key` là tiêu đề đã bỏ dấu và ký tự đặc biệt, dùng để gộp cùng một câu chuyện từ nhiều báo.
- **Ảnh minh họa:** lấy theo thứ tự `media:content` → `media:thumbnail` → `enclosure`.
- **Lỗi:** feed lỗi được log lại; nguồn chỉ FAIL khi **mọi** feed đều lỗi.
- **Đã kiểm tra nhưng không dùng:**
  - AP: tất cả feed trả 403.
  - NHK: RSS cũ đã ngừng cập nhật. API thay thế `api.nhkworld.jp/nwapi/news/v1/en/articles` hoạt động nhưng chưa tích hợp.
  - Nikkei Asia: không có ngày đăng.
  - Tuổi Trẻ: `pubDate` không có múi giờ.

### 3.2 `translate` và `brief` — AI provider (Gemini / Claude)
Xem chi tiết ở [LLDD 05](05-ai-pipeline.md). Tóm tắt:
- **`translate`:** chạy mỗi 5 phút với model tier `fast` (mặc định `gemini-flash-lite-latest`, hoặc `claude-haiku-5-5` nếu dùng Claude).
  - Bài báo: gửi theo lô 40, tối đa 4 lô mỗi lần chạy. Model dịch `title_en`/`title_vi` và gắn `region`/`topic`.
  - Còn dịch `events.title_vi` và `items.title_vi` cho các kind `polymarket` và `who`.
- **`brief`:** dùng model tier `brief` (mặc định `gemini-flash-latest`, hoặc `claude-sonnet-5-5` kèm `fallbacks: "default"`); viết mỗi ngày sau 06:00 giờ VN hoặc khi người dùng yêu cầu viết lại.
- **Biến môi trường:** `AI_PROVIDER`, `AI_API_KEY` (cũng nhận `GEMINI_API_KEY`/`GOOGLE_API_KEY`/`ANTHROPIC_API_KEY`), tùy chọn `AI_MODEL_BRIEF`/`AI_MODEL_FAST`. Hai nguồn khai báo `needsAi: true`; chưa cấu hình thì worker bỏ qua (`skip`) và in lý do.
- **Endpoint Gemini:** `generativelanguage.googleapis.com` (key Google AI Studio). Endpoint Vertex không dùng: key thử nghiệm trả 403.

## 4. Bản đồ

### 4.1 `usgs` (`lib/sources/usgs.ts`)
- **URL:** `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson`
- **Trường:**
  - `geometry.coordinates = [lon, lat, depth]`
  - `properties.mag`, `place`, `time` (ms), `alert`, `tsunami`
- **Ánh xạ cảnh báo:** PAGER `yellow`/`orange` → `orange`, `red` → `red`.

### 4.2 `gdacs` (`lib/sources/gdacs.ts`)
- **URL:** `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=…&fromdate=…&todate=…[&alertlevel=…]`. Gọi 2 lần rồi gộp theo `eventtype:eventid`:
  1. `TC;FL;VO;DR;WF;EQ`, chỉ mức `Orange;Red`, trong 30 ngày.
  2. `TC;FL;VO`, mọi mức cảnh báo, trong 7 ngày.
- **Ánh xạ loại sự kiện:** TC → `cyclone`, FL → `flood`, VO → `volcano`, DR → `drought`, WF → `wildfire`, EQ → `earthquake`.
- **Trường lưu:**
  - `level` = `alertlevel` viết thường
  - `severity` = `alertscore`
  - `url` = `properties.url.report`
- **Lưu ý:**
  - Chỉ lấy feature dạng Point.
  - Không lọc theo mức cảnh báo thì cháy rừng (WF) chiếm gần hết kết quả.
  - Tên sự kiện hạn hán liệt kê hàng chục nước, nên được cắt còn khoảng 90 ký tự.
  - Mỗi trang tối đa 100 kết quả.

### 4.3 `eonet` (`lib/sources/eonet.ts`)
- **URL:** `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30`. Header ghi `application/rss+xml` nhưng nội dung là JSON.
- **Ánh xạ loại:**
  - wildfires → `wildfire`, severeStorms → `storm`, volcanoes → `volcano`, floods → `flood`
  - drought → `drought`, landslides → `landslide`, tempExtremes → `heat`, earthquakes → `earthquake`
  - Bỏ qua seaLakeIce, snow, waterColor, manmade, dustHaze.
- **Vị trí:** bão có nhiều điểm (quỹ đạo); ta lấy **điểm cuối cùng**.

### 4.4 `gdelt` — Điểm nóng xung đột và biểu tình (`lib/sources/gdelt.ts`)
- **Đầu vào:**
  - `http://data.gdeltproject.org/gdeltv2/lastupdate.txt` (theo redirect sang https). Dòng chứa `…export.CSV.zip` là file mới nhất, cập nhật mỗi 15 phút.
  - ZIP được giải nén bằng `zlib.inflateRawSync`: tự đọc End-of-Central-Directory, không thêm thư viện.
  - Bên trong là TSV 61 cột, không có header.
- **Cột dùng (đánh số từ 0):**
  - 28 `EventRootCode`, 31 `NumMentions`
  - 52 `ActionGeo_FullName`, 56 `Lat`, 57 `Long`
  - 60 `SOURCEURL`
- **Lọc:** chỉ giữ `EventRootCode` ∈ {14 Biểu tình, 18 Tấn công, 19 Giao tranh, 20 Bạo lực quy mô lớn}.
- **Gom nhóm:**
  - Gộp theo ô lưới 1° (`round(lat):round(lng)`), cộng `NumMentions`.
  - Giữ tên địa điểm, mã gốc và URL của sự kiện được nhắc nhiều nhất trong ô.
  - Lấy 60 ô có nhiều lượt nhắc nhất.
- **Ghi:** upsert `events` với id `gdelt:<lat>:<lng>`, `type` = `protest` (mã 14) hoặc `conflict`, `severity` = tổng lượt nhắc. `title_vi` được ghi sẵn nên không cần qua bước dịch. Ô cũ hơn 24 giờ bị xóa.
- **Lưu ý:**
  - DOC API 2.0 luôn trả 429 từ máy này; GEO API 2.0 đã chết (404).
  - Dữ liệu GDELT nhiễu: địa danh có thể bị gán sai, URL có thể là bài không liên quan. Vì vậy UI coi đây là "tín hiệu", không phải sự kiện đã kiểm chứng.

## 5. Xu hướng, lịch, thị trường dự đoán

### 5.1 `wikipedia` (`lib/sources/wikipedia.ts`)
- **URL:** `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/{en|vi}.wikipedia/all-access/YYYY/MM/DD`
  - Lấy ngày hôm qua theo UTC; nếu 404 thì lùi thêm 1 ngày.
  - **Bắt buộc User-Agent** (helper `http.ts` luôn gửi).
- **Lọc:**
  - Bỏ `Main_Page`/`Trang_Chính` và các tiền tố namespace (`Special:`, `Wikipedia:`, `File:`, `Đặc_biệt:`, `Tập_tin:`, `Thể_loại:`…), chỉ so khớp đầu chuỗi vì tiêu đề thật có thể chứa dấu `:`.
  - Bỏ tiêu đề bắt đầu bằng `.` (nhiễu từ bot).
- **Lưu:** 15 bài mỗi ngôn ngữ, kind `wiki_en` / `wiki_vi`, `data = { views }`.
- **Lưu ý:** top của vi.wikipedia có thể lẫn bài bị bot đẩy lượt xem; hiện chưa lọc nội dung.

### 5.2 `calendar` (`lib/sources/calendar.ts`, `config/fomc.ts`)
- **URL:** `https://nfs.faireconomy.media/ff_calendar_thisweek.json`, gồm các trường `title, country` (mã tiền tệ), `date` (ISO có múi giờ), `impact, forecast, previous`.
  - Không có trường `actual`.
  - Chỉ có tuần hiện tại (`nextweek.json` trả 404).
  - Nên gọi tối đa 1 lần/giờ.
- **Lọc:** giữ `impact = High` của mọi nước, và `Medium` của USD/CNY/EUR; chỉ lấy sự kiện từ 6 giờ trước trở đi.
- **Lưu:** kind `calendar`, `data = { country, impact, forecast, previous }`.
- **Lưu ý:** cuối tuần (thứ Bảy) danh sách thường rỗng cho tới khi tuần mới được đăng.
- **FOMC:** đặt cứng trong `config/fomc.ts` (`FOMC_MEETINGS`), lấy từ federalreserve.gov. Danh sách tính tới hết 2027; cần cập nhật khi Fed công bố năm mới. UI tự gộp FOMC vào lịch.

### 5.3 `launches` (`lib/sources/launches.ts`)
- **URL:** `https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=12`. **Giới hạn 15 request/giờ**, nên chu kỳ là 3 giờ.
- **Lọc:** bỏ trạng thái `Success`, `In Flight`, `Failure`, `Partial Failure` (danh sách "upcoming" vẫn chứa các vụ vừa phóng). Giữ 8 vụ.
- **Lưu:** kind `launch`, `data = { provider, rocket, mission, orbit, pad, country, status, precision, image, webcast }`. Trường `image` là object (`thumbnail_url`/`image_url`).

### 5.4 `polymarket` (`lib/sources/polymarket.ts`)
- **URL:** `https://gamma-api.polymarket.com/events?tag_slug={geopolitics|economy}&active=true&closed=false&order=volume24hr&ascending=false&limit=15`
- **Lưu ý:** **không gọi khi chưa lọc theo tag**. Danh sách không lọc nặng khoảng 19 MB vì lồng hàng trăm market thể thao.
- **Xử lý:**
  - Chỉ dùng market đang mở (`closed === false`).
  - `outcomes`/`outcomePrices` là **chuỗi JSON**, phải `JSON.parse`.
  - Event chỉ có 1 market: lấy xác suất "Yes".
  - Event có nhiều market: mỗi market lấy `groupItemTitle` cùng giá Yes, sắp xếp giảm dần, giữ 4.
- **Lưu:** 12 event có `volume24hr` lớn nhất, kind `polymarket`, `data = { tag, volume24hr, outcomes: [{ label, prob, change24h }] }`.

### 5.5 `kalshi` (`lib/sources/kalshi.ts`)
- **Base URL:** `https://api.elections.kalshi.com/trade-api/v2`. Gọi 2 bước:
  1. `/events?series_ticker=KXFED&status=open`, chọn event có `strike_date` gần nhất trong tương lai.
  2. `/markets?event_ticker=<event>&limit=100`.
- **Lưu:** kind `kalshi_fed`, `title = yes_sub_title` (ví dụ "Above 3.75%"), `data = { prob, strike, eventTitle, eventTicker }`.
  - `prob` lấy từ `last_price_dollars`, nếu không có thì `yes_bid_dollars`. Đây là **chuỗi** như `"0.9900"`; các trường số cũ đều `null`.
  - `strike` được tách từ hậu tố `-T<x>` của ticker.

### 5.6 `hackernews` (`lib/sources/hackernews.ts`)
- **URL:** `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30`. Một request thay cho 30 request Firebase.
- **Xử lý:** kết quả không theo thứ hạng HN, nên ta sắp theo `points` và giữ 15.
- **Lưu:** kind `hn`, `data = { points, comments, hnUrl }`.

## 6. Môi trường và sức khỏe

### 6.1 `co2` (`lib/sources/co2.ts`)
- **Bản ngày:** `https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_daily_mlo.csv`.
  - Bắt đầu bằng các dòng `#` và **không có header**; cột là `year,month,day,decimal,ppm`.
  - Lưu 2 năm vào `noaa:co2`.
- **Bản tháng:** `co2_mm_mlo.csv` có header, lấy cột `average`.
  - Lưu 10 năm vào `noaa:co2:monthly`.
- **Giá trị thiếu:** `-999.99`, bị bỏ qua.

### 6.2 `gistemp` (`lib/sources/gistemp.ts`)
- **URL:** `https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv`.
- **Định dạng:** dòng 1 là tiêu đề, dòng 2 là header `Year,Jan…Dec,…`; giá trị thiếu là `***`.
- **Lưu:** dị thường nhiệt độ toàn cầu (°C so với 1951–1980) theo tháng, từ 1990, vào `giss:global`.

### 6.3 `airquality` (`lib/sources/airquality.ts`, `config/cities.ts`)
- **URL:** `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=<…>&longitude=<…>&current=us_aqi,pm2_5,pm10&timezone=GMT`
  - Một request cho cả 10 thành phố; kết quả là **mảng theo đúng thứ tự đầu vào**.
  - Dùng `timezone=GMT` để mọi thành phố cùng mốc giờ.
- **Lưu:** kind `airquality`, `data = { aqi, pm25, pm10 }`, `title_vi` lấy từ `config/cities.ts`.
- **Lưu ý:** OpenAQ v3 giờ bắt buộc key (trả 401), nên dùng Open-Meteo.

### 6.4 `who` (`lib/sources/who.ts`)
- **URL:** `https://www.who.int/api/news/diseaseoutbreaknews?$select=Title,OverrideTitle,UseOverrideTitle,PublicationDateAndTime,UrlName,DonId&$orderby=PublicationDateAndTime%20desc&$top=8`
  - **Bắt buộc `$orderby`**, vì mặc định API trả bài cũ nhất (từ 2006) trước.
  - `$select` giảm phản hồi từ 278 KB xuống 3 KB.
  - RSS cũ đã trả 404.
- **Tiêu đề:** dùng `OverrideTitle` nếu `UseOverrideTitle` là true.
- **URL bài:** `https://www.who.int/emergencies/disease-outbreak-news/item/<UrlName>`.

## 7. Việt Nam

### 7.1 `vnindex` — SSI iBoard (`lib/sources/vnindex.ts`)
- **Giá hiện tại:** `https://iboard-query.ssi.com.vn/exchange-index/VNINDEX?hasHistory=false`.
  - Trường `data.indexValue`, `change`, `changePercent`, `time` → ghi vào `quotes`.
  - Trường `advances`, `declines`, `nochanges`, `totalValue` → ghi vào kind `vn_breadth`.
- **Lịch sử:** `https://iboard-api.ssi.com.vn/statistics/charts/history?resolution=1D&symbol=VNINDEX&from=<unix>&to=<unix>` trả các mảng `t` (giây) và `c`.
  - Có dưới 200 điểm thì backfill 430 ngày.
- **Dự phòng (chưa tích hợp):**
  - DNSE: `services.entrade.com.vn/chart-api/v2/ohlcs/index`
  - VNDirect: `api-finfo.vndirect.com.vn/v4/vnmarket_prices`
  - TCBS không dùng được vì bị Cloudflare chặn.

### 7.2 `sjc` — Giá vàng (`lib/sources/sjc.ts`)
- **Lưu ý:** `sjc.com.vn` (cả `PriceService.ashx` và `/xml/tygiavang.xml`) trả **403 Cloudflare challenge**, nên không gọi trực tiếp được.
- **Chính: `https://www.vang.today/api/prices`.**
  - Trả `prices[CODE] = { name, buy, sell, change_buy, change_sell }`, đơn vị VND/lượng.
  - Ta lấy các mã `SJL1L10` (vàng miếng SJC), `SJ9999` (nhẫn SJC), `DOHNL`, `BTSJC`.
- **Dự phòng: `https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00`.**
  - Trả `data[].{ masp, tensp, giaban, giamua }`, đơn vị **nghìn VND/chỉ**, nên nhân 10 000 để ra VND/lượng.
- **Lưu:**
  - kind `gold_vn` với `data = { code, name, buy, sell, changeSell, source }`.
  - Series `goldvn:<code>:sell`, mỗi giờ một điểm.

### 7.3 `vcb` — Vietcombank (`lib/sources/vcb.ts`)
- **URL:** `https://www.vietcombank.com.vn/api/exchangerates?date=YYYY-MM-DD` (ngày theo giờ VN).
  - Trả `Data[].{ currencyCode, cash, transfer, sell }`; giá trị là chuỗi, có thể chứa dấu phẩy.
- **Lưu:**
  - kind `vcb` cho USD, EUR, JPY, CNY, GBP, KRW, SGD, THB, AUD, với `data = { code, cash, transfer, sell }`.
  - Series `vcb:USD:sell`, mỗi ngày một điểm.
- **Lưu ý:**
  - Bản XML cũ (`portal.vietcombank.com.vn/…/pXML.aspx`) vẫn chạy nhưng yêu cầu tối đa 1 request mỗi 5 phút.
  - Chu kỳ 1 giờ là đủ an toàn.

## 8. Crypto

Trang `/[lang]/crypto` đọc các nguồn dưới đây. Không nguồn nào cần key. Các chuỗi đều nằm trong `SERIES` (`config/series.ts`), nên tự có tile, hộp thoại lịch sử, watchlist, quy tắc "Điểm đáng chú ý" và ghi chú AI. Chuỗi chỉ có một điểm mỗi ngày (vốn hóa, tỷ trọng BTC, USDT/VND) thì điểm của hôm nay được ghi đè ở mỗi lần chạy, nên lịch sử bắt đầu tích lũy từ lần chạy đầu tiên.

### 8.1 `coingecko` (`lib/sources/coingecko.ts`)
- **URL:** `api.coingecko.com/api/v3/global`, `/coins/markets?vs_currency=usd&per_page=40&sparkline=true&price_change_percentage=1h,24h,7d`, `/search/trending`. Ba request mỗi 5 phút, dưới hạn mức keyless.
- **Key tùy chọn:** `COINGECKO_API_KEY` (gói Demo miễn phí) được gửi qua header `x-cg-demo-api-key` khi có. Nên đặt khi chạy trên cloud vì IP dùng chung dễ bị 429.
- **Lọc top coin (`pickTopCoins`):** bỏ stablecoin USD (giá trong ±2% quanh $1 và biến động 7 ngày dưới 2%) và bản wrapped/staked (tên chứa wrapped/bridged/staked/restaked, hoặc id `weth`, `wbtc`, `cbbtc`, `steth`, `wsteth`, `weeth`). Giữ 20, sparkline 7 ngày rút còn ~42 điểm.
- **Lưu:** `quotes` + `observations` `cg:total_mcap` (tỷ USD, quote mang % thay đổi 24h), `observations` `cg:btc_dominance`, `items` `crypto_global`, `crypto_top`, `crypto_trending`. Trending lỗi chỉ ghi log, không làm hỏng phần còn lại.

### 8.2 `fng` (`lib/sources/fng.ts`)
- **URL:** `api.alternative.me/fng/?limit=N` (430 ngày ở lần đầu, sau đó 10).
- **Lưu:** `observations` `fng:crypto`; `items` `crypto_fng` giữ nhãn của số đo mới nhất (Extreme Fear … Extreme Greed, dịch qua `messages/*.json` `crypto.fngLevels`).

### 8.3 `deribit` (`lib/sources/deribit.ts`)
- **URL:** `www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC&resolution=1D` (430 ngày lần đầu). 431 nến trả về trong một lần, không cần phân trang.
- **Lưu:** giá đóng cửa ngày vào `observations` `deribit:DVOL-BTC`.

### 8.4 `defillama` (`lib/sources/defillama.ts`)
- **URL:** `stablecoins.llama.fi/stablecoincharts/all`. Luôn trả toàn bộ lịch sử (khoảng 1,3 MB) nên chạy 6 giờ/lần.
- **Xử lý:** cộng mọi loại peg trong `totalCirculatingUSD` (giống con số tổng trên defillama.com), đổi ra tỷ USD, giữ 430 ngày.
- **Lưu:** `observations` `llama:stablecoins`.

### 8.5 `mempool` (`lib/sources/mempool.ts`)
- **URL:** `mempool.space/api/blocks/tip/height`, `/v1/difficulty-adjustment`, `/v1/fees/recommended`, `/v1/mining/hashrate/1m`.
- **Halving (`halvingInfo`):** mốc kế tiếp là bội số 210.000 khối; thời điểm ước tính theo thời gian khối trung bình của chu kỳ độ khó hiện tại (ngoài khoảng 5–20 phút thì dùng 10 phút).
- **Lưu:** một dòng `items` `btc_network`.

### 8.6 `binance` (`lib/sources/binance.ts`)
- **Hợp đồng vĩnh cửu:** `fapi.binance.com/fapi/v1/premiumIndex?symbol=` và `/futures/data/openInterestHist?period=1h&limit=25` cho BTC, ETH, SOL. Funding quy năm = rate × 3 × 365 (kỳ funding 8 giờ). Lưu `items` `crypto_perps`.
- **P2P USDT/VND (không chính thức):** `POST p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search` với `tradeType` `BUY` (người dùng mua, quảng cáo bán, giá tăng dần) và `SELL`. Lấy trung vị 10 quảng cáo đầu mỗi chiều. Hai chiều có thể chéo nhau vì mỗi quảng cáo có hạn mức và điều kiện riêng. Lưu `items` `usdt_p2p` và `observations` `binance:USDTVND` (giá giữa). Trang so giá mua với giá bán USD của Vietcombank.
- **Chặn theo quốc gia:** Binance trả 451 cho một số nước (có Mỹ). Hai phần chạy độc lập: một phần lỗi thì ghi log, nguồn chỉ FAIL khi cả hai lỗi. Lưu ý khi chọn region để deploy.

### 8.7 Tin và kèo crypto
- **RSS:** CoinDesk, Cointelegraph, The Block, Decrypt, Coin68 (`crypto: true` trong `config/feeds.ts`). Các bài này **không** vào danh sách tin thế giới và đầu vào Brief; trang crypto đọc chúng cùng bài có `topic = crypto` từ các báo khác (`getCryptoNews`). Coin68 dùng `coin68.com/rss/tin-moi-nhat.rss` (`/feed/` trả HTML).
- **Polymarket:** nguồn `polymarket` gọi thêm tag `crypto` (`limit=40`), bỏ kèo kết thúc trong vòng 48 giờ (phần lớn là "BTC lên hay xuống hôm nay"), giữ 8 kèo vào kind `polymarket_crypto`.

## 9. Nguồn đã loại

| Nguồn | Lý do | Thay bằng |
|---|---|---|
| Frankfurter | v1 chỉ có dữ liệu ECB (không có VND); Yahoo đã có tỷ giá | Yahoo `USDVND=X`, Vietcombank |
| World Bank | Rất chậm khi chưa có cache (11–72 giây); IMF đã đủ lạm phát và tăng trưởng, có cả dự báo | IMF DataMapper |
| Reddit | `www.reddit.com` bị chặn ở tầng DNS; `api.reddit.com` 403; `old.reddit.com` bắt đăng nhập; cần OAuth | Wikipedia + Hacker News |
| GDELT DOC 2.0 / GEO 2.0 | DOC luôn trả 429 *"one every 5 seconds"*; GEO trả 404 | GDELT events export |
| OpenAQ v3 | Bắt buộc key (401) | Open-Meteo Air Quality |
| SJC trực tiếp | Cloudflare challenge 403 | vang.today, PNJ |
| TCBS | Cloudflare challenge 403 | SSI |
| AP RSS | 403 | Các feed khác (Google News chỉ dùng cá nhân, chưa tích hợp) |
| FRED JSON API | Cần key | FRED CSV công khai |
| Lịch FRED, BLS ICS | FRED cần key; BLS trả 403 | ForexFactory + `config/fomc.ts` |

## 10. Nhật ký kiểm chứng (2026-10-31)

Kết quả `npm run fetch -- <id>` lần đầu:

| Nguồn | Số dòng |
|---|---|
| `yahoo` | 3419 |
| `fred` | 12190 |
| `imf` | 396 |
| `bis` | 3058 |
| `gpr` | 2180 |
| `gscpi` | 141 |
| `rss` | 406 |
| `usgs` | 173 |
| `vnindex` | 295 |
| `sjc` | 8 |
| `vcb` | 10 |
| `gdacs` | 13 |
| `eonet` | 38 |
| `gdelt` | 24 |
| `wikipedia` | 30 |
| `hackernews` | 15 |
| `calendar` | 0 (thứ Bảy, lịch tuần đã qua) |
| `launches` | 8 |
| `polymarket` | 12 |
| `kalshi` | 11 |
| `co2` | 665 |
| `gistemp` | 441 |
| `airquality` | 10 |
| `who` | 8 |

`translate` và `brief` lúc đó báo `skip` vì chưa cấu hình AI. Sau khi thêm key Gemini (cùng ngày), cả hai đã chạy `ok`: `translate` xử lý 220 mục trong 41 giây; `brief` dùng `gemini-3.8-flash`, mất 2–3 phút. Chi tiết ở [LLDD 05 §6](05-ai-pipeline.md).
