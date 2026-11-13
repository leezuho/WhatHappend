# 02 — Yêu cầu nghiệp vụ

> Phiên bản 0.3 · Ngày 2026-10-31 · Trạng thái: Đã triển khai M1–M7 (xem cột Trạng thái)
> Liên quan: [01 Tổng quan](01-project-overview.md) · [03 NFR](03-non-functional-requirements.md) · [04 Danh mục chỉ số](04-indicator-catalog.md) · [LLDD Frontend](../TechDesign/LLDD/04-frontend.md)

**Cách đọc:**
- Ưu tiên theo MoSCoW: **M** = Must, **S** = Should, **C** = Could.
- **MS** là milestone: M1 Nền tảng · M2 Thị trường + Vĩ mô · M3 Tin tức + AI · M4 Bản đồ · M5 Trending + Lịch + Prediction · M6 Môi trường/Sức khỏe + Góc VN · M7 Hoàn thiện · M8 Trang Vĩ mô thế giới · M9 Trang Việt Nam · M10 Trang Công nghệ.
- **Trạng thái** (đối chiếu code ngày 2026-10-31): **Done** = đạt mọi tiêu chí nghiệm thu · **Partial** = chạy được nhưng còn thiếu tiêu chí (ghi rõ ở từng BR) · **Not done** = chưa làm.

## Tóm tắt

| Mã | Module | Ưu tiên | MS | Trạng thái |
|---|---|---|---|---|
| BR-01 | Khung dashboard và Top bar | M | M1 | Done |
| BR-02 | Vital Signs | M | M2 | Done |
| BR-03 | Yield curve | M | M2 | Partial |
| BR-04 | Lạm phát so với lãi suất điều hành | S | M2 | Partial |
| BR-05 | Stress panel và chỉ báo chu kỳ | S | M2 | Partial |
| BR-06 | Risk Regime | M | M2 | Done |
| BR-07 | AI Daily Brief | M | M3 | Done |
| BR-08 | Tin tức thế giới | M | M3 | Done |
| BR-09 | Bản đồ sự kiện | S | M4 | Partial |
| BR-10 | Lịch sắp tới | S | M5 | Done |
| BR-11 | Trending | C | M5 | Done |
| BR-12 | Prediction markets | S | M5 | Done |
| BR-13 | Môi trường và sức khỏe | C | M6 | Done |
| BR-14 | Góc Việt Nam | M | M6 | Done |
| BR-15 | Song ngữ VI/EN | M | M1 (UI), M3 (nội dung) | Done |
| BR-16 | Giao diện sáng/tối | S | M1 | Done |
| BR-17 | Watchlist | C | M7 | Done |
| BR-18 | Drawer chi tiết | S | M7 | Partial |
| BR-19 | Cảnh báo dữ liệu cũ (staleness) | M | M1–M7 | Done |
| BR-20 | Cấu hình nhà cung cấp AI và API key | M | M3 | Done |
| BR-21 | Trang Vĩ mô thế giới | S | M8 | Partial (Phase 1–3 xong, còn chỗ thiếu dữ liệu) |
| BR-22 | Trang Việt Nam | S | M9 | Partial (chưa có lợi suất 10 năm) |
| BR-23 | Trang Công nghệ | S | M10 | Partial (Phase 1 xong, Phase 2–3 trong `TODO.md`) |
| BR-24 | Chủ đề chi phối | S | — | Done |
| BR-25 | Có gì mới từ lần trước | S | — | Done |
| BR-26 | Cảnh báo qua Telegram | S | — | Done (chờ người dùng đặt bot token) |
| BR-27 | Lớp địa chính trị | S | — | Done |

---

## BR-01 — Khung dashboard và Top bar · M · M1

**Trạng thái:** Done. Đạt đủ tiêu chí.

**Mô tả:** Toàn bộ dashboard nằm trên một trang với grid responsive gồm 6 hàng (xem [LLDD Frontend](../TechDesign/LLDD/04-frontend.md)). Top bar chứa:
- đồng hồ của các thị trường NY, London, Melbourne (ASX), Tokyo, Seoul (KRX), Thượng Hải, TP.HCM, kèm trạng thái mở/đóng cửa, và giờ bờ Tây Mỹ (Los Angeles);
- ticker giá chạy ngang;
- badge Risk Regime;
- nút chuyển ngôn ngữ VI/EN và nút chuyển giao diện sáng/tối.

**User story:** Là người dùng, tôi muốn mở một trang duy nhất và thấy ngay các thị trường lớn đang mở hay đóng, cùng giá chính đang chạy, để biết bối cảnh thời gian của mọi con số.

**Tiêu chí nghiệm thu:**
- Mở `/`: hệ thống chuyển hướng sang `/vi`.
- Đồng hồ hiển thị giờ địa phương của từng sàn và trạng thái "Mở"/"Đóng" theo giờ giao dịch Thứ 2–Thứ 6. Chưa tính ngày lễ.
- Ticker tạm dừng khi rê chuột và không chạy nếu người dùng bật `prefers-reduced-motion`.
- Trang tự làm mới dữ liệu khoảng mỗi 60 giây mà không reload toàn trang.

## BR-02 — Vital Signs · M · M2

**Trạng thái:** Done. Ô 2s10s < 0 hiện nhãn cảnh báo "Lưu ý" (< −0,5 là "Nguy hiểm"); nhãn "Đảo ngược" hiện ở panel Yield curve. Thời điểm cập nhật nằm trên dòng trạng thái panel. Từ 2026-11-13 panel "Điểm đáng chú ý" gộp vào đây để không lặp: ô đang nổi bật có chip lý do và một dòng AI giải thích, chỉ số nổi bật ngoài 12 ô thành một hàng riêng.

**Mô tả:** 12 ô KPI: S&P 500, Nasdaq, US10Y, 2s10s, DXY, VIX, Brent, Vàng, Đồng, BTC, VN-Index, USD/VND. Mỗi ô có:
- **nhãn**;
- **giá trị hiện tại**;
- **thay đổi trong ngày** (có dấu, tô màu theo hướng × tốt/xấu);
- **sparkline 30 ngày**;
- **trạng thái cảnh báo** khi vượt ngưỡng (ngưỡng nằm trong [04](04-indicator-catalog.md)).

