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

## Trang Vĩ mô thế giới (BR-21)

Tên, câu giải thích và ngưỡng nằm trong `config/series.ts` (8 ô hàng đầu) và `config/macro.ts` (cột của bảng sức khoẻ); quy tắc tô màu nằm trong `lib/signals/macro.ts`.

**Hàng đầu: Nhịp kinh tế thế giới**

| Chỉ số | Là gì | Tăng là… | Ngưỡng | Nguồn · tần suất |
|---|---|---|---|---|
| **Tăng trưởng GDP thế giới** | Ước tính năm nay của IMF, gia quyền theo PPP | Tốt | ⚠️ < 2,5% (thường coi là suy thoái toàn cầu); 🛑 < 2% | IMF WEO `NGDP_RPCH` nhóm `WEOWORLD` · năm |
| **Lạm phát thế giới** | Ước tính năm nay của IMF | Xấu | ⚠️ > 5%; 🛑 > 7% | IMF WEO `PCPIPCH` `WEOWORLD` · năm |
| **Chỉ số giá hàng hoá IMF** | Năng lượng, kim loại, lương thực (2016 = 100) | Trung tính | — | FRED `PALLFNFINDEXM` · tháng |
| **GSCPI** | Áp lực chuỗi cung ứng | Xấu | ⚠️ > 1; 🛑 > 2 | NY Fed · tháng |
| **USD rổ rộng** | USD so với 26 đối tác thương mại | Xấu với phần còn lại của thế giới | — | FRED `DTWEXBGS` · ngày |
| **Thanh khoản NHTW toàn cầu** | Bảng cân đối Fed + ECB + BOJ, quy USD | Tốt (bơm tiền) | — | Tự tính từ FRED `WALCL`, `ECBASSETSW`, `JPNASSETS`, `DEXUSEU`, `DEXJPUS` · tuần |
| **Xác suất suy thoái Mỹ 12 tháng** | Mô hình probit của NY Fed: Φ(−0,5333 − 0,6330 × chênh lệch 10Y–3M bình quân tháng) | Xấu | ⚠️ > 30%; 🛑 > 50% | Tự tính từ FRED `T10Y3M` · tháng |
| **Bất định chính sách toàn cầu** | Chỉ số GEPU, 21 nước, gia quyền GDP | Xấu | — | FRED `GEPUCURRENT` · tháng |

**Bảng sức khoẻ các nền kinh tế** (15 nước cộng Việt Nam; hàng Việt Nam chưa có lợi suất 10 năm và không có chỉ báo sớm)

| Cột | Là gì | Tô màu | Nguồn · tần suất |
|---|---|---|---|
| GDP so cùng kỳ | Tăng trưởng GDP thực quý gần nhất | 🛑 < 0; ⚠️ thấp hơn trung bình 2015–19 của nước đó 1,5 điểm % | OECD QNA · quý; Việt Nam: World Bank GEM · quý (thiếu thì IMF năm) |
| CPI so cùng kỳ | Lạm phát tháng gần nhất | ✅ cách mục tiêu NHTW ≤ 1 điểm %; ⚠️ cao hơn 1–3 điểm % hoặc giảm phát; 🛑 cao hơn > 3 điểm % | OECD hoặc IMF CPI · tháng, lấy nguồn mới hơn (thiếu thì IMF năm) |
| Thất nghiệp | Tỷ lệ thất nghiệp | ⚠️/🛑 cao hơn mức thấp nhất 12 tháng 0,5/1 điểm % (logic quy tắc Sahm) | OECD · tháng (thiếu thì IMF năm, không tô) |
| Lãi suất điều hành | Euro dùng chung lãi suất ECB; Việt Nam là lãi suất tái cấp vốn | — | BIS · ngày; Việt Nam: NHNN, khai báo trong `config/policy-rates.ts` |
| Lãi suất thực | Lãi suất điều hành − CPI | — (dương = thắt, âm = nới) | Tính |
| Lợi suất 10 năm | Trái phiếu chính phủ | — | OECD · tháng; Mỹ FRED `DGS10`, Indonesia CNBC · ngày |
| Tỷ giá so USD từ đầu năm | Dương = đồng nội tệ mạnh lên; hàng Mỹ là DXY | ⚠️ mất giá ≥ 5%; 🛑 ≥ 10% | Yahoo · 3 phút |
| Chỉ báo sớm | CLI OECD (100 = xu hướng), mũi tên = hướng 3 tháng | ⚠️ dưới 100 và còn giảm | OECD · tháng |
| Nợ công | Nợ gộp chính phủ, % GDP | ⚠️ > 90%; 🛑 > 120% | IMF WEO · năm |
| Vãng lai | Cán cân vãng lai, % GDP | ⚠️ < −3%; 🛑 < −5% | IMF WEO · năm |

