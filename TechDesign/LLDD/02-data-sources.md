# LLDD 02 — Data sources

> Phiên bản 0.3 · Ngày 2026-10-31 · Trạng thái: Đã triển khai
> Liên quan: [HLDD](../HLDD/HLDD.md) · [01 Database schema](01-database-schema.md) · [03 Worker và framework nguồn](03-worker-and-sources-framework.md) · [05 AI pipeline](05-ai-pipeline.md)
> Mã nguồn: `lib/sources/<id>.ts`, `lib/ai/{translate,brief}.ts`, `config/{sources,series,feeds,countries,macro,cities,fomc}.ts`

Mọi endpoint dưới đây đã được kiểm chứng thực tế ngày 2026-10-31 từ máy phát triển. Tất cả đều **không cần API key**, trừ hai nguồn AI cần `AI_API_KEY` (Gemini hoặc Claude, xem [LLDD 05](05-ai-pipeline.md)). Phản hồi JSON luôn được kiểm bằng zod (`fetchJson`); sai định dạng thì lần chạy thất bại và ghi vào `source_status`, không ghi dữ liệu rác.

## 1. Tổng quan

| Id | Nhóm | Endpoint chính | Chu kỳ | Đích lưu |
|---|---|---|---|---|
| `yahoo` | Thị trường | `yahoo-finance2` (`quote`, `chart`) | 3 phút (lịch sử: 1 giờ) | `quotes`, `observations` `yahoo:<symbol>`, `items` `tech_caps` |
| `fred` | Vĩ mô Mỹ | `fred.stlouisfed.org/graph/fredgraph.csv` | 6 giờ | `observations` `fred:<code>`, chuỗi dẫn xuất `calc:GLOBAL_LIQ`, `calc:NETLIQ_US`, `calc:RECPROB_US` |
| `imf` | Vĩ mô thế giới | IMF DataMapper API v1 | 24 giờ | `observations` `imf:<ind>:<iso3 hoặc nhóm>` |
| `bis` | Lãi suất điều hành, tỷ giá thực hiệu dụng, khoảng trống tín dụng | BIS SDMX `WS_CBPOL`, `WS_EER`, `WS_CREDIT_GAP` | 12 giờ | `observations` `bis:<area>`, `bis:REER:<area>`, `bis:GAP:<area>` |
| `oecd` | Vĩ mô thế giới | OECD SDMX REST (CSV) | 24 giờ | `observations` `oecd:<CLI\|CPI\|UNE\|GDP\|IRLT>:<area>` |
| `imfcpi` | CPI tháng | IMF SDMX REST `IMF.STA,CPI` (CSV) | 24 giờ | `observations` `imf:CPI_M:<mã DataMapper>` |
| `worldbank` | GDP quý (Việt Nam) | World Bank API v2, Global Economic Monitor | 24 giờ | `observations` `wb:GDP:<iso3>` |
| `cnbc` | Lợi suất 10 năm (Indonesia) | CNBC `ts-api` chart 1Y | 6 giờ | `observations` `cnbc:<symbol>` |
| `gpr` | Rủi ro địa chính trị | `data_gpr_daily_recent.xls` | 24 giờ | `observations` `gpr:GPRD`, `gpr:GPRD_MA7` |
| `gscpi` | Chuỗi cung ứng | NY Fed GSCPI CSV | 24 giờ | `observations` `nyfed:GSCPI` |
| `rss` | Tin tức | 23 feed (`config/feeds.ts`): 5 báo crypto, 5 báo công nghệ | 10 phút | `articles` |
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
| `sbv` | Việt Nam | Không gọi mạng: lãi suất tái cấp vốn khai báo trong `config/policy-rates.ts` | 12 giờ | `observations` `sbv:REFI` |
| `macronote` | AI | Gemini hoặc Claude (tier `brief`), không gọi nguồn ngoài | mỗi tuần (thứ Hai giờ VN) | `kv` `macro:note` |
| `coingecko` | Crypto | CoinGecko `global`, `coins/markets`, `search/trending` | 5 phút | `quotes`/`observations` `cg:*`, `items` `crypto_global`, `crypto_top`, `crypto_trending` |
| `fng` | Crypto | alternative.me Fear & Greed | 1 giờ | `observations` `fng:crypto`, `items` `crypto_fng` |
| `deribit` | Crypto | Deribit DVOL (BTC) | 1 giờ | `observations` `deribit:DVOL-BTC` |
| `defillama` | Crypto | DefiLlama stablecoin charts | 6 giờ | `observations` `llama:stablecoins` |
| `mempool` | Crypto | mempool.space | 10 phút | `items` `btc_network` |
| `binance` | Crypto | Binance USDⓈ-M futures + P2P | 15 phút | `items` `crypto_perps`, `usdt_p2p`, `observations` `binance:USDTVND` |
| `cloudstatus` | Công nghệ | Trang trạng thái AWS, Google Cloud, Azure, Cloudflare, GitHub, Vercel, OpenAI, Claude | 10 phút | `items` `status` |
| `openrouter` | Công nghệ | OpenRouter `api/v1/models` | 6 giờ | `items` `ai_models` |
| `huggingface` | Công nghệ | Hugging Face `api/daily_papers`, `api/models?sort=trendingScore` | 3 giờ | `items` `hf_papers`, `hf_models` |
| `kev` | Công nghệ | CISA Known Exploited Vulnerabilities (JSON) | 6 giờ | `items` `kev` |