**User story:** Là người dùng, tôi muốn trong 10 giây biết thị trường toàn cầu đang bình thường hay có bất thường, để quyết định có cần đọc sâu hơn không.

**Tiêu chí nghiệm thu:**
- Given VIX > 25, When trang được render, Then ô VIX hiện trạng thái "cảnh báo" bằng **biểu tượng + nhãn**, không chỉ đổi màu. VIX > 35 thì hiện trạng thái "nghiêm trọng".
- Given 2s10s < 0, Then ô 2s10s hiện nhãn "Đảo ngược".
- Màu của delta đúng ngữ nghĩa: VIX tăng là xấu (đỏ), S&P 500 tăng là tốt (xanh).
- Mỗi ô hiện thời điểm cập nhật trong tooltip hoặc trên dòng trạng thái của panel.

## BR-03 — Yield curve · M · M2

**Trạng thái:** Partial. Biểu đồ vẽ **hình dạng đường cong** (11 kỳ hạn × mới nhất / 1 tháng / 1 năm trước) kèm giá trị và nhãn 2s10s. Lịch sử 2s10s xem qua hộp thoại chi tiết của ô 2s10s, nhưng chưa có đường tham chiếu tại 0 ở đó; chưa ghi chú nguồn FRED trên panel.

**Mô tả:** Biểu đồ đường cong lợi suất trái phiếu chính phủ Mỹ, kèm lịch sử spread 2s10s.

**User story:** Là người dùng, tôi muốn thấy đường cong lợi suất có đang đảo ngược hay không, để đánh giá rủi ro suy thoái.

**Tiêu chí nghiệm thu:**
- Hiện đường 2s10s theo thời gian, có đường tham chiếu tại 0.
- Có crosshair và tooltip hiển thị giá trị tại ngày được trỏ.
- Có chú thích nguồn (FRED).

## BR-04 — Lạm phát so với lãi suất điều hành · S · M2

**Trạng thái:** Partial. Có biểu đồ cột (không hai trục), lãi suất thực và chế độ xem bảng. Thiếu lãi suất điều hành Việt Nam (BIS không công bố, panel có ghi chú). Lạm phát là ước tính IMF theo năm; chưa hiện ngày của lãi suất BIS.

**Mô tả:** So sánh lạm phát và lãi suất điều hành của các nền kinh tế lớn: Mỹ, khu vực Euro, Nhật, Anh, Trung Quốc, Việt Nam…

**User story:** Là người dùng, tôi muốn biết NHTW nào đang "thắt" hay "nới" so với lạm phát (lãi suất thực dương hay âm), để hiểu dòng tiền toàn cầu.

**Tiêu chí nghiệm thu:**
- Mỗi quốc gia hiện lãi suất điều hành và lạm phát mới nhất kèm kỳ dữ liệu.
- Không dùng biểu đồ hai trục tung.
- Có chế độ xem bảng tương đương.

## BR-05 — Stress panel và chỉ báo chu kỳ · S · M2

**Trạng thái:** Partial. Stress panel gồm VIX, HY OAS, STLFSI và GPR (thay MOVE); MOVE chỉ có trên ticker và có thể ghim. Chỉ báo chu kỳ (Claims, Sahm, GDPNow, WALCL…) nằm ở panel "Nhịp đập kinh tế Mỹ" và có cảnh báo ngưỡng.

**Mô tả:**
- Stress panel gồm VIX, MOVE, HY OAS và STLFSI.
- Chỉ báo chu kỳ gồm initial jobless claims, Sahm rule, GDPNow và bảng cân đối Fed (WALCL).

**User story:** Là người dùng, tôi muốn thấy các chỉ báo căng thẳng tài chính và chu kỳ kinh tế ở một chỗ, để nhận ra sớm khủng hoảng hoặc suy thoái.

**Tiêu chí nghiệm thu:**
- Mỗi chỉ báo có giá trị mới nhất, kỳ dữ liệu, ngưỡng tham chiếu và biểu đồ nhỏ.
- Chỉ số nào vượt ngưỡng thì được đánh dấu bằng biểu tượng và nhãn.

## BR-06 — Risk Regime · M · M2

**Trạng thái:** Done (v2, 2026-11-11). Đủ 3 trạng thái + "Chưa đủ dữ liệu" và ghi đè VIX > 35. Popover hiện giá trị gốc, ngày và z-score từng thành phần, ngày bắt đầu trạng thái và cảnh báo phân kỳ tín dụng.

**Mô tả:** Badge tổng hợp có 3 trạng thái risk-on / neutral / risk-off, kèm trạng thái "không đủ dữ liệu". Badge được tính từ VIX, chênh lệch tín dụng Baa, DXY, 2s10s, STLFSI, xu hướng S&P 500 và độ rộng thị trường thế giới, mỗi thành phần so với tối đa 10 năm lịch sử. Tốc độ giãn của HY OAS không vào điểm mà thành cảnh báo phân kỳ riêng. Thuật toán nằm trong [LLDD 06](../TechDesign/LLDD/06-risk-regime.md).

**User story:** Là người dùng, tôi muốn một tín hiệu duy nhất cho biết thị trường đang ưa hay né rủi ro, kèm lý do, để không phải tự tổng hợp nhiều chỉ số.

**Tiêu chí nghiệm thu:**
- Tooltip liệt kê đóng góp của từng thành phần (z-score, giá trị gốc và ngày của số liệu).
- Có dưới 2 thành phần có dữ liệu thì badge hiện "Không đủ dữ liệu".
- VIX > 35 thì luôn là risk-off, ngay lập tức.
- Ngoài trường hợp trên, trạng thái chỉ đổi khi tín hiệu mới giữ đủ 2 phiên.

## BR-07 — AI Daily Brief · M · M3

**Trạng thái:** Done. Ngày 2026-10-31 đã chạy thật với Gemini (`gemini-3.8-flash` qua alias `gemini-flash-latest`):
- Có đủ: 06:00, song ngữ, trích nguồn (mỗi báo một chip), nút "Viết lại" end-to-end, hướng dẫn khi thiếu key.
- Prompt cấm tự thêm chức danh hay mô tả không có trong tiêu đề, sau khi phát hiện một lỗi kiểu này ở lần chạy đầu.