Mục tiêu lạm phát dùng để tô cột CPI khai báo trong `config/countries.ts` (`cpiTarget`): 2% cho phần lớn nước phát triển và Trung Quốc, Úc và Indonesia 2,5%, Brazil và Mexico 3%, Ấn Độ 4%, Việt Nam 4,5%.

**Đồng hồ chu kỳ:** CLI > 100 và tăng = Mở rộng; > 100 và giảm = Chậm lại; < 100 và giảm = Suy yếu; < 100 và tăng = Phục hồi. Hướng tính theo thay đổi 3 tháng.

**Panel theo chủ đề (Phase 2).** Ô KPI của Mỹ khai báo trong `config/series.ts` (`MACRO_US`, `RECESSION_SIGNALS` ở `config/macro.ts`); ⚠️/🛑 là ngưỡng theo dõi/báo động trong `threshold`.

| Panel | Chỉ số | Là gì | Ngưỡng | Nguồn · tần suất |
|---|---|---|---|---|
| Tăng trưởng | **WEI** | Chỉ số kinh tế tuần của Fed New York, quy về tăng trưởng GDP so cùng kỳ | ⚠️ < 1%; 🛑 < 0 | FRED `WEI` · tuần |
| Tăng trưởng | **CFNAI** | 85 chỉ số tháng; 0 = tăng trưởng đúng xu hướng | ⚠️ < −0,35; 🛑 < −0,7 | FRED `CFNAI` · tháng |
| Tăng trưởng | **Sản xuất công nghiệp** | So cùng kỳ | ⚠️ < 0; 🛑 < −3% | FRED `INDPRO` · tháng |
| Tăng trưởng | **Bán lẻ** | So cùng kỳ, danh nghĩa | ⚠️ < 2%; 🛑 < 0 | FRED `RSAFS` · tháng |
| Tăng trưởng | **CLI các nước** | Chỉ báo sớm OECD, 24 tháng, đường 100; kèm GDP quý | — | OECD · tháng |
| Lạm phát | **CPI lõi Mỹ** | Trừ lương thực và năng lượng, so cùng kỳ | ⚠️ > 3%; 🛑 > 4% | FRED `CPILFESL` · tháng |
| Lạm phát | **PCE lõi Mỹ** | Thước đo Fed dùng cho mục tiêu 2% | ⚠️ > 2,75%; 🛑 > 3,5% | FRED `PCEPILFE` · tháng |
| Lạm phát | **Giá lương thực IMF** | 2016 = 100 | — | FRED `PFOODINDEXM` · tháng |
| Lạm phát | **CPI các nước** | So cùng kỳ, đường đứt = mục tiêu NHTW, tô như cột CPI của bảng sức khoẻ | như cột CPI | OECD · tháng |
| Tiền tệ | **Thanh khoản ròng Mỹ** | `WALCL − RRPONTSYD − WTREGEN`, $ tỷ | — | Tự tính từ FRED · tuần |
| Tiền tệ | **NFCI** | Điều kiện tài chính Fed Chicago; 0 = trung bình, dương = thắt | ⚠️ > 0; 🛑 > 0,5 | FRED `NFCI` · tuần |
| Tiền tệ | **Lợi suất thực 10 năm** | TIPS 10 năm | ⚠️ > 2%; 🛑 > 2,5% | FRED `DFII10` · ngày |
| Tiền tệ | **Lãi suất điều hành và lãi suất thực các nước** | Cuối mỗi tháng; lãi suất thực = điều hành − CPI tháng đó | — | BIS `WS_CBPOL` + OECD · tháng |
| Tiền tệ | **Tỷ giá thực hiệu dụng** | So với trung bình 10 năm; dương = đắt hơn thường lệ | — | BIS `WS_EER` (thực, rổ rộng) · tháng |
| Việc làm | **Việc làm phi nông nghiệp** | Số việc làm tăng thêm trong tháng | ⚠️ < 50K; 🛑 < 0 | FRED `PAYEMS` · tháng |
| Việc làm | **Thất nghiệp Mỹ** | Tỷ lệ thất nghiệp | — (xem Sahm) | FRED `UNRATE` · tháng |
| Việc làm | **Niềm tin tiêu dùng UMich** | 1966 = 100 | — | FRED `UMCSENT` · tháng |
| Việc làm | **Thất nghiệp các nước** | 24 tháng, tô như cột thất nghiệp của bảng sức khoẻ | như cột thất nghiệp | OECD · tháng |
| Việc làm | **Niềm tin người tiêu dùng / doanh nghiệp** | CCI / BCI, 100 = trung bình dài hạn, mũi tên = hướng 3 tháng | — | OECD `DF_CLI` · tháng |
| Nợ | **Nợ liên bang Mỹ** | % GDP | — | FRED `GFDEGDQ188S` · quý |
| Nợ | **Chi trả lãi của chính phủ Mỹ** | $ tỷ, quy năm | — | FRED `A091RC1Q027SBEA` · quý |
| Nợ | **Chênh lệch tín dụng IG / EM** | So với trái phiếu chính phủ | IG ⚠️ > 1,5%, 🛑 > 2%; EM ⚠️ > 3,5%, 🛑 > 5% | FRED `BAMLC0A0CM`, `BAMLEMCBPIOAS` · ngày |
| Nợ | **Cân đối ngân sách** | % GDP, ước tính năm nay | ⚠️ thâm hụt > 3%; 🛑 > 6% | IMF `GGXCNL_NGDP` · năm |
| Nợ | **Khoảng trống tín dụng/GDP** | Tín dụng tư nhân/GDP trừ xu hướng dài hạn, điểm % | ⚠️ > 2; 🛑 > 10 (ngưỡng đệm phản chu kỳ Basel III) | BIS `WS_CREDIT_GAP` · quý |
| Suy thoái | **Chauvet–Piger** | Xác suất Mỹ đang suy thoái | ⚠️ > 20%; 🛑 > 50% | FRED `RECPROUSM156N` · tháng |
| Suy thoái | **Đường cong 10Y−3M** | Biến số của mô hình NY Fed | ⚠️ < 0; 🛑 < −0,5 | FRED `T10Y3M` · ngày |
| Suy thoái | **Số nước có CLI ở pha Suy yếu** | Trên số nước có CLI | ⚠️ ≥ ⅓; 🛑 ≥ ½ | Tính từ OECD · tháng |

