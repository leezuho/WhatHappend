# 04 — Danh mục chỉ số

> Phiên bản 0.2 · Ngày 2026-10-31 · Trạng thái: Đã triển khai
> Liên quan: [02 Yêu cầu nghiệp vụ](02-business-requirements.md) · [LLDD 06 Risk Regime](../TechDesign/LLDD/06-risk-regime.md) · LLDD 02 Data sources (đang viết)

Danh mục giải thích **ý nghĩa, cách đọc và ngưỡng cảnh báo** của từng chỉ số. Đây là nội dung nguồn cho phần giải thích song ngữ trong drawer chi tiết (BR-18) và cho cấu hình ngưỡng. Trong code, tên song ngữ, câu giải thích, cực tính và ngưỡng cảnh báo được khai báo trong `config/series.ts` (`SERIES`); một số ngưỡng ở đây chỉ mang tính tham khảo, chưa được cài vào cảnh báo.

**Ký hiệu:**
- Tầng: **T1** = Vital Signs, **T2** = Bối cảnh.
- "Tăng là…": cho biết màu delta. **Tốt** tô `--up`, **Xấu** tô `--down`, **Trung tính** tô màu ink.
- Ngưỡng: ⚠️ cảnh báo (warning), 🛑 nghiêm trọng (critical). Trạng thái luôn kèm nhãn chữ, không chỉ dùng màu.
- Nguồn và tần suất mang tính dự kiến; endpoint cụ thể chốt ở LLDD 02.
- Mọi ngưỡng là **quy ước tham khảo** dùng để làm nổi bật trên dashboard, không phải khuyến nghị đầu tư.

---

## Câu hỏi 1 — Tiền đang đắt hay rẻ? (lãi suất)

| Chỉ số | Tầng | Là gì | Vì sao chuyên gia theo dõi | Tăng là… | Ngưỡng | Nguồn · tần suất |
|---|---|---|---|---|---|---|
| **US10Y** | T1 | Lợi suất trái phiếu chính phủ Mỹ kỳ hạn 10 năm | "Giá của tiền" toàn cầu, làm chuẩn định giá cho cổ phiếu, nhà đất và tín dụng | Trung tính (tăng nhanh thường gây áp lực lên tài sản rủi ro) | ⚠️ biến động > 0,25 điểm % trong 1 tuần | Yahoo `^TNX` (trong ngày), FRED `DGS10` (ngày) |
| **US2Y** | T2 | Lợi suất kỳ hạn 2 năm | Phản ánh kỳ vọng về lãi suất Fed trong 1–2 năm tới | Trung tính | — | FRED `DGS2` · ngày |
| **2s10s** | T1 | US10Y − US2Y | Đường cong lợi suất. **Âm (đảo ngược)** là tín hiệu suy thoái kinh điển, thường xuất hiện 6–24 tháng trước suy thoái | Trung tính | ⚠️ < 0 "Đảo ngược"; ⚠️ dốc lên nhanh trở lại từ vùng âm (thường xảy ra ngay trước hoặc trong suy thoái) | FRED `T10Y2Y` · ngày |
| **Lợi suất thực 10Y** | T2 | Lợi suất TIPS 10 năm (lợi suất đã trừ lạm phát kỳ vọng) | Chi phí vốn thực. Lợi suất thực cao gây áp lực lên vàng và cổ phiếu tăng trưởng | Trung tính | — | FRED `DFII10` · ngày |
| **Fed funds** | T2 | Lãi suất điều hành của Fed | Chính sách tiền tệ của nền kinh tế lớn nhất thế giới | Trung tính | — | FRED `FEDFUNDS` · tháng |
| **Kỳ vọng về Fed** | T2 | Xác suất thị trường gán cho quyết định của Fed ở kỳ họp tới | Thị trường định giá trước những gì Fed sẽ làm | — | — | Polymarket / Kalshi · 15 phút |
| **Bảng cân đối Fed (WALCL)** | T2 | Tổng tài sản của Fed | QE (tăng) bơm thanh khoản; QT (giảm) rút thanh khoản | Tăng = nới lỏng | — | FRED `WALCL` · tuần |
| **Lãi suất điều hành các NHTW lớn** | T2 | Fed, ECB, BOJ, BoE, PBoC, NHNN… | So sánh mức độ thắt/nới giữa các nước; chênh lệch lãi suất ảnh hưởng tỷ giá | Trung tính | — | BIS policy rates · ngày/tháng |