**Mô tả:** Bản tóm tắt "Hôm nay thế giới có gì" gồm 1 tiêu đề và khoảng 5 gạch đầu dòng. Bản tóm tắt:
- tự tạo lúc 06:00 giờ Việt Nam;
- có cả bản tiếng Việt và tiếng Anh;
- trích nguồn cho mỗi ý;
- có thể tạo lại bằng nút làm mới.

**User story:** Là người dùng, tôi muốn đọc 5 điều quan trọng nhất trong 24 giờ qua bằng tiếng Việt, để nắm tình hình trong 1 phút.

**Tiêu chí nghiệm thu:**
- Brief chỉ dựa trên tin và dữ liệu đã thu thập, không bịa thêm. Mỗi ý có link nguồn.
- Không đưa ra khuyến nghị đầu tư.
- Chưa có brief hôm nay thì hiện brief gần nhất kèm cảnh báo stale.
- Chưa cấu hình AI (`AI_API_KEY`, Gemini hoặc Claude) thì hiện hướng dẫn cấu hình.

## BR-08 — Tin tức thế giới · M · M3

**Trạng thái:** Done. Tin lấy từ RSS (GDELT chỉ dùng cho bản đồ). Bộ lọc chủ đề và bản dịch tiêu đề cần AI đã cấu hình; đã chạy thật với Gemini. Thiếu key thì hiện tiêu đề gốc. Từ 2026-11-13, trên trang Tổng quan, danh sách tin là tab "Tin mới nhất" trong cùng panel "Tin tức hôm nay" với bản tin AI (BR-07), không còn là panel riêng nhắc lại các chuyện bản tin vừa tóm tắt.

**Mô tả:** Tin lấy từ RSS của các báo lớn và từ GDELT, đã loại trùng, phân loại theo khu vực và chủ đề, hiển thị theo tab. Tiêu đề được dịch sang ngôn ngữ đang chọn.

**User story:** Là người dùng, tôi muốn lướt tiêu đề mới nhất theo khu vực/chủ đề bằng ngôn ngữ của mình, để nhanh chóng chọn tin cần đọc kỹ.

**Tiêu chí nghiệm thu:**
- Cùng một tin đăng ở nhiều nguồn chỉ hiện một lần (loại trùng theo URL đã chuẩn hóa và tiêu đề đã chuẩn hóa).
- Mỗi tin hiện nguồn, thời gian tương đối và link tới bài gốc.
- Chưa dịch được thì hiện tiêu đề gốc.

## BR-09 — Bản đồ sự kiện · S · M4

**Trạng thái:** Partial. Có lọc theo loại (3 nhóm), chú giải, mức cảnh báo là vòng viền kèm chú giải, danh sách thay thế. Chưa lọc theo mức độ; popup hiện khi rê chuột (tiêu đề, thời gian), click mở link nguồn.

**Mô tả:** Bản đồ thế giới hiện động đất, thiên tai (bão, lũ, núi lửa, cháy rừng) và điểm nóng tin tức.

**User story:** Là người dùng, tôi muốn thấy trên bản đồ nơi nào đang có sự kiện lớn, để hiểu bối cảnh địa lý của tin tức.

**Tiêu chí nghiệm thu:**
- Có bộ lọc theo loại sự kiện và mức độ.
- Click vào điểm thì hiện popup gồm tiêu đề, thời gian, mức độ và link.
- Có chú giải cho các lớp. Ký hiệu khác nhau theo cả màu lẫn hình dạng hoặc nhãn.

## BR-10 — Lịch sắp tới · S · M5

**Trạng thái:** Done (2026-11-11). Có lịch kinh tế (ForexFactory tuần này, lịch FRED các tuần sau), họp FOMC và NHTW khác, phóng tàu, giờ Việt Nam, mức tác động. Bầu cử khai tay trong `config/elections.ts` (không có nguồn miễn phí đáng tin), mỗi mục ghi nguồn đã dùng để kiểm ngày; cuộc bầu cử kế tiếp luôn hiện và bản tin AI cũng thấy bầu cử trong ngày.

**Mô tả:** Danh sách sự kiện sắp diễn ra: công bố số liệu kinh tế (CPI, việc làm, họp FOMC…), bầu cử lớn, phóng tàu vũ trụ.

**User story:** Là người dùng, tôi muốn biết tuần này có sự kiện gì có thể làm thị trường biến động, để chuẩn bị trước.

**Tiêu chí nghiệm thu:**
- Sắp xếp theo thời gian, hiển thị theo giờ Việt Nam.
- Có mức độ quan trọng nếu nguồn cung cấp.
- Danh sách bầu cử được lấy từ file cấu hình do người dùng tự cập nhật.

## BR-11 — Trending · C · M5

**Trạng thái:** Done. Wikipedia EN/VI và Hacker News. **Reddit bị loại** (bị chặn khi không đăng nhập). Tab mặc định là Wikipedia EN vì top vi.wikipedia hay bị bot đẩy lượt xem.

**Mô tả:** Những gì thế giới đang quan tâm: top bài Wikipedia (EN và VI) được xem nhiều, Hacker News, Reddit r/worldnews.

**User story:** Là người dùng, tôi muốn biết mọi người đang tìm đọc gì, để phát hiện câu chuyện mà báo chí chưa đưa nhiều.

**Tiêu chí nghiệm thu:**
- Lọc bỏ trang hệ thống (Main_Page, Special:…).
- Mỗi mục có link.
- Nguồn nào bị chặn (ví dụ Reddit) thì phần còn lại vẫn hiển thị bình thường.

## BR-12 — Prediction markets · S · M5

**Trạng thái:** Done. Polymarket (địa chính trị, kinh tế: xác suất, KL 24h, ngày kết thúc) và thang lãi suất Fed của Kalshi.

**Mô tả:** Xác suất mà thị trường dự đoán (Polymarket, Kalshi) gán cho các sự kiện lớn: quyết định của Fed, bầu cử, địa chính trị.

**User story:** Là người dùng, tôi muốn thấy "thị trường đặt cược" bao nhiêu % cho các sự kiện quan trọng, để có góc nhìn định lượng bên cạnh tin tức.

**Tiêu chí nghiệm thu:**
- Mỗi thị trường hiện câu hỏi, xác suất, khối lượng giao dịch và ngày đóng.
- Ưu tiên các chủ đề kinh tế và địa chính trị.

## BR-13 — Môi trường và sức khỏe · C · M6