Chu kỳ khai báo trong `config/sources.ts` (`SOURCE_META`). Lịch FOMC và lịch họp các NHTW khác không lấy từ API mà đặt trong `config/fomc.ts` và `config/central-banks.ts` (§5.2).

## 2. Thị trường và vĩ mô

### 2.1 `yahoo` — Yahoo Finance (`lib/sources/yahoo.ts`)
- **Thư viện:** `yahoo-finance2` 4.0.5, khởi tạo `new YahooFinance({ suppressNotices: ["yahooSurvey"] })`.
- **Mã:** lấy từ `YAHOO_SYMBOLS` trong `config/series.ts`: `^GSPC`, `^IXIC`, `^TNX`, `DX-Y.NYB`, `^VIX`, `BZ=F`, `GC=F`, `HG=F`, `BTC-USD`, `USDVND=X`, `^MOVE`, cộng 11 cặp tiền của trang Vĩ mô (`FX_SYMBOLS` trong `config/countries.ts`: `EURUSD=X`, `GBPUSD=X`, `JPY=X`, `CAD=X`, `AUDUSD=X`, `KRW=X`, `CNY=X`, `INR=X`, `IDR=X`, `BRL=X`, `MXN=X`), cộng 20 cổ phiếu của trang Công nghệ (`TECH_SYMBOLS` trong `config/tech.ts`) và `HKD=X` để quy đổi vốn hoá (`TECH_FX`). Cặp tiền và cổ phiếu không nằm trong `SERIES` nên không chạy trên ticker; chỉ số bán dẫn `^SOX` thì có (`SERIES.sox`).
- **Giá:** gọi `quote(symbols, { return: "array" })` một lần cho tất cả mã. Các trường dùng:
  - `regularMarketPrice`, `regularMarketChange`
  - `regularMarketChangePercent` (đã ở đơn vị %)
  - `regularMarketTime` (kiểu `Date`), `marketState`
  - Kết quả ghi vào `quotes`.
- **Lịch sử:** gọi `chart(symbol, { period1, interval: "1d" })`, **tối đa 1 lần/giờ** (mốc thời gian lưu ở `kv['yahoo:history']`).
  - Mã có dưới 200 điểm thì backfill 430 ngày (để z-score 1 năm của Risk Regime đủ dữ liệu); các lần sau chỉ lấy 10 ngày.
  - Riêng cổ phiếu của trang Công nghệ thì lần nào cũng lấy lại đủ 430 ngày. `close` của Yahoo đã điều chỉnh theo chia tách (FPT chia 11:10 tháng 9/2026: giá 31/12/2025 hiện là 87.091 thay vì 95.800) nhưng chưa điều chỉnh cổ tức tiền mặt. Sau mỗi lần chia tách, Yahoo viết lại cả lịch sử, nên chỉ ghi đè 10 ngày sẽ làm sai % 30 ngày và % từ đầu năm.
- **Vốn hoá:** sau khi ghi giá, `quote` của các mã trong `TECH_SYMBOLS` còn cho `marketCap` (theo đồng tiền của sàn) và `currency`; ghi vào `items` `tech_caps` (`data = { cap, currency }`). Trang quy ra USD bằng `KRW=X`, `HKD=X`, `USDVND=X` (`lib/data/tech.ts`); thiếu tỷ giá thì hiện "—" thay vì một con số sai.
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
  - Trang Vĩ mô: `DTWEXBGS` (USD rổ rộng), `PALLFNFINDEXM` (giá hàng hoá IMF), `GEPUCURRENT` (bất định chính sách toàn cầu), và đầu vào của chuỗi dẫn xuất (`FRED_CALC_CODES`): `ECBASSETSW` (€ triệu), `JPNASSETS` (100 triệu yên), `DEXUSEU`, `DEXJPUS`, `T10Y3M`, `RRPONTSYD` ($ tỷ, ngày), `WTREGEN` ($ triệu, tuần).
  - Panel chủ đề của trang Vĩ mô (`MACRO_US`, `RECESSION_SIGNALS`): `WEI`, `CFNAI`, `INDPRO`, `RSAFS`, `CPILFESL`, `PCEPILFE`, `PFOODINDEXM`, `NFCI`, `DFII10`, `PAYEMS`, `UNRATE`, `UMCSENT`, `GFDEGDQ188S`, `A091RC1Q027SBEA`, `BAMLC0A0CM`, `BAMLEMCBPIOAS`, `RECPROUSM156N`, `T10Y3M`. Chuỗi lưu dạng mức (chỉ số giá, số việc làm) nhưng hiển thị dạng thay đổi thì khai `transform` trong `SeriesDef` (`yoy`: so cùng kỳ; `diff`: so kỳ trước) và `scale`; phép đổi nằm ở `displayPoints()` trong `lib/data/series.ts`, dùng chung cho ô KPI và drawer.