## Câu hỏi 2 — USD mạnh hay yếu?

| Chỉ số | Tầng | Là gì | Vì sao chuyên gia theo dõi | Tăng là… | Ngưỡng | Nguồn · tần suất |
|---|---|---|---|---|---|---|
| **DXY** | T1 | Sức mạnh của USD so với rổ 6 đồng tiền lớn (EUR chiếm khoảng 58%) | USD mạnh = điều kiện tài chính toàn cầu thắt lại, các thị trường mới nổi bị rút vốn, hàng hóa định giá bằng USD giảm | Xấu với rủi ro toàn cầu (tô `--down`) | ⚠️ thay đổi ±3% trong 1 tháng; 🛑 ±5% | Yahoo `DX-Y.NYB` · 3 phút |
| **USD/VND** | T1 | Tỷ giá đô la Mỹ/đồng | Áp lực tỷ giá lên Việt Nam, giá nhập khẩu, dư địa chính sách của NHNN | Xấu với VND | ⚠️ tăng > 1% trong 1 tháng | Yahoo / Vietcombank · 1 giờ |
| **USD/CNY** | T2 | Tỷ giá nhân dân tệ | Trung Quốc điều tiết tỷ giá; CNY yếu xuất khẩu giảm phát và gây áp lực cạnh tranh lên khu vực | Trung tính | ⚠️ biến động > 1% trong 1 tuần | Yahoo · 3 phút |
| **USD/JPY** | T2 | Tỷ giá yên Nhật | JPY là đồng tiền tài trợ cho carry trade; JPY tăng mạnh đột ngột thường đi kèm bán tháo toàn cầu | Trung tính | ⚠️ biến động > 3% trong 1 tuần | Yahoo · 3 phút |

## Câu hỏi 3 — Thị trường đang sợ hay tham?

| Chỉ số | Tầng | Là gì | Vì sao chuyên gia theo dõi | Tăng là… | Ngưỡng | Nguồn · tần suất |
|---|---|---|---|---|---|---|
| **S&P 500** | T1 | 500 cổ phiếu lớn của Mỹ | Thước đo chung của thị trường cổ phiếu toàn cầu | Tốt | ⚠️ giảm > 2% trong ngày; 🛑 giảm > 10% từ đỉnh (điều chỉnh) | Yahoo `^GSPC` · 3 phút |
| **Nasdaq** | T1 | Chỉ số nặng về công nghệ | Khẩu vị với tăng trưởng và AI; nhạy với lãi suất | Tốt | ⚠️ giảm > 2,5% trong ngày | Yahoo `^IXIC` · 3 phút |
| **VIX** | T1 | Biến động kỳ vọng 30 ngày của S&P 500, gọi là "chỉ số sợ hãi" | Đo mức sợ hãi của thị trường cổ phiếu | Xấu | ⚠️ > 25; 🛑 > 35 (hoảng loạn, ghi đè Risk Regime) | Yahoo `^VIX` · 3 phút |
| **MOVE** | T2 | "VIX của trái phiếu" Mỹ | Biến động trái phiếu cao làm toàn bộ hệ thống tài chính bất ổn | Xấu | ⚠️ > 120; 🛑 > 150 | Yahoo `^MOVE` · 3 phút |
| **HY OAS** | T2 | Chênh lệch lợi suất trái phiếu doanh nghiệp rủi ro cao so với trái phiếu chính phủ | Thị trường tín dụng thường "đánh hơi" khủng hoảng **trước** cổ phiếu | Xấu | ⚠️ > 5%; 🛑 > 7% | FRED `BAMLH0A0HYM2` · ngày |
| **STLFSI** | T2 | Chỉ số căng thẳng tài chính của Fed St. Louis (0 = trung bình lịch sử) | Gộp 18 chỉ báo thị trường thành 1 con số | Xấu | ⚠️ > 0 (trên trung bình); 🛑 > 2 | FRED `STLFSI4` · tuần |
| **BTC** | T1 | Giá Bitcoin | Khẩu vị rủi ro đầu cơ và thanh khoản; giao dịch 24/7 nên phản ứng trước khi các sàn mở cửa | Tốt (với khẩu vị rủi ro) | ⚠️ biến động > 8% trong ngày | Yahoo `BTC-USD` · 3 phút |
| **Risk Regime** | T1 | Chỉ báo tổng hợp từ VIX, HY OAS, DXY, 2s10s | Một tín hiệu duy nhất: risk-on / neutral / risk-off | — | Xem [LLDD 06](../TechDesign/LLDD/06-risk-regime.md) | Tính từ DB |