**Trạng thái:** Done. CO₂, GISTEMP, AQI 10 thành phố (Open-Meteo, chấm màu + nhãn) và tin WHO.

**Mô tả:**
- Môi trường: nồng độ CO₂ (Mauna Loa), dị thường nhiệt độ toàn cầu, chất lượng không khí ở khoảng 10 thành phố lớn.
- Sức khỏe: thông báo dịch bệnh của WHO.

**User story:** Là người dùng, tôi muốn theo dõi các xu hướng dài hạn về khí hậu và các cảnh báo dịch bệnh mới, để không bỏ lỡ rủi ro ngoài kinh tế.

**Tiêu chí nghiệm thu:**
- Mỗi chỉ số có kỳ dữ liệu và nguồn.
- AQI được phân mức theo thang chuẩn và luôn kèm nhãn chữ.

## BR-14 — Góc Việt Nam · M · M6

**Trạng thái:** Done. Giá vàng SJC lấy qua vang.today/PNJ (trang SJC chặn bot); có thêm tỷ giá Vietcombank và chênh lệch SJC so với vàng thế giới. Từ 2026-11-13 VN-Index nằm trong bảng bốn chỉ số sàn (VN-Index, VN30, HNX, UPCoM) kèm khối ngoại phiên gần nhất, thay cho tile trùng với Vital Signs; tỷ giá USD đọc ở bảng Vietcombank và ô USD/VND của Vital Signs.

**Mô tả:** VN-Index, tỷ giá USD/VND, giá vàng SJC (mua/bán) và tin VnExpress.

**User story:** Là người dùng ở Việt Nam, tôi muốn thấy tình hình trong nước cạnh bức tranh toàn cầu, để liên hệ tác động quốc tế tới Việt Nam.

**Tiêu chí nghiệm thu:**
- Mỗi số liệu có thời điểm cập nhật.
- Nguồn không chính thức bị hỏng thì chỉ ô đó hiện stale.

## BR-15 — Song ngữ VI/EN · M · M1 (UI) / M3 (nội dung)

**Trạng thái:** Done. Giao diện và định dạng số đầy đủ. Bản dịch nội dung cần AI đã cấu hình (`AI_API_KEY`); đã kiểm chứng với Gemini. Thiếu key thì hiện bản gốc.

**Mô tả:** Toàn bộ chuỗi giao diện, định dạng số/ngày, tiêu đề tin và Brief đều có hai ngôn ngữ, chuyển qua đường dẫn `/vi` và `/en`.

**User story:** Là người dùng, tôi muốn chuyển qua lại giữa tiếng Việt và tiếng Anh, để đọc nhanh bằng tiếng mẹ đẻ và đối chiếu thuật ngữ gốc khi cần.

**Tiêu chí nghiệm thu:**
- Chuyển ngôn ngữ thì giữ nguyên trang và thay đổi cả chuỗi giao diện lẫn nội dung.
- Số được định dạng theo `vi-VN` hoặc `en-US`.
- Thiếu bản dịch thì hiện bản gốc, không để trống.

## BR-16 — Giao diện sáng/tối · S · M1

**Trạng thái:** Done. Đạt đủ tiêu chí.

**Mô tả:** Mặc định theo hệ điều hành. Có nút chuyển thủ công, lựa chọn được ghi nhớ.

**Tiêu chí nghiệm thu:**
- Không bị nháy sai màu khi tải trang.
- Biểu đồ dùng bộ màu riêng cho chế độ tối, không chỉ đảo ngược màu.

## BR-17 — Watchlist · C · M7

**Trạng thái:** Done. Ghim/bỏ ghim từ hộp thoại chi tiết, lưu trong SQLite. Chỉ ghim được các chỉ số đã khai báo trong `config/series.ts`, chưa thêm được mã tùy ý.

**Mô tả:** Người dùng ghim thêm chỉ số hoặc mã để theo dõi. Danh sách lưu trong bảng `watchlist` của SQLite.

**User story:** Là người dùng, tôi muốn ghim những mã tôi quan tâm riêng, để không phải tìm lại mỗi lần.

**Tiêu chí nghiệm thu:**
- Thêm hoặc bỏ một mã thì danh sách được lưu bền, khởi động lại vẫn còn.

## BR-18 — Drawer chi tiết · S · M7

**Trạng thái:** Partial. Làm dạng hộp thoại (`<dialog>`) cho các ô KPI: lịch sử 3T/1N/2N/5N, giải thích song ngữ, chế độ xem bảng, đóng bằng Esc hoặc click ra ngoài. Chưa có cho biểu đồ; chưa hiện ngưỡng và nguồn trong hộp thoại.

**Mô tả:** Bấm vào một ô hoặc biểu đồ sẽ mở drawer gồm:
- lịch sử dài hơn (có chọn khung thời gian);
- phần giải thích song ngữ "chỉ số này nói lên điều gì" (lấy từ [04](04-indicator-catalog.md));
- ngưỡng cảnh báo và nguồn.

**Tiêu chí nghiệm thu:**
- Đóng drawer bằng Esc hoặc click ra ngoài.
- Thao tác được bằng bàn phím.
- Có chế độ xem bảng dữ liệu.

## BR-19 — Cảnh báo dữ liệu cũ (staleness) · M · M1–M7

**Trạng thái:** Done. Đạt đủ tiêu chí.

**Mô tả:** Mỗi panel hiện "cập nhật lúc …". Panel hiện badge **stale** khi lần chạy gần nhất của nguồn bị lỗi, hoặc lần thành công gần nhất đã cũ hơn 3 lần chu kỳ cập nhật.

**User story:** Là người dùng, tôi muốn biết khi nào một con số không còn mới, để không ra quyết định dựa trên dữ liệu cũ.

**Tiêu chí nghiệm thu:**
- Given một nguồn trả lỗi hoặc thiếu key, Then chỉ panel dùng nguồn đó hiện stale (hoặc "cần key"), phần còn lại của trang vẫn hoạt động.
- Tooltip của badge nêu nguyên nhân rút gọn.

## BR-20 — Cấu hình nhà cung cấp AI và API key · M · M3

**Trạng thái:** Done. Đã chạy thật với Gemini (key Google AI Studio gói miễn phí). Nhánh Claude mới qua kiểm tra kiểu.