- **Chuỗi dẫn xuất:** cuối mỗi lần chạy, `writeDerived()` tính lại từ dữ liệu đã lưu (hàm thuần trong `lib/signals/macro.ts`):
  - `calc:GLOBAL_LIQ`: `WALCL + ECBASSETSW × DEXUSEU + JPNASSETS × 100 / DEXJPUS`, đơn vị $ triệu, theo ngày của `WALCL`. Tuần nào thiếu đầu vào (ECB cũ hơn 14 ngày, BOJ cũ hơn 75 ngày, tỷ giá cũ hơn 10 ngày) thì bỏ qua chứ không cộng thiếu.
  - `calc:NETLIQ_US`: thanh khoản ròng Mỹ = `WALCL / 1000 − RRPONTSYD − WTREGEN / 1000`, đơn vị $ tỷ, theo ngày của `WALCL`. Tuần nào RRP cũ hơn 7 ngày hoặc TGA cũ hơn 10 ngày thì bỏ qua.
  - `calc:RECPROB_US`: mô hình probit của NY Fed, `Φ(−0,5333 − 0,6330 × s) × 100` với `s` là chênh lệch 10Y–3M bình quân tháng; tháng hiện tại dùng các ngày đã có.
- **CSV:** header là `observation_date,<CODE>`; giá trị thiếu là ô rỗng (bản cũ dùng `.`, cả hai đều bị bỏ qua).
- **Cách gọi:** mỗi mã 1 request, cách nhau 300 ms. Nguồn chỉ FAIL khi hơn một nửa số mã lỗi.
- **Lưu ý:**
  - API JSON (`api.stlouisfed.org`) bắt buộc có key, trả 400 *"api_key is not set"*. Bản CSV công khai thì không cần.
  - Có thể gộp nhiều mã vào một request (`id=A,B&cosd=d1,d2`), nhưng nếu các mã **khác tần suất** thì FRED trả về **ZIP** chứ không phải CSV. Vì vậy ta gọi từng mã.

### 2.3 `imf` — IMF DataMapper (`lib/sources/imf.ts`)
- **URL:** `https://www.imf.org/external/datamapper/api/v1/<IND>`, `IND` lấy từ `IMF_INDICATORS`: `PCPIPCH` (lạm phát), `NGDP_RPCH` (tăng trưởng GDP thực), `LUR` (thất nghiệp), `GGXWDG_NGDP` (nợ công % GDP), `GGXCNL_NGDP` (cân đối ngân sách % GDP), `BCA_NGDPD` (vãng lai % GDP).
- **Định dạng:** `values[IND][ISO3][year] = number | null`; có cả giá trị dự báo đến 2031. Một số nền kinh tế trả `null` thay vì bảng năm.
- **Lưu:** 16 quốc gia trong `config/countries.ts` và 3 nhóm `IMF_GROUPS` (`WEOWORLD` thế giới, `ADVEC` kinh tế phát triển, `OEMDC` mới nổi và đang phát triển), từ năm 2010, vào series `imf:<IND>:<mã>`, mỗi năm một điểm tại `ts = 1/1`. Hai chỉ số của bản đồ thế giới (`WORLD_MAP` trong `config/macro.ts`: `NGDP_RPCH`, `PCPIPCH`) được giữ cho **mọi** nền kinh tế API trả về (khoảng 223), chỉ năm trước đến năm sau. Một chỉ số lỗi chỉ ghi log; nguồn FAIL khi hơn nửa số chỉ số lỗi.
- **Đọc ra:** điểm có `ts` ở năm tương lai là dự báo. Ô KPI và drawer (`lib/data/series.ts`) chỉ lấy điểm có `ts <= now`, tức năm hiện tại là ước tính mới nhất của IMF.
- **Lưu ý:**
  - API **bỏ qua bộ lọc quốc gia** và luôn trả về khoảng 228 nền kinh tế (~120 KB), nên phải tự lọc. Khu vực euro có mã `EURO`.
  - Akamai trả **403 cho `curl`** nhưng cho `fetch` của Node đi qua. Kiểm tra bằng Node, đừng kết luận API hỏng từ `curl`.

### 2.4 `bis` — BIS (`lib/sources/bis.ts`)
Ba truy vấn mỗi lần chạy, mọi nước gộp bằng `+`:

| Truy vấn | URL (`https://stats.bis.org/api/v1/data/...`) | Vùng | Lưu |
|---|---|---|---|
| Lãi suất điều hành | `WS_CBPOL/D.<areas>?lastNObservations=1200` (khoảng 3 năm ngày) | mã `bis` trong `config/countries.ts`: `US+XM+GB+JP+CA+AU+KR+CN+IN+ID+BR+MX`; Đức, Pháp, Ý dùng chung `XM` (ECB) | `bis:<area>` |
| Tỷ giá thực hiệu dụng | `WS_EER/M.R.B.<areas>?lastNObservations=130` (thực, rổ rộng, 2020 = 100) | mã `bisArea` của 15 nước trang Vĩ mô (Việt Nam không có); Đức, Pháp, Ý có số riêng, khu vực euro là `XM` | `bis:REER:<area>` |
| Khoảng trống tín dụng/GDP | `WS_CREDIT_GAP/Q.<areas>.P.A.C?lastNObservations=40` (khu vực tư nhân phi tài chính, mọi bên cho vay, chênh lệch so với xu hướng, điểm %) | như trên | `bis:GAP:<area>` |