## Câu hỏi 4 — Kinh tế đang tăng tốc hay chậm lại?

| Chỉ số | Tầng | Là gì | Vì sao chuyên gia theo dõi | Tăng là… | Ngưỡng | Nguồn · tần suất |
|---|---|---|---|---|---|---|
| **CPI Mỹ** | T2 | Chỉ số giá tiêu dùng (so cùng kỳ) | Quyết định hướng đi của Fed | Xấu khi vượt mục tiêu 2% | ⚠️ > 3% so cùng kỳ; 🛑 > 5% | FRED `CPIAUCSL` · tháng |
| **Kỳ vọng lạm phát 5Y5Y** | T2 | Lạm phát kỳ vọng bình quân 5 năm, tính từ 5 năm sau | Đo niềm tin vào Fed; nếu mất "neo" thì Fed phải thắt mạnh hơn | Xấu | ⚠️ > 2,6%; 🛑 > 3% | FRED `T5YIFR` · ngày |
| **Initial jobless claims** | T2 | Số đơn xin trợ cấp thất nghiệp lần đầu trong tuần | Chỉ báo **sớm nhất** về thị trường lao động (có hàng tuần) | Xấu | ⚠️ trung bình 4 tuần tăng > 20% so với đáy 1 năm; 🛑 > 300K | FRED `ICSA` · tuần |
| **Sahm rule** | T2 | Trung bình 3 tháng của tỷ lệ thất nghiệp trừ mức thấp nhất trong 12 tháng | Từng báo đúng mọi cuộc suy thoái Mỹ kể từ 1970 | Xấu | ⚠️ ≥ 0,3; 🛑 ≥ 0,5 (tín hiệu suy thoái) | FRED `SAHMREALTIME` · tháng |
| **GDPNow** | T2 | Ước tính GDP quý hiện tại theo thời gian thực (Fed Atlanta) | Nắm tăng trưởng trước khi số liệu chính thức công bố | Tốt | ⚠️ < 1%; 🛑 < 0% | FRED `GDPNOW` · khi có cập nhật |
| **Giá đồng ("Dr. Copper")** | T1 | Giá đồng (USD/lb) | Đồng có mặt khắp nơi trong công nghiệp và xây dựng nên là chỉ báo nhu cầu toàn cầu, đặc biệt của Trung Quốc | Tốt (với tăng trưởng) | ⚠️ giảm > 10% trong 1 tháng | Yahoo `HG=F` · 3 phút |
| **GSCPI** | T2 | Chỉ số áp lực chuỗi cung ứng toàn cầu (Fed New York), 0 = trung bình | Đo nút thắt chuỗi cung ứng, một nguồn lạm phát chi phí đẩy | Xấu | ⚠️ > 1; 🛑 > 2 | NY Fed (file xlsx) · tháng |
| **Lạm phát và GDP theo quốc gia** | T2 | Lạm phát và tăng trưởng GDP của Mỹ, Trung Quốc, Nhật, Đức, Anh, Ấn Độ, Việt Nam, Brazil… | So sánh chu kỳ giữa các nền kinh tế; có dự báo của IMF | Lạm phát cao = xấu; GDP tăng = tốt | — | World Bank (năm), IMF DataMapper (năm, có dự báo) |