**Mô tả:** Người dùng chọn nhà cung cấp AI (Google Gemini hoặc Anthropic Claude) và API key bằng cấu hình cục bộ, không phải sửa code. Model cho từng tác vụ (Brief, dịch) cũng đổi được.

**User story:** Là người dùng, tôi muốn dùng key AI mình đang có (ví dụ Gemini miễn phí), để có bản tin và bản dịch mà không bị buộc vào một nhà cung cấp.

**Tiêu chí nghiệm thu:**
- Đặt `AI_PROVIDER` (`gemini` | `anthropic`, tùy chọn) và `AI_API_KEY` trong `.env.local` là đủ. Không có `AI_PROVIDER` thì tự đoán từ key. Cũng nhận `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY`.
- `AI_MODEL_BRIEF` và `AI_MODEL_FAST` đổi model. Mặc định chạy được với gói miễn phí của Gemini (Flash / Flash-Lite).
- Cấu hình sai hoặc thiếu thì worker ghi rõ lý do, hai tính năng AI tắt, và dashboard hiện "Cần API key". Phần còn lại vẫn chạy.
- Key chỉ nằm trong `.env.local` (gitignore), không bao giờ gửi xuống trình duyệt ([NFR-05](03-non-functional-requirements.md)).

## BR-21 — Trang Vĩ mô thế giới · S · M8

**Trạng thái:** Partial. Phase 1 xong (2026-11-09): trang `/[lang]/macro` có Nhịp kinh tế thế giới, Bảng sức khoẻ 15 nền kinh tế và Đồng hồ chu kỳ. Phase 2 xong (2026-11-09): sáu panel theo chủ đề và Lịch vĩ mô. Phase 3 xong (2026-11-09): nhận định vĩ mô tuần do AI viết và bản đồ thế giới tô màu theo tăng trưởng, lạm phát. Các chỗ còn thiếu dữ liệu nằm trong [`TODO.md`](../TODO.md).

**Mô tả:** Một trang riêng để khám sức khoẻ kinh tế thế giới, trả lời 6 câu hỏi: kinh tế đang ở pha nào của chu kỳ, lạm phát đã hạ nhiệt chưa, tiền tệ và thanh khoản đang nới hay thắt, người lao động và người tiêu dùng có ổn không, nợ công có thành vấn đề không, rủi ro suy thoái ở mức nào. Phủ 15 nền kinh tế lớn: Mỹ, khu vực euro, Đức, Pháp, Ý, Anh, Nhật, Canada, Úc, Hàn Quốc, Trung Quốc, Ấn Độ, Indonesia, Brazil, Mexico, cộng Việt Nam ở hàng cuối để so sánh (thêm ngày 2026-11-09). Việt Nam không có trong dữ liệu OECD và BIS, nên lấy CPI tháng từ IMF, GDP quý từ World Bank, lãi suất tái cấp vốn của NHNN (khai báo tay, kiểm tra lại ít nhất 6 tháng một lần), thất nghiệp là ước tính năm của IMF. Chưa có lợi suất 10 năm (HNX, xem `TODO.md`); không có chỉ báo sớm, niềm tin, tỷ giá thực hiệu dụng và khoảng trống tín dụng.

**User story:** Là người theo dõi kinh tế vĩ mô, tôi muốn thấy trên một màn hình nền kinh tế nào đang mạnh lên, nước nào đang yếu đi và chỉ số nào đang vượt ngưỡng, để nắm bức tranh toàn cầu mà không phải mở nhiều trang thống kê.

**Tiêu chí nghiệm thu:**
- Mục "Vĩ mô" trên thanh điều hướng mở `/vi/macro` hoặc `/en/macro`.
- Hàng đầu có 8 ô: tăng trưởng và lạm phát thế giới (IMF), chỉ số giá hàng hoá IMF, áp lực chuỗi cung ứng, USD rổ rộng, thanh khoản NHTW toàn cầu (Fed + ECB + BOJ quy USD), xác suất suy thoái Mỹ 12 tháng (mô hình NY Fed), bất định chính sách toàn cầu. Ô nào cũng mở được drawer lịch sử.
- Bảng sức khoẻ: mỗi nước một hàng, 10 cột (GDP, CPI, thất nghiệp, lãi suất điều hành, lãi suất thực, lợi suất 10 năm, tỷ giá so USD từ đầu năm, chỉ báo sớm, nợ công, vãng lai). Ô nào cũng ghi kỳ dữ liệu. Thiếu số tháng hoặc quý thì dùng ước tính năm của IMF và ghi rõ "IMF 2026". Màu chỉ để nhấn, luôn kèm chú giải và nhãn chữ (tooltip, sr-only).
- Đồng hồ chu kỳ: mỗi nước một chấm theo CLI của OECD (trên hay dưới 100, tăng hay giảm trong 3 tháng), có vệt 6 tháng, danh sách nước theo pha và chế độ xem bảng.
- Mỗi số liệu tháng, quý hoặc năm hiện kỳ của nó, kể cả trên ô KPI.
- Nguồn hỏng (OECD hay giới hạn tần suất) thì panel hiện "Dữ liệu cũ" hoặc "Lỗi nguồn", các ô khác vẫn chạy.
- Phase 2: sáu panel theo chủ đề, mỗi panel trả lời một câu hỏi và đặt chi tiết của Mỹ (ô KPI có drawer lịch sử) cạnh các nền kinh tế lớn:
  - Tăng trưởng: chỉ báo sớm CLI 24 tháng từng nước (đường 100) kèm GDP quý mới nhất; Mỹ: GDPNow, WEI, CFNAI, sản xuất công nghiệp, bán lẻ.
  - Lạm phát: CPI 24 tháng từng nước so với mục tiêu NHTW của nước đó; Mỹ: CPI, CPI lõi, PCE lõi, 5y5y, giá lương thực IMF.
  - Tiền tệ & thanh khoản: lãi suất điều hành và lãi suất thực 36 tháng từng NHTW; tỷ giá thực hiệu dụng so với trung bình 10 năm; Mỹ: lãi suất Fed, thanh khoản ròng (Fed − RRP − TGA), NFCI, lợi suất thực 10 năm.
  - Việc làm & tiêu dùng: thất nghiệp 24 tháng từng nước, niềm tin người tiêu dùng và doanh nghiệp OECD; Mỹ: việc làm phi nông nghiệp, thất nghiệp, claims, niềm tin tiêu dùng UMich.
  - Nợ & ngân sách: nợ công năm nay và so với 2019, cân đối ngân sách, khoảng trống tín dụng BIS; Mỹ: nợ liên bang/GDP, chi trả lãi, chênh lệch tín dụng IG, HY, EM.
  - Tín hiệu suy thoái: bảng các chỉ báo từng đi trước suy thoái, mỗi dòng có ngưỡng và trạng thái bằng chữ, cộng số nước có CLI ở pha Suy yếu; câu đầu đếm số tín hiệu đang bật.
  - Lịch vĩ mô: số liệu công bố 4 tuần tới, lịch họp Fed và 10 NHTW lớn khác, ngày LPR của Trung Quốc.