- **CSV:** `detail=dataonly`; cột vùng là `REF_AREA`, riêng dataflow tín dụng là `BORROWERS_CTY`. Kỳ `2026-11-03` / `2026-09` / `2026-Q1` đổi về UTC (`parseBisCsv`).
- **Lỗi:** lãi suất điều hành lỗi thì cả nguồn FAIL; hai truy vấn còn lại lỗi chỉ ghi log, nguồn FAIL khi hơn nửa số truy vấn lỗi.
- **Lưu ý:**
  - Thiếu `detail=dataonly` thì CSV có thêm nhiều cột văn bản dài.
  - **BIS không có Việt Nam** trong cả ba dataflow (kiểm tra 2026-11-09: `WS_CBPOL` 49 vùng, `WS_EER` 64, `WS_CREDIT_GAP` 44): gọi `VN` trả lỗi SDMX "No data". Lãi suất điều hành của Việt Nam lấy từ `sbv` (§7.4); tỷ giá thực hiệu dụng và khoảng trống tín dụng để "—".

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

### 2.7 `oecd` — OECD Data Explorer (`lib/sources/oecd.ts`)
- **URL:** `https://sdmx.oecd.org/public/rest/data/<flow>/<key>?startPeriod=<năm − 3>-01&format=csvfile`. Một truy vấn mỗi chỉ số, gộp mọi nước bằng `+`; 7 truy vấn mỗi lần chạy, cách nhau 4 giây, chạy 24 giờ một lần.
- **Header bắt buộc:** gửi `Accept-Language: en`. OECD trả `HTTP 500 Internal server error` cho `Accept-Language: *`, mà `fetch` của Node (undici) gửi đúng giá trị này nếu không ghi đè, còn `curl` thì không gửi header này. Vì vậy cùng một URL chạy được bằng `curl` mà hỏng từ worker; trước khi sửa (2026-11-09) nguồn `oecd` chưa từng chạy thành công.

| Mã | Dataflow | Key | Ghi chú |
|---|---|---|---|
| `CLI` | `OECD.SDD.STES,DSD_STES@DF_CLI,` | `<areas>.M.LI.IX._Z.AA.IX._Z.H` | Chỉ báo sớm, điều chỉnh biên độ (100 = xu hướng). Không có khu vực euro (`skip`); OECD chỉ có nhóm `G4E` (Đức, Pháp, Ý, Anh) |
| `CPI` | `OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,` | `<areas>.M.N.CPI.PA._T.N.GY` | CPI toàn bộ, định nghĩa quốc gia, % so cùng kỳ. Ngày 2026-11-09: không có Nhật; Pháp, Ý, khu vực euro dừng ở 11–12/2025; Mexico dừng ở 7/2024. Trang đọc series nào mới hơn giữa OECD và `imfcpi` (§2.8) |
| `UNE` | `OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M,` | `<areas>.UNE_LF_M.PT_LF_SUB._Z.Y._T.Y_GE15._Z.M` | Thất nghiệp 15+, điều chỉnh mùa vụ. Euro = `EA`; không có CN, IN, ID, BR |
| `GDP` | `OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_OECD,` | `Q.Y.<areas>.S1.S1.B1GQ._Z...PC.L.GY.T0102` | GDP thực, % so cùng quý năm trước. Euro = `EA`; `PRICE_BASE` là `L` (không phải `LR`) |
| `IRLT` | `OECD.SDD.STES,DSD_STES@DF_FINMARK,` | `<areas>.M.IRLT.PA._Z._Z._Z._Z.N` | Lợi suất trái phiếu chính phủ dài hạn (10 năm), bình quân tháng. Indonesia dừng ở 12/2024, nên trang dùng số ngày của `cnbc` (§2.10) khi mới hơn; Mỹ dùng FRED `DGS10` |
| `BCI` | `OECD.SDD.STES,DSD_STES@DF_CLI,` | `<areas>.M.BCICP.IX._Z.AA.IX._Z.H` | Niềm tin doanh nghiệp, điều chỉnh biên độ (100 = trung bình dài hạn) |
| `CCI` | `OECD.SDD.STES,DSD_STES@DF_CLI,` | `<areas>.M.CCICP.IX._Z.AA.IX._Z.H` | Niềm tin người tiêu dùng, như trên |