## Câu hỏi 5 — Rủi ro và bất định đang ở mức nào?

| Chỉ số | Tầng | Là gì | Vì sao chuyên gia theo dõi | Tăng là… | Ngưỡng | Nguồn · tần suất |
|---|---|---|---|---|---|---|
| **Dầu Brent** | T1 | Giá dầu chuẩn quốc tế | Nhạy với Trung Đông, eo Hormuz, OPEC+; đầu vào chính của lạm phát | Xấu (với lạm phát và nước nhập khẩu dầu như Việt Nam) | ⚠️ tăng > 10% trong 1 tuần; ⚠️ > 100 USD | Yahoo `BZ=F` · 3 phút |
| **Vàng** | T1 | Giá vàng (USD/oz) | Tài sản trú ẩn; NHTW mua vàng để giảm phụ thuộc USD | Trung tính (tăng mạnh = tâm lý sợ hãi hoặc lo ngại mất giá tiền tệ) | ⚠️ biến động > 3% trong ngày | Yahoo `GC=F` · 3 phút |
| **GPR (Geopolitical Risk Index)** | T2 | Chỉ số rủi ro địa chính trị đo bằng tần suất từ khóa căng thẳng trên báo (Caldara–Iacoviello) | Định lượng căng thẳng địa chính trị | Xấu | ⚠️ trung bình 7 ngày > 1,5 × trung bình 1 năm | File xls của tác giả · ngày |
| **EPU (Economic Policy Uncertainty)** | T2 | Chỉ số bất định chính sách kinh tế Mỹ (dựa trên báo chí) | Bất định chính sách làm doanh nghiệp hoãn đầu tư | Xấu | ⚠️ > 1,5 × trung bình 1 năm | FRED `USEPUINDXD` · ngày |
| **Điểm nóng xung đột** | T2 | Sự kiện có tọa độ từ tin tức và GDELT | Bối cảnh địa lý của rủi ro | — | — | GDELT · 30 phút |
| **Bầu cử và sự kiện chính trị sắp tới** | T2 | Danh sách do người dùng tự cập nhật, kèm xác suất từ prediction markets | Chuẩn bị trước cho biến động | — | — | `config/elections` + Polymarket/Kalshi |

## Góc Việt Nam

| Chỉ số | Tầng | Là gì | Cách đọc | Ngưỡng | Nguồn · tần suất |
|---|---|---|---|---|---|
| **VN-Index** | T1 | Chỉ số chứng khoán sàn HOSE | Tăng là tốt | ⚠️ giảm > 3% trong ngày | Endpoint công khai không chính thức · 3 phút |
| **Giá vàng SJC** | T2 | Giá mua/bán vàng miếng SJC | Chênh lệch với giá vàng thế giới (quy đổi) phản ánh cung cầu trong nước | ⚠️ chênh lệch với giá thế giới > 15% | Scrape SJC · 30 phút |
| **USD/VND (Vietcombank)** | T2 | Tỷ giá mua/bán niêm yết | So sánh với tỷ giá thị trường quốc tế | — | Vietcombank · 1 giờ |

## Ghi chú cách hiển thị

- **Delta** hiển thị theo đơn vị phù hợp với từng chỉ số:
  - chỉ số và giá: thay đổi %;
  - lợi suất và spread: thay đổi theo **điểm %** (hoặc bps);
  - FX: thay đổi %.
- **Kỳ dữ liệu:** series tháng/quý phải hiện kỳ (ví dụ "T9/2026") để tránh hiểu nhầm là số liệu hôm nay.
- **Ngưỡng theo khoảng thời gian** ("trong 1 tuần", "trong 1 tháng") được tính từ `observations` theo phiên/ngày gần nhất.