- Phase 3:
  - Nhận định tuần: mỗi thứ Hai AI viết một tiêu đề, 4–6 ý (có một ý về Việt Nam so với các nước) và 2–4 mục cần theo dõi, chỉ từ số liệu trên trang, song ngữ. Dùng gói Gemini miễn phí được: một lần gọi mỗi tuần, không gọi khi không có số mới, không lấy lượt của bản tin.
  - Bản đồ thế giới: chọn tăng trưởng GDP hoặc lạm phát năm nay (IMF) cho mọi nước có số, màu theo lớp kèm chú giải, rê chuột xem số, có chế độ bảng; Việt Nam được viền đậm.
- Small multiples chung trục thời gian; rê chuột lên một ô thì mọi ô cùng hiện số của tháng đó; có chế độ xem bảng. Nước nào nguồn không có số tháng thì ghi rõ tên dưới biểu đồ.

**Ngoài phạm vi:** PMI (S&P Global, ISM là dữ liệu trả phí) và dự báo đồng thuận ("vượt hay hụt kỳ vọng"): không có nguồn miễn phí. Thay bằng chỉ báo sớm CLI của OECD.

---

## BR-22 — Trang Việt Nam · S · M9

**Trạng thái:** Partial (2026-11-09). Trang `/[lang]/vietnam` đã có đủ năm panel; còn thiếu lợi suất trái phiếu chính phủ 10 năm (HNX, xem [`TODO.md`](../TODO.md)).

**Mô tả:** Một trang riêng cho Việt Nam, sâu hơn "Góc Việt Nam" (BR-14) trên trang tổng quan: thị trường trong nước, kinh tế hiện tại và triển vọng của IMF. Việc so sánh với các nước khác nằm ở trang Vĩ mô thế giới (BR-21), nơi Việt Nam là hàng cuối.

**User story:** Là người dùng ở Việt Nam, tôi muốn xem trên một trang thị trường, tỷ giá, vàng, tăng trưởng, lạm phát và lãi suất của Việt Nam cùng dự báo vài năm tới, để hiểu kinh tế trong nước đang ở đâu.

**Tiêu chí nghiệm thu:**
- Mục "Việt Nam" trên thanh điều hướng mở `/vi/vietnam` hoặc `/en/vietnam`; panel Góc Việt Nam ở trang tổng quan có liên kết sang.
- Thị trường: ô VN-Index, USD/VND (thị trường), USD bán ra Vietcombank, USDT/VND P2P, vàng miếng SJC, mỗi ô mở được drawer lịch sử; dòng độ rộng thị trường.
- Kinh tế: ô tăng trưởng GDP quý (World Bank), lạm phát CPI tháng (IMF), lãi suất tái cấp vốn NHNN, kèm kỳ dữ liệu; lãi suất thực (tái cấp vốn − CPI); bảng số năm của IMF từ 5 năm trước đến 2 năm sau (năm nay là ước tính, các năm sau là dự báo) cho tăng trưởng, lạm phát, thất nghiệp, nợ công, cân đối ngân sách, vãng lai, kèm cột trung bình nhóm mới nổi; liên kết sang trang Vĩ mô để so sánh.
- Vàng (các thương hiệu, giá thế giới quy đổi, chênh lệch SJC), tỷ giá Vietcombank và 15 tin VnExpress.
- Lãi suất NHNN khai báo tay; quá 180 ngày chưa kiểm tra lại thì panel báo lỗi nguồn thay vì hiện số có thể đã cũ.

- Số liệu tháng của Cục Thống kê (từ 2026-11-12, người dùng chọn AI trích thay cho nhập tay): xuất nhập khẩu và cán cân, xuất khẩu sang Mỹ, FDI giải ngân, IIP, bán lẻ, CPI, cùng tín dụng và GDP quý ở báo cáo quý. Mỗi số chỉ được giữ khi xuất hiện nguyên văn trong báo cáo, trong câu nêu đúng chỉ số và tháng, và nằm trong khoảng hợp lý; panel gắn nhãn "AI trích" và link tới báo cáo gốc (LLDD 02 §7.6, LLDD 05 §3e).

**Ngoài phạm vi:** PMI Việt Nam (S&P Global, trả phí); World Bank WDI (IMF đã đủ, có cả dự báo).

---

## BR-23 — Trang Công nghệ · S · M10

**Trạng thái:** Partial. Phase 1 xong (2026-11-09): trang `/[lang]/tech` có bảy panel bên dưới. Phase 2 (capex AI của các hyperscaler, doanh thu tháng TSMC, chỉ số tuyển dụng, theo dõi phiên bản và ngày hết hỗ trợ, nhận định công nghệ tuần do AI viết) và Phase 3 nằm trong [`TODO.md`](../TODO.md).

**Mô tả:** Một trang riêng cho công nghệ, trả lời bốn câu hỏi: thị trường đang định giá công nghệ và chu kỳ chip ra sao, các dịch vụ mà Internet dựa vào có đang trục trặc không, AI vừa ra gì (model, giá, nghiên cứu), và lỗ hổng nào đang bị khai thác thật. Mọi nguồn đều không cần key.

**User story:** Là người làm và theo dõi công nghệ, tôi muốn thấy trên một trang cổ phiếu công nghệ, sự cố của các đám mây lớn, model AI mới kèm giá, nghiên cứu đang được chú ý, lỗ hổng cần vá và tin công nghệ, để không phải mở nhiều trang trạng thái và trang tin.