- **Lưu:** `oecd:<mã>:<area>` với `area` là mã OECD của ta trong `config/countries.ts` (khu vực euro luôn lưu là `EA20`, kể cả khi dataflow gọi là `EA`, qua `alias`). Kỳ `2026-09` → 1/9, `2026-Q2` → 1/4 (UTC).
- **Kiểm tra:** `parseSdmxCsv` gom theo `REF_AREA`. Nếu một nước khớp hơn một series (key quá lỏng) thì báo lỗi chứ không trộn. Một chỉ số lỗi chỉ ghi log; nguồn FAIL khi hơn nửa số chỉ số lỗi.
- **Chốt key:** mỗi dataflow có số chiều riêng (STES 9, PRICES 8, LFS 9, NAMAIN1 13; ô trống là wildcard) và mã vùng riêng. Giá trị hợp lệ lấy từ content constraint: `GET /public/rest/dataflow/<agency>/<flow>/latest?references=all&detail=referencepartial`, đọc các `<common:KeyValue>`. Endpoint cấu trúc này không tính vào hạn mức tải dữ liệu.
- **Lưu ý:**
  - **Giới hạn tần suất:** OECD ghi 20 truy vấn/phút và 20 đến 60 lượt tải dữ liệu/giờ (các trang của OECD không thống nhất con số). Vượt mức thì IP bị chặn tạm, và mọi truy vấn dữ liệu **mới** trả `HTTP 500 Internal server error` (truy vấn y hệt lần trước vẫn có thể trả 200 từ cache CDN, dễ gây hiểu nhầm). Mã sai và `Accept-Language: *` cũng trả 500, nên gặp 500 thì thử lại URL đó bằng `curl` trước khi kết luận bị chặn; khi dò key thì dùng endpoint cấu trúc ở trên.
  - `lastNObservations` hay trả 500 (OECD giới hạn tham số này từ 3/2026); dùng `startPeriod`.
  - Các nước không có số tháng hoặc quý thì trang Vĩ mô dùng ước tính năm của IMF.
  - **Việt Nam không có trong dataflow nào ở trên** (kiểm tra content constraint ngày 2026-11-09). Đọc vùng có số từ `<structure:ContentConstraint type="Actual">` → `<common:KeyValue id="REF_AREA">`; danh mục mã (codelist) có `VNM` nhưng không có nghĩa là có số liệu.

### 2.8 `imfcpi` — IMF CPI dataset (`lib/sources/imfcpi.ts`)
- **URL:** `https://api.imf.org/external/sdmx/2.1/data/IMF.STA,CPI/<areas>.CPI+HICP._T.YOY_PCH_PA_PT.M?startPeriod=<năm − 3>-01&detail=dataonly`, header `Accept: application/vnd.sdmx.data+csv;version=1.0.0` (không có header này thì trả XML). Một truy vấn cho cả 16 nước, khoảng 90 KB, 2 giây. Không cần key; khác DataMapper, endpoint này cho cả `curl` lẫn Node đi qua.
- **Khoá:** `COUNTRY.INDEX_TYPE.COICOP_1999.TYPE_OF_TRANSFORMATION.FREQUENCY`. Khu vực euro là `G163` và chỉ có `HICP`; các nước còn lại lấy `CPI` (định nghĩa quốc gia, như OECD), có cả `HICP` thì bỏ HICP.
- **Lưu:** `imf:CPI_M:<mã DataMapper>` (khu vực euro lưu là `EURO`), kỳ `2026-M09` → 1/9 UTC (`periodTs`).
- **Đọc ra:** cột CPI và lãi suất thực của bảng sức khoẻ, small multiples Lạm phát và đường lãi suất thực lấy series có điểm mới nhất giữa `oecd:CPI:<area>` và `imf:CPI_M:<mã>` (`freshest` trong `lib/data/series.ts`; bằng nhau thì giữ OECD).
- **Độ mới (2026-11-09):** đến 9/2026 cho phần lớn nước, Úc 8/2026, Ấn Độ 7/2026.
- **Các dataflow IMF khác đã thử cho Việt Nam:** `MFS_IR` (lãi suất) và `EER` (tỷ giá hiệu dụng) không có Việt Nam; `QNEA` (GDP quý) chỉ có metadata; `LS` (thất nghiệp quý) dừng ở Q4/2024, cũng cũ với Brazil (2/2025) và Ấn Độ (Q4/2025).

### 2.9 `worldbank` — World Bank Global Economic Monitor (`lib/sources/worldbank.ts`)
- **URL:** `https://api.worldbank.org/v2/country/<iso3;…>/indicator/NYGDPMKTPSAKN?source=15&format=json&frequency=Q&mrv=24&per_page=500`: GDP thực theo quý, giá cố định nội tệ, đã điều chỉnh mùa vụ. Không cần key.
- **Nước:** những nước có `gdp: "wb:GDP:<iso3>"` trong `config/countries.ts` (hiện chỉ Việt Nam, vì OECD không có tài khoản quốc gia quý của Việt Nam).
- **Định dạng:** `[meta, rows]`; GEM để trống `countryiso3code`, mã ISO3 nằm ở `country.id`. `date` dạng `2026Q2`.
- **Lưu:** `wb:GDP:<iso3>` là % thay đổi so với cùng quý năm trước (cùng thước đo với OECD `GDP`), `ts` = ngày đầu quý.
- **Lưu ý:** GEM chậm khoảng một quý so với Tổng cục Thống kê (11/2026 mới có Q2/2026). Chỉ số `REER` của GEM cho Việt Nam dừng ở 10/2024, `UNEMPSA_` chỉ là số năm nội suy, nên không dùng.