Bảng Tín hiệu suy thoái còn dùng lại xác suất suy thoái NY Fed, Sahm, 2s10s và claims đã có ở trên.

## Trang Công nghệ (BR-23)

Tên và câu giải thích nằm trong `config/series.ts` (hai ô chỉ số) và `config/tech.ts` (danh sách cổ phiếu, trang trạng thái).

| Chỉ số | Là gì | Tăng là… | Ngưỡng | Nguồn · tần suất |
|---|---|---|---|---|
| **Nasdaq Composite** | Chỉ số nặng về công nghệ (đã có ở Vital Signs) | Tốt | — | Yahoo · 3 phút |
| **SOX** (chỉ số bán dẫn Philadelphia) | 30 công ty chip lớn nhất niêm yết ở Mỹ; thước đo thị trường sát nhất cho nhu cầu phần cứng AI và chu kỳ điện tử | Tốt | — (vẫn vào bộ dò "Điểm đáng chú ý" khi dao động bất thường hoặc chạm đỉnh/đáy 1 năm) | Yahoo · 3 phút |
| **Cổ phiếu công nghệ** (20 mã) | Big Tech Mỹ, chuỗi bán dẫn, Samsung, SK hynix, Tencent, Alibaba, FPT, CMC: % hôm nay, 30 ngày, từ đầu năm, vốn hoá quy USD | — | — | Yahoo · 3 phút (lịch sử 1 giờ) |
| **Dịch vụ đang báo sự cố** | Số trong 8 đám mây và dịch vụ AI/lập trình có sự cố đang mở | Xấu | Mỗi dịch vụ theo mức của chính nhà cung cấp | Trang trạng thái công khai · 10 phút |
| **Model AI mới** | Số model OpenRouter đưa lên trong 30 ngày, số mở trọng số, giá mỗi triệu token | — | — | OpenRouter · 6 giờ |
| **Lỗ hổng đang bị khai thác** | Số mục CISA thêm vào danh mục KEV trong 30 ngày, số dùng trong ransomware | Xấu | — | CISA KEV · 6 giờ |

## Ghi chú cách hiển thị

- **Delta** hiển thị theo đơn vị phù hợp với từng chỉ số:
  - chỉ số và giá: thay đổi %;
  - lợi suất và spread: thay đổi theo **điểm %** (hoặc bps);
  - FX: thay đổi %.
- **Kỳ dữ liệu:** series tháng/quý phải hiện kỳ (ví dụ "T9/2026") để tránh hiểu nhầm là số liệu hôm nay.
- **Ngưỡng theo khoảng thời gian** ("trong 1 tuần", "trong 1 tháng") được tính từ `observations` theo phiên/ngày gần nhất.