**Tiêu chí nghiệm thu:**
- Mục "Công nghệ" trên thanh điều hướng mở `/vi/tech` hoặc `/en/tech`. Tab đang chọn phải nổi bật rõ ở cả ba giao diện.
- Cổ phiếu: ô Nasdaq Composite và chỉ số bán dẫn SOX (mở được drawer lịch sử); bảng 20 mã theo 4 nhóm (Big Tech Mỹ, chuỗi bán dẫn, châu Á, Việt Nam) với giá theo đồng tiền của sàn, % hôm nay, 30 ngày, từ đầu năm, vốn hoá quy USD và sparkline 1 năm; dòng tổng vốn hoá của Big Tech Mỹ.
- Trạng thái dịch vụ: AWS, Google Cloud, Azure, Cloudflare, GitHub, Vercel, OpenAI, Claude, mỗi dịch vụ có mức (kèm nhãn chữ) và link trang trạng thái; liệt kê sự cố đang mở với vùng và thời điểm bắt đầu. Trang nào không đọc được thì ghi rõ, không hiện là "bình thường".
- Model AI mới trong 30 ngày (OpenRouter): hãng, ngày lên, giá vào/ra cho mỗi triệu token, độ dài ngữ cảnh, đánh dấu model mở trọng số.
- Nghiên cứu AI (Hugging Face): bài nổi bật 3 ngày qua theo lượt bình chọn (tiêu đề được dịch khi có AI) và model đang hot, đã bỏ các bản đóng gói lại.
- Lỗ hổng đang bị khai thác (CISA KEV) trong 30 ngày: hãng, sản phẩm, CVE, hạn vá, đánh dấu ransomware.
- Hacker News và tin công nghệ (The Verge, Ars Technica, TechCrunch, MIT Technology Review, VnExpress Khoa học công nghệ). Tin của các báo công nghệ không vào danh sách tin thế giới và Brief, giống báo crypto.

**Ngoài phạm vi:** dữ liệu cần key (Cloudflare Radar, Product Hunt, Artificial Analysis); bảng xếp hạng chất lượng model (chưa tìm được nguồn không cần key); giá DRAM và GPU cho thuê (chỉ có nguồn trả phí).

---

## BR-24 — Chủ đề chi phối · S

**Trạng thái:** Done (2026-11-11). Panel đầu trang Tổng quan, 4 chủ đề, ghi chú AI đã chạy thật với Gemini. Thiết kế ở [LLDD 04 §3](../TechDesign/LLDD/04-frontend.md) (Hàng 0) và [LLDD 05 §3d](../TechDesign/LLDD/05-ai-pipeline.md).

**Mô tả:** Vài câu chuyện đang dẫn dắt thị trường (năng lượng vùng Vịnh, lạm phát Mỹ và Fed, chu kỳ AI và bán dẫn, vốn ngoại và tỷ giá Việt Nam), khai báo tay trong `config/themes.ts`. Mỗi chủ đề gắn với các chỉ số cho biết nó đang nóng lên hay hạ nhiệt, kênh truyền dẫn sang Việt Nam, kèo Polymarket và tin liên quan. Đây là phần "nối các chấm" mà review sản phẩm ngày 2026-11-10 thấy thiếu: dashboard có đủ mảnh ghép nhưng không nói ra câu chuyện chính (Brent +48% từ đầu năm, khí TTF +192%, CPI năng lượng Mỹ +20,4% mà bản tin, nhận định tuần và "Điểm đáng chú ý" đều không nhắc).

**User story:** Là người đầu tư theo dõi vĩ mô và địa chính trị, tôi muốn mở trang là thấy ngay vài câu chuyện lớn đang chi phối thị trường, mỗi chuyện đang nóng lên hay hạ nhiệt và ảnh hưởng gì tới Việt Nam, để không phải tự ghép từ hàng chục panel.

**Tiêu chí nghiệm thu:**
- Panel nằm đầu trang Tổng quan, mỗi chủ đề một thẻ, giữ thứ tự khai báo.
- Trạng thái tính từ số liệu (không do AI): biến động khoảng một tháng của từng chỉ số so với mức thường gặp của chính nó, có nhãn chữ (Nóng lên / Hạ nhiệt / Đi ngang / Chưa đủ dữ liệu) và tooltip giải thích.
- Mỗi chỉ số hiện giá trị, thay đổi 1 tháng và kỳ dữ liệu với số liệu tháng; chỉ số thiếu lịch sử hoặc số liệu trễ vẫn hiện nhưng không tính vào trạng thái.
- Mỗi chủ đề có tối đa 3 tin mới nhất (gom tin trùng), số bài 24 giờ và 7 ngày, và tối đa 2 kèo Polymarket chưa ngã ngũ.
- AI viết 2–3 câu cho mỗi chủ đề, chỉ từ dữ liệu của chủ đề đó, song ngữ; mỗi ngày một lần sau 06:00 và khi trạng thái một chủ đề đổi (tối đa 6 giờ một lần), không lấy lượt gọi của bản tin.
- Nhận định vĩ mô tuần nhận các chủ đề trong đầu vào.
- Chưa cấu hình AI thì thẻ vẫn đủ số liệu, tin, kèo; chân panel hướng dẫn đặt `AI_API_KEY`.

**Ngoài phạm vi:** tự phát hiện chủ đề mới từ tin tức (chủ đề do người dùng khai báo); lịch sử trạng thái theo ngày (cần cho "Có gì mới từ lần trước", xem `TODO.md`).

---

## BR-25 — Có gì mới từ lần trước · S

**Trạng thái:** Done (2026-11-11). Dải đầu trang Tổng quan, nhật ký do worker ghi. Thiết kế ở [LLDD 04 §3](../TechDesign/LLDD/04-frontend.md) (Hàng 0) và [LLDD 01 §3.13](../TechDesign/LLDD/01-database-schema.md). Từ 2026-11-13 dải không lặp tín hiệu của các chỉ số đang nổi bật (đã hiện ở Vital Signs), chỉ ghi một liên kết tới đó.

**Mô tả:** Một dải liệt kê những gì đã đổi kể từ lần người dùng xem trước: trạng thái rủi ro đổi, trạng thái chủ đề chi phối đổi, chỉ số vừa vượt ngưỡng, số liệu vừa công bố so với dự báo, biến động bất thường, lỗ hổng vừa bị khai thác ở các hãng đang theo dõi. Phục vụ KPI-1 (nắm tình hình dưới 2 phút, [BRD 01 §7](01-project-overview.md)): người đọc buổi sáng không phải dò lại 17 panel để biết cái gì mới.