### 2.10 `cnbc` — Lợi suất trái phiếu theo ngày (`lib/sources/cnbc.ts`)
- **URL:** `https://ts-api.cnbc.com/harmony/app/charts/1Y.json?symbol=<symbol>` (không chính thức, không cần key): `barData.priceBars[].{ close, tradeTime }`, khoảng 2 năm số ngày. `close` là lợi suất %.
- **Mã:** lấy từ `y10: "cnbc:<symbol>"` trong `config/countries.ts`; hiện chỉ `ID10Y-ID` (Indonesia). CNBC không có Việt Nam (`VN10Y-VN` trả `code: 1`).
- **Lưu:** `cnbc:<symbol>`, mỗi ngày giao dịch một điểm tại 00:00 UTC.
- **Đọc ra:** cột lợi suất 10 năm lấy series mới hơn giữa `y10` (số ngày) và OECD `IRLT` (bình quân tháng). Số ngày cũ hơn 7 ngày thì hiện kèm ngày.

## 3. Tin tức và AI

### 3.1 `rss` — Feed tin tức (`lib/sources/rss.ts`, `config/feeds.ts`)
- **Feed:**
  - BBC World và Business, Guardian World, Al Jazeera, DW (`rss.dw.com/xml/rss-en-all`), France 24, NPR World
  - CNBC World và Economy, SCMP Asia
  - VnExpress Thế giới, Kinh doanh, Thời sự
  - Crypto: CoinDesk, Cointelegraph, The Block, Decrypt, Coin68 (xem §8.7)
  - Công nghệ: The Verge, Ars Technica, TechCrunch, MIT Technology Review, VnExpress Khoa học công nghệ (xem §8b.5)
- **Cách chạy:** dùng `rss-parser`, các feed chạy song song.
  - Chỉ lấy bài trong 3 ngày gần nhất; xóa bài cũ hơn 14 ngày.
  - `id = sha1(URL đã chuẩn hóa)`, trong đó URL đã bỏ `utm_*`, `at_*` và hash.
  - `title_key` là tiêu đề đã bỏ dấu và ký tự đặc biệt, dùng để gộp cùng một câu chuyện từ nhiều báo.
- **Link tương đối:** link và ảnh được giải theo host của feed (Coin68 ghi link dạng `/slug/`). Bài không giải ra được URL `http(s)` thì bỏ qua.
- **Ảnh minh họa** (`pickImage`): gom mọi `media:content` và `media:thumbnail` (đọc với `keepArray`) cùng `enclosure` dạng ảnh, chọn ảnh **rộng nhất**. The Guardian liệt kê cùng một ảnh ở 140/460/700 px, còn ảnh đầu tiên thì quá nhỏ để làm thẻ.
  - Ảnh `http:` được đổi sang `https:`, vì trình duyệt tải ảnh thẳng từ báo và sẽ chặn nội dung hỗn hợp.
  - Feed lưu ảnh ở host khác thì khai báo `imageBase` trong `config/feeds.ts`. Ví dụ Coin68 ghi `/images/…`, nhưng ảnh nằm ở `cdn.coin68.com`.
  - Bài đã có trong DB vẫn được cập nhật cột `image` khi feed đổi ảnh. Số bản ghi trả về chỉ đếm bài mới.
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
- **NHTW khác** (chỉ hiện ở lịch của trang Vĩ mô): đặt cứng trong `config/central-banks.ts` (`CB_MEETINGS`): ECB, BoE, BoJ, BoC, RBA, BoK, RBI, BI, Copom, Banxico, mỗi ngân hàng kèm link nguồn chính thức, đọc ngày 2026-11-09. Ngày 2027 của BI, Banxico và RBI (từ 4/2027) chưa công bố lúc đó. PBoC không họp định kỳ: LPR công bố ngày 20 hằng tháng lúc 9:15 Bắc Kinh, rơi vào cuối tuần thì lùi sang thứ Hai (`LPR_DAY`; ngày lễ Trung Quốc chưa tính). `getCalendar(lang, days, kinds)` chọn loại mục: trang tổng quan `econ`, `fomc`, `launch`; trang Vĩ mô `econ`, `fomc`, `cb`.

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

### 7.4 `sbv` — Lãi suất tái cấp vốn NHNN (`lib/sources/sbv.ts`, `config/policy-rates.ts`)
- **Không gọi mạng.** Trang "Lãi suất" của NHNN (`https://sbv.gov.vn/vi/lãi-suất1`) có bảng "Các mức lãi suất do Ngân hàng Nhà nước quy định" (tái chiết khấu, tái cấp vốn, kèm số quyết định và ngày áp dụng) và lãi suất liên ngân hàng, nhưng tường lửa F5 của NHNN trả "Request Rejected" cho `fetch` của Node. Vì vậy các lần đổi lãi suất khai báo tay trong `SBV_REFI_STEPS`.
- **Lưu:** `sbv:REFI`, mỗi ngày một điểm từ bước đầu (23/9/2022) đến hôm nay, cùng dạng với `bis:<area>` để trang đọc mọi lãi suất điều hành như nhau (`policyRateId` trong `config/countries.ts`).
- **Hạn kiểm tra:** `SBV_CHECKED` là ngày đối chiếu gần nhất với trang NHNN. Quá `SBV_RECHECK_DAYS` (180 ngày) thì nguồn FAIL với lời nhắc, panel hiện "Dữ liệu cũ" hoặc "Lỗi nguồn" thay vì im lặng hiện số có thể đã cũ. NHNN đổi lãi suất thì thêm một bước và cập nhật `SBV_CHECKED`.
- **Lịch sử đã khai báo:** 5,0% từ 23/9/2022 (1606/QĐ-NHNN), 6,0% từ 25/10/2022 (1809/QĐ-NHNN), 5,5% từ 3/4/2023 (574/QĐ-NHNN), 4,5% từ 19/6/2023 (1123/QĐ-NHNN; trang NHNN ghi nhầm ngày áp dụng là 19/03/2023).

### 7.5 Lợi suất trái phiếu chính phủ Việt Nam (chưa tích hợp)
- HNX công bố đường cong lợi suất mỗi ngày giao dịch: `POST https://hnx.vn/ModuleReportBonds/Bond_YieldCurve/SearchAndNextPageYieldCurveData` với `pDate=dd/mm/yyyy` trả bảng HTML (kỳ hạn, spot rate liên tục, par yield, spot rate theo năm); ngày không giao dịch chỉ có dòng tiêu đề. Ngày 6/11/2026: par yield 10 năm 4,51%.
- `hnx.vn` không gửi chứng chỉ trung gian (GlobalSign GCC R3 EV TLS CA 2025), nên `fetch` của Node báo `UNABLE_TO_VERIFY_LEAF_SIGNATURE` dù `curl` trên macOS chạy được. Cần bổ sung chứng chỉ trung gian mới tích hợp được; đến lúc đó ô lợi suất 10 năm của Việt Nam để "—".

## 8b. Công nghệ

Trang `/[lang]/tech` (BR-23) đọc các nguồn dưới đây cùng `yahoo` (§2.1) và `hackernews` (§5.6). Không nguồn nào cần key. Danh sách cổ phiếu và trang trạng thái khai báo trong `config/tech.ts`.

### 8b.1 `cloudstatus` — Trạng thái các đám mây và dịch vụ (`lib/sources/cloudstatus.ts`)
- **Mỗi nhà cung cấp một định dạng**, cùng quy về `ServiceStatus = { level, description, incidents[] }` với `level` thuộc `none | maintenance | unknown | minor | major | critical`:
  - **Statuspage của Atlassian** (Cloudflare, GitHub, Vercel, Claude): `/api/v2/status.json` và `/api/v2/incidents/unresolved.json`. Không dùng `summary.json` vì bản của Cloudflare liệt kê mọi PoP và nặng khoảng 200 KB. `level` lấy mức nặng hơn giữa chỉ báo chung và các sự cố đang mở: GitHub có lúc vẫn ghi "All Systems Operational" khi đang mở sự cố "minor".
  - **OpenAI**: trang đã chuyển khỏi Statuspage, `incidents/unresolved.json` trả 404, nhưng `summary.json` vẫn đúng định dạng nên dùng nó.
  - **AWS**: `health.aws.amazon.com/public/currentevents`, JSON mã hoá **UTF-16 big-endian có BOM** (`decodeUtf16`). `status` 1 = thông tin, 2 = suy giảm, 3 = gián đoạn; 0 (đã xử lý) bị bỏ. Ngày 9/11/2026 có hai sự kiện "Region Availability" ở UAE và Bahrain, mở từ đầu tháng 3/2026 và vẫn cập nhật đến tháng 9.
  - **Google Cloud**: `status.cloud.google.com/incidents.json` (khoảng 290 KB). Sự cố đang mở là sự cố chưa có `end`; `status_impact` `SERVICE_OUTAGE` → major, `SERVICE_DISRUPTION` → minor, `SERVICE_INFORMATION` → none.
  - **Azure**: RSS `azure.status.microsoft/en-us/status/feed/`, chỉ có item khi đang có sự cố và không ghi mức độ, nên mỗi item là `unknown` ("Có sự cố").
- **Lỗi:** một trang đọc không được thì dòng của nó lưu `level: null` cùng `error` (giao diện ghi "Không đọc được trang trạng thái"), không bao giờ hiện là "bình thường". Nguồn chỉ FAIL khi cả 8 trang đều lỗi.
- **Lưu:** `items` `status`, mỗi dịch vụ một dòng (`id` = khoá trong `STATUS_SERVICES`, `url` = trang trạng thái), tối đa 5 sự cố mỗi dịch vụ.