**User story:** Là người mở dashboard mỗi sáng, tôi muốn thấy ngay những gì đã thay đổi từ lần trước, để chỉ đọc kỹ phần có chuyện.

**Tiêu chí nghiệm thu:**
- Mốc "lần trước" lưu trong trình duyệt (không cần đăng nhập); tải lại trang trong cùng lần xem không làm mất danh sách; lần đầu hiện 24 giờ qua.
- Mỗi mục là một câu song ngữ có giờ tương đối, loại quan trọng đứng trước; lỗ hổng có link.
- Nút "Đã xem" xoá danh sách tới lần thay đổi sau.
- Giá trị lơ lửng quanh ngưỡng không tạo mục trùng lặp.
- Không có gì mới thì nói rõ "Không có gì mới kể từ …".

**Ngoài phạm vi:** đồng bộ mốc giữa nhiều máy hay trình duyệt; thông báo đẩy (cảnh báo Telegram ở BR-26, đọc cùng nhật ký).

---

## BR-26 — Cảnh báo qua Telegram · S

**Trạng thái:** Done (2026-11-11), chưa chạy thật vì chưa có bot token. Thiết kế ở [LLDD 03 §9](../TechDesign/LLDD/03-worker-and-sources-framework.md).

**Mô tả:** Worker gửi tin qua một bot Telegram tới một chat khi có chuyện cần biết ngay, không đợi người dùng mở dashboard:
- trạng thái rủi ro đổi;
- số liệu Mỹ vừa công bố lệch dự báo;
- Vietcombank bán đô cách trần biên độ của NHNN dưới 2%;
- chênh lệch vàng SJC so với giá thế giới đổi từ 3 triệu ₫/lượng so với ngày có giá trước đó;
- một kèo Polymarket (địa chính trị, kinh tế) đổi từ 15 điểm xác suất trong 24 giờ;
- một dịch vụ đám mây đang theo dõi báo sự cố từ mức "gián đoạn lớn" trở lên.

Ngưỡng, danh sách đám mây và ngôn ngữ tin nhắn khai trong `config/alerts.ts`. Tuỳ chọn: thiếu `TELEGRAM_BOT_TOKEN` hoặc `TELEGRAM_CHAT_ID` thì nguồn `telegram` không chạy, mọi thứ khác không đổi.

**User story:** Là người đầu tư, tôi muốn điện thoại báo ngay khi tỷ giá sát trần, Fed được định giá lại hay đám mây mình dùng gặp sự cố, để không phải mở dashboard liên tục.

**Tiêu chí nghiệm thu:**
- Mỗi điều kiện chỉ gửi một lần cho tới khi nó hết; giá trị lơ lửng quanh ngưỡng không gửi lặp (điều kiện chỉ hết khi lùi qua mức "tắt", ví dụ tỷ giá phải cách trần từ 2,5% trở lên).
- Lần chạy đầu gửi một tin "Đã bật cảnh báo" kèm quy tắc và các điều kiện đang có, không gửi lại nhật ký cũ.
- Gửi lỗi (mạng, token sai) thì lần sau gửi lại, không mất cảnh báo; lỗi hiện trong `source_status` và không chứa token.
- Dữ liệu cũ (Polymarket bị chặn, trang trạng thái không đọc được) không bật cũng không tắt điều kiện.
- Sự kiện trong nhật ký cũ hơn 12 giờ (worker hoặc Telegram ngừng lâu) không gửi.

**Ngoài phạm vi:** nhiều người nhận hoặc nhiều chat; giờ im lặng (dùng cài đặt thông báo của Telegram); lệnh hai chiều với bot.

## BR-27 — Lớp địa chính trị · S

**Trạng thái:** Done (2026-11-11). Nguồn ở [LLDD 02 §4b](../TechDesign/LLDD/02-data-sources.md), giao diện ở [LLDD 04 §3 Hàng 1b](../TechDesign/LLDD/04-frontend.md).

**Mô tả:** Ba panel dưới bản đồ trang tổng quan, trả lời "địa chính trị đang chạm vào thị trường ở đâu":
- **Eo biển và kênh đào:** số tàu qua Hormuz, Bab el-Mandeb, Suez, Mũi Hảo Vọng, Malacca, eo biển Đài Loan và Panama mỗi ngày, so với một năm trước (IMF PortWatch).
- **Rủi ro địa chính trị theo nước:** heatmap 24 tháng của chỉ số Caldara–Iacoviello theo nước, mỗi nước so với lịch sử của chính nó.
- **Trừng phạt và thương mại của Mỹ:** hành động của OFAC, quy định kiểm soát xuất khẩu (BIS), điều tra Section 301 (USTR) và văn bản thuế quan, trừng phạt của Tổng thống, đánh dấu mục nhắc tới Việt Nam.

Lịch bầu cử nằm ở BR-10. Số tàu qua Hormuz cũng hiện trên thẻ chủ đề Năng lượng vùng Vịnh (BR-24).

**User story:** Là người đầu tư, tôi muốn thấy tuyến vận tải nào đang bị chặn, căng thẳng đang dồn về nước nào và Washington vừa trừng phạt hay đánh thuế ai, để hiểu cú sốc giá năng lượng và rủi ro cho hàng xuất khẩu Việt Nam mà không phải đọc hết tin.

**Tiêu chí nghiệm thu:**
- Số tàu là trung bình 7 ngày, có ngày của số liệu (PortWatch cập nhật hằng tuần); eo biển chưa bằng một nửa năm trước được đánh dấu bằng chấm và chữ, không chỉ bằng màu.
- Chỉ số theo nước có chú giải, tooltip từng ô và cột số của tháng mới nhất; ghi rõ bộ số không có Iran.
- Văn bản của Mỹ có ngày, cơ quan và link gốc; tiêu đề được dịch ở trang tiếng Việt.
- Nguồn hỏng (đổi cấu trúc trang OFAC, PortWatch ngừng cập nhật) thì báo lỗi nguồn, không hiện dữ liệu cũ như mới.

**Ngoài phạm vi:** hành động trừng phạt của EU, Anh, Liên Hợp Quốc; lớp mất Internet (IODA, xem `TODO.md`); chỉ số GPR cho Iran (bộ số không có).