### 8b.2 `openrouter` — Model AI mới (`lib/sources/openrouter.ts`)
- **URL:** `openrouter.ai/api/v1/models` (khoảng 460 model, 830 KB).
- **Lọc (`pickNewModels`):** model có `created` trong 30 ngày; bỏ biến thể (id có `:`, ví dụ `:free`, `:batch`), alias (`~vendor/...-latest`) và bộ định tuyến `openrouter/*`. Giá theo token đổi ra USD/1 triệu token; giá âm nghĩa là "tuỳ tuyến" nên lưu `null`, không coi là miễn phí. `open` = có `hugging_face_id` (trọng số công khai). Nhà cung cấp và tên tách từ `name` ("Google: Gemini …").
- **Lưu ý:** `created` là ngày OpenRouter đưa model lên, thường chỉ sau ngày ra mắt vài hôm. Model "stealth" (ẩn danh, miễn phí) vẫn được giữ vì là tin.
- **Lưu:** `items` `ai_models` (tối đa 80), `data` = `AiModel`.

### 8b.3 `huggingface` — Nghiên cứu AI (`lib/sources/huggingface.ts`)
- **Bài nghiên cứu:** `huggingface.co/api/daily_papers?limit=100`. Giữ bài được đưa lên Daily Papers trong 3 ngày (`submittedOnDailyAt`), xếp theo `upvotes`, lấy 20. `data = { en, upvotes, comments, org, authors, github }`; `en` là tiêu đề gốc để làm tooltip khi giao diện hiện bản dịch. Tiêu đề được AI dịch (kind `hf_papers` nằm trong `TRANSLATED_ITEM_KINDS`, LLDD 05 §2).
- **Model đang hot:** `huggingface.co/api/models?sort=trendingScore&limit=50`, bỏ bản đóng gói lại của model khác (tên chứa gguf, awq, gptq, exl2, mlx, comfy, uncensored, abliterat, heretic), lấy 12. `data = { likes, downloads, task }`.
- **Lưu:** `items` `hf_papers`, `hf_models`. Một phần rỗng thì giữ snapshot cũ của phần đó; nguồn FAIL khi cả hai rỗng.

### 8b.4 `kev` — Lỗ hổng đang bị khai thác (`lib/sources/kev.ts`)
- **URL:** `www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json` (toàn bộ danh mục, khoảng 1,8 MB, cập nhật vài lần mỗi tuần).
- **Lọc (`recentKev`):** mục có `dateAdded` trong 30 ngày, mới nhất trước, cùng ngày thì số CVE lớn hơn trước; tối đa 60.
- **Lưu:** `items` `kev`, `id` = CVE, `url` = trang NVD, `ts` = ngày thêm, `data = { vendor, product, due, ransomware, desc }`. `due` là hạn vá CISA đặt cho cơ quan liên bang Mỹ; `ransomware` = `knownRansomwareCampaignUse === "Known"`.

### 8b.5 Tin công nghệ
- **RSS:** The Verge, Ars Technica, TechCrunch, MIT Technology Review, VnExpress Khoa học công nghệ (`tech: true` trong `config/feeds.ts`). Giống báo crypto, các bài này **không** vào tin thế giới và đầu vào Brief (`DESK_OUTLETS`); trang Công nghệ đọc chúng cùng bài có `topic = tech` từ báo khác, trừ báo crypto (`getTechNews`).
- Báo được nhận ra theo `name`, nên feed VnExpress mục KHCN mang tên riêng `VnExpress KHCN` để không kéo các mục VnExpress khác ra khỏi tin thế giới.

## 9. Nguồn đã loại

| Nguồn | Lý do | Thay bằng |
|---|---|---|
| Frankfurter | v1 chỉ có dữ liệu ECB (không có VND); Yahoo đã có tỷ giá | Yahoo `USDVND=X`, Vietcombank |
| World Bank WDI (số năm) | Rất chậm khi chưa có cache (11–72 giây); IMF đã đủ lạm phát và tăng trưởng, có cả dự báo. Bộ GEM (`source=15`) thì nhanh và vẫn dùng cho GDP quý của Việt Nam (§2.9) | IMF DataMapper |
| Reddit | `www.reddit.com` bị chặn ở tầng DNS; `api.reddit.com` 403; `old.reddit.com` bắt đăng nhập; cần OAuth | Wikipedia + Hacker News |
| GDELT DOC 2.0 / GEO 2.0 | DOC luôn trả 429 *"one every 5 seconds"*; GEO trả 404 | GDELT events export |
| OpenAQ v3 | Bắt buộc key (401) | Open-Meteo Air Quality |
| SJC trực tiếp | Cloudflare challenge 403 | vang.today, PNJ |
| TCBS | Cloudflare challenge 403 | SSI |
| AP RSS | 403 | Các feed khác (Google News chỉ dùng cá nhân, chưa tích hợp) |
| FRED JSON API | Cần key | FRED CSV công khai |
| Lịch FRED, BLS ICS | FRED cần key; BLS trả 403 | ForexFactory + `config/fomc.ts` |
| Genk (RSS) | Chủ yếu tin máy móc và giải trí, feed không có ảnh (thử 2026-11-09) | VnExpress Khoa học công nghệ |

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

Lần chạy đầu của các nguồn công nghệ (2026-11-09): `cloudstatus` 8 (một dòng mỗi dịch vụ), `openrouter` 27, `huggingface` 31 (20 bài, 11 model), `kev` 30. Lượt lịch sử `yahoo` sau khi thêm 20 cổ phiếu và `^SOX`: 6726 điểm.
