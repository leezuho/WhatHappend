# TODO

Việc đã chốt nhưng để làm sau. Thiết kế chung của trang Vĩ mô ở BRD-21 (`BRD/02-business-requirements.md`) và LLDD 04 §3b.

## Review nội dung từng trang (2026-11-10)

Đọc lại 5 trang trên dữ liệu thật, tìm thông tin giá trị còn thiếu và chỗ một biểu đồ nói được nhiều hơn bảng hay số đơn lẻ. "Có sẵn" = dữ liệu đã nằm trong DB, chỉ cần query và giao diện. Endpoint ghi "thử 2026-11-10" là đã gọi thật, không cần key.

Đã làm trong lượt review:

- [x] **Thị trường thế giới** trên trang Tổng quan: 20 chỉ số chứng khoán chính (Mỹ, Canada, Brazil, Mexico, khu vực euro, Đức, Pháp, Ý, Anh, Nhật, Hàn, Đài Loan, Trung Quốc, Hồng Kông, Ấn Độ, Úc, Indonesia, Việt Nam), % phiên, 1 tuần, 1 tháng, từ đầu năm tô nền theo mức, sparkline 1 năm. Trước đó trang chủ chỉ có chỉ số Mỹ và VN-Index.
- [x] **Lạm phát và lãi suất điều hành** (trang chủ) dùng CPI tháng mới nhất thay cho ước tính năm của IMF. Trước đó lãi suất thực ở trang chủ lệch so với trang Vĩ mô (khu vực euro −0,6% so với −1,3%, Việt Nam −0,2% so với −0,6%).
- [x] **Giá trị khớp lệnh HOSE** cạnh dòng độ rộng (SSI đã trả `totalValue` nhưng chưa hiện).
- [x] **Top đồng coin** bỏ token neo giá quanh $1 như Figure Heloc (đứng #9, giá $1,04, gần như không biến động).

### Tổng quan

- [ ] **Lịch: số thực tế và độ lệch so với dự báo.** Panel chỉ có dự báo và kỳ trước vì JSON của ForexFactory không có trường actual. Ý chính của lịch kinh tế là "cao hay thấp hơn dự báo". Cách rẻ: map các sự kiện Mỹ (CPI, Core CPI, NFP, thất nghiệp, Claims, GDP, PCE) sang series FRED đã có, sau giờ công bố thì hiện số thực tế và tô màu theo độ lệch.
- [x] **Bảng Hàng hoá** cạnh Thị trường thế giới: dầu WTI `CL=F`, khí Henry Hub `NG=F`, khí châu Âu `TTF=F`, bạc `SI=F`, lúa mì `ZW=F`, ngô `ZC=F` (Yahoo, thử 2026-11-10), cùng kiểu cột phiên / tuần / tháng / từ đầu năm. Năng lượng và lương thực là kênh lạm phát chính của các nước mới nổi, kể cả Việt Nam. Xong 2026-11-10: 11 mặt hàng, thêm gạo `ZR=F` và cà phê `KC=F` vì Việt Nam xuất khẩu nhiều.
- [x] **Biểu đồ lịch sử 2s10s và 10Y−3M (2 năm)** dưới đường cong lợi suất. Panel chỉ cho thấy hình dạng hôm nay, trong khi tín hiệu nằm ở quá trình đảo ngược rồi hết đảo ngược (suy thoái thường bắt đầu sau khi hết đảo ngược). Có sẵn: `fred:T10Y2Y`, `fred:T10Y3M`. Xong 2026-11-10, kèm dòng "dương/đảo ngược từ ngày X" cho từng chênh lệch.
- [x] **Biểu đồ hiệu suất các lớp tài sản từ đầu năm**: cột ngang cho cổ phiếu Mỹ, cổ phiếu thế giới, trái phiếu 10 năm, vàng, dầu, đồng, USD, Bitcoin, VN-Index. Trả lời câu "năm nay cái gì thắng". Có sẵn. Xong 2026-11-10; cổ phiếu thế giới, mới nổi và trái phiếu dùng ETF `ACWI`, `EEM`, `IEF` (chỉ tính giá).

### Vĩ mô thế giới

- [x] **Biểu đồ tăng trưởng – lạm phát bốn góc phần tư** (scatter): trục x là GDP so cùng kỳ so với mức bình thường của nước đó, trục y là CPI trừ mục tiêu, mỗi nền kinh tế một chấm, kèm đuôi 4 quý. Các góc lần lượt là ổn định, quá nóng, đình lạm và suy yếu, nên đọc được nhanh hơn hai cột tương ứng trong bảng sức khoẻ. Có sẵn (dữ liệu của bảng sức khoẻ). Xong 2026-11-10; đuôi 4 quý chỉ hiện khi rê chuột, vẽ hết một lúc thì rối thành búi.
- [x] **Biểu đồ nợ công so với cân đối ngân sách** (scatter, IMF 2026): góc nợ cao và thâm hụt lớn là vùng rủi ro tài khoá (Mỹ, Pháp, Brazil, Trung Quốc). Hiện bảng có hai cột tách rời. Có sẵn; muốn vẽ kích thước bong bóng theo GDP thì thêm IMF `NGDPD`. Xong 2026-11-10, chưa có kích thước bong bóng.
- [ ] **Thị trường đang định giá Fed cắt hay tăng bao nhiêu**: lợi suất 1 năm hoặc 2 năm trừ lãi suất Fed hiệu dụng ra số bp kỳ vọng trong 12 tháng (cần thêm FRED `DFF` theo ngày), hoặc lấy đường đi theo từng cuộc họp từ Kalshi khi nguồn này chạy lại. Đây là con số giới đầu tư nhìn trước tiên sau mỗi lần CPI.
- [ ] **Phân rã lạm phát Mỹ**: CPI so cùng kỳ theo nhóm năng lượng, thực phẩm, hàng hoá lõi, nhà ở, dịch vụ trừ nhà ở (FRED `CPIENGSL`, `CPIUFDSL`, `CUSR0000SACL1E`, `CUSR0000SAH1`, `CUSR0000SASLE`), vẽ small multiples hoặc cột. Cho biết lạm phát dai dẳng nằm ở đâu.
- [ ] **Lịch vĩ mô quá ngắn:** panel mở 28 ngày nhưng ngoài tuần này chỉ còn lịch NHTW, vì ForexFactory chỉ có `ff_calendar_thisweek.json` (`nextweek` trả 404, thử 2026-11-10) và lịch ICS của BLS trả 403. Hướng thay: API lịch công bố của FRED (cần key miễn phí) hoặc tự khai ngày CPI/NFP/GDP/PCE trong `config/` giống `config/central-banks.ts`.
- [ ] Chưa xem được Đồng hồ chu kỳ và Bản đồ thế giới bằng ảnh chụp headless (hai biểu đồ chỉ vẽ sau khi đo kích thước ở client), nên lượt review này chưa đánh giá phần hình của chúng.

### Việt Nam

Trang mỏng nhất: 5 panel, phần lớn là bảng tĩnh và không có biểu đồ lịch sử.

- [ ] **Khối ngoại mua/bán ròng HOSE**, chỉ số giới đầu tư Việt Nam xem hằng ngày. Response SSI hiện dùng đã có `totalBuyForeignQtty` / `totalSellForeignQtty` nhưng chỉ là khối lượng cổ phiếu. Cần dò endpoint có giá trị VND (SSI iBoard, VNDirect `api-finfo.vndirect.com.vn`, DNSE) và lịch sử theo ngày.
- [ ] **Biểu đồ chênh lệch vàng SJC so với thế giới theo thời gian.** Đây là câu chuyện chính của giá vàng trong nước (hôm nay +13,8 triệu, +10,9%), nhưng panel chỉ có con số hôm nay. Vàng thế giới và USD/VND có 1 năm; giá SJC chỉ có từ 2026-10-31 vì vang.today không có lịch sử. Biểu đồ sẽ dài dần, hoặc tìm thêm nguồn lịch sử SJC.
- [ ] **Ba giá đô trên một biểu đồ**: Yahoo/liên ngân hàng, Vietcombank bán ra, USDT P2P, kèm đường chênh lệch P2P so với Vietcombank (cho thấy áp lực tỷ giá ngoài hệ thống). Vietcombank và P2P chỉ có lịch sử từ 31/10 và 3/11, nên cần đợi vài tuần dữ liệu.
- [ ] **Tỷ giá trung tâm NHNN và trần biên độ ±5%**: Vietcombank bán ra còn cách trần bao nhiêu là thước đo áp lực tỷ giá rõ nhất. `sbv.gov.vn` redirect 302 (thử 2026-11-10), cần dò trang hoặc API thật.
- [ ] **Lãi suất liên ngân hàng qua đêm** (NHNN công bố hằng ngày): tín hiệu thanh khoản hệ thống, từng vọt lên trên 10% trong các đợt căng thẳng. Chung hướng dò với tỷ giá trung tâm.
- [ ] **Giá xăng dầu Petrolimex** (RON 95-V, E10, E5 RON 92, DO) và kỳ điều hành hằng tuần: ảnh hưởng trực tiếp đến CPI và chi phí sinh hoạt. Trang chủ `petrolimex.com.vn` trả 200 nhưng giá nạp bằng script, cần tìm API phía sau.
- [x] **VN-Index so với khu vực**: cột ngang từ đầu năm của các chỉ số châu Á, tô nổi VN-Index, còn lại màu xám. Có sẵn sau khi thêm Thị trường thế giới (`getWorldMarkets`). Xong 2026-11-10.
- [x] **Lạm phát và lãi suất tái cấp vốn theo thời gian** (hai đường, lãi suất thực là khoảng giữa). Hiện chỉ có tile riêng lẻ và một dòng chữ. Có sẵn: `imf:CPI_M:VNM` từ 2023, `sbv:REFI` từ 2022. Xong 2026-11-10.
- [x] **Thiên tai gần Việt Nam**: lọc GDACS, EONET, USGS trong khung khoảng 5–25°B, 100–118°Đ (bão, lũ miền Trung) thành một danh sách trên trang này. Có sẵn từ dữ liệu bản đồ. Xong 2026-11-10; bão lấy khung rộng hơn (tới 135°Đ) vì đi từ biển Philippines vào.
- [x] **Lịch thị trường Việt Nam** (2026-11-10): ngày đáo hạn VN30F (thứ Năm thứ ba) và ngày Cục Thống kê công bố số liệu tháng (ngày 6), cùng họp FOMC.
- [ ] Lịch thị trường Việt Nam, phần còn lại: kỳ review FTSE/MSCI và ngày ETF cơ cấu danh mục (cần ngày công bố chính thức, không tự suy). Ngày đáo hạn VN30F chưa lùi khi trùng nghỉ Tết hay Giỗ Tổ; cần khai lịch nghỉ trong `config/`.
- [ ] VN30, HNX-Index, UPCoM và heatmap VN30 (treemap theo vốn hoá, màu theo % ngày): cần dò endpoint SSI cho từng mã.

### Crypto

- [ ] **Lịch sử hợp đồng mở và tỷ lệ long/short trên Binance**: `fapi.binance.com/futures/data/openInterestHist` và `globalLongShortAccountRatio` (`period=1d`, tối đa 30 ngày; thử 2026-11-10). Biểu đồ OI so với giá cho thấy đòn bẩy đang tích tụ; hiện panel chỉ có một con số OI. Thêm lịch sử funding (`fapi/v1/fundingRate`).
- [ ] **Dòng tiền ETF Bitcoin giao ngay** theo ngày, chỉ báo dòng tiền tổ chức được theo dõi nhiều nhất. Farside trả 403 Cloudflare (thử 2026-11-10); cần dò SoSoValue hoặc nguồn khác.
- [x] **Treemap top coin** theo vốn hoá, tô màu theo % 24 giờ hoặc 7 ngày: nhìn một lần biết thị trường đỏ hay xanh và tiền đang vào đâu. Có sẵn. Xong 2026-11-10.
- [x] **Biểu đồ ETH/BTC 1 năm**: thước đo quen thuộc cho mùa altcoin. Có sẵn (`yahoo:ETH-USD`, `yahoo:BTC-USD`). Xong 2026-11-10.
- [ ] **TVL và phí theo chain** từ DefiLlama (`api.llama.fi/v2/chains`, thử 2026-11-10): hoạt động on-chain đang dồn về đâu.

### Công nghệ

- [x] **Trạng thái dịch vụ: tách sự cố kéo dài.** AWS hiện "Gián đoạn lớn" liên tục vì hai sự cố vùng Bahrain và UAE mở từ 1–2/3/2026. Bảng vì thế không trả lời được câu "hôm nay có gì hỏng". Đề xuất: sự cố mở quá 14 ngày xếp vào nhóm "ngừng dài hạn", vẫn liệt kê nhưng không tính vào mức tổng và dòng "N/8 dịch vụ đang báo sự cố". Xong 2026-11-10 (`splitStatus`).
- [ ] **Gom tin trùng** ở các panel tin: tin công nghệ hôm nay có khoảng 10 bài về cùng vụ Jensen Huang. Gom theo cụm (tiêu đề gần giống hoặc cùng thực thể) thành một dòng "N bài", để chỗ cho tin khác.
- [ ] **Model AI: chất lượng so với giá** (scatter giá đầu vào/ra so với điểm benchmark). Bảng OpenRouter hiện chỉ có giá, không cho biết model nào đáng tiền. Cần nguồn điểm: bảng xếp hạng LMArena hoặc API Artificial Analysis (cần key miễn phí), chưa thử.
- [x] **Treemap cổ phiếu công nghệ** theo vốn hoá, màu theo % ngày. Có sẵn từ bảng hiện tại. Xong 2026-11-10, là tab Bản đồ trong panel cổ phiếu.
- [x] **Lỗ hổng KEV theo hãng** (cột ngang 90 ngày: Microsoft, Ivanti, Cisco…): cho thấy sản phẩm nào đang bị nhắm nhiều nhất, thay vì chỉ một danh sách theo ngày. Xong 2026-11-10: nguồn `kev` lưu thêm `kev_vendors` (90 ngày và 1 năm).

## Trang Vĩ mô thế giới: chỗ còn thiếu sau Phase 2

Phase 2 (sáu panel theo chủ đề và Lịch vĩ mô) xong ngày 2026-11-09. Còn lại:

- [x] **CPI tháng cho khu vực euro, Pháp, Ý, Mexico, Nhật** (2026-11-09): nguồn `imfcpi` (IMF CPI dataset, không cần key) có cả 16 nước đến 9/2026; trang lấy số mới hơn giữa OECD và IMF. Lợi suất 10 năm của Indonesia lấy từ CNBC (`cnbc`) vì OECD dừng ở 12/2024.
- [ ] **Lợi suất 10 năm của Việt Nam:** HNX có đường cong lợi suất theo ngày (LLDD 02 §7.5) nhưng `hnx.vn` thiếu chứng chỉ trung gian nên Node không kết nối được. Cần quyết định cách bổ sung chứng chỉ trước khi tích hợp.
- [ ] **Thất nghiệp tháng của Trung Quốc, Ấn Độ, Indonesia, Brazil, Việt Nam:** OECD không có; bộ LS của IMF thì cũ (Brazil 2/2025, Ấn Độ Q4/2025, Việt Nam Q4/2024) hoặc không có. Đang dùng ước tính năm của IMF.
- [ ] **Lịch NHTW:** thêm ngày 2027 của Bank Indonesia và Banxico (thường công bố tháng 12) và của RBI từ tháng 4/2027 (thường công bố tháng 3) vào `config/central-banks.ts`. Ngày LPR đang chỉ lùi qua cuối tuần, chưa tính ngày lễ Trung Quốc; đến hết 2027 không có ngày 20 nào rơi vào kỳ nghỉ lễ (kiểm tra 2026-11-09), nên chưa cần làm trước khi Trung Quốc công bố lịch nghỉ 2028.

## Trang Vĩ mô thế giới: Phase 3

- [x] AI viết nhận định vĩ mô hằng tuần từ các con số trên trang (nguồn `macronote`, LLDD 05 §3b), kèm ngân sách lượt gọi cho gói Gemini miễn phí (LLDD 05 §4.1). Xong 2026-11-09.
- [x] Bản đồ thế giới tô màu theo tăng trưởng GDP hoặc lạm phát (IMF, khoảng 220 nền kinh tế; LLDD 04 §3b). Xong 2026-11-09.

## Trang Công nghệ

Phase 1 xong ngày 2026-11-09 (BR-23, LLDD 04 §3d, nguồn ở LLDD 02 §8b): cổ phiếu công nghệ, trạng thái dịch vụ, model AI mới, nghiên cứu AI, lỗ hổng CISA KEV, Hacker News, tin công nghệ.

Phase 2, phần "insight" (đã thử endpoint ngày 2026-11-09, đều chạy không cần key):

- [ ] **Capex AI của 4 hyperscaler** (MSFT, GOOGL, AMZN, META) theo quý từ SEC EDGAR XBRL (`data.sec.gov/api/xbrl/companyconcept/<CIK>/us-gaap/PaymentsToAcquirePropertyPlantAndEquipment.json`). SEC yêu cầu User-Agent có tên và email liên hệ: cần người dùng chọn email trước khi tích hợp.
- [ ] **Doanh thu tháng của TSMC** từ TWSE OpenAPI (`openapi.twse.com.tw/v1/opendata/t187ap05_L`, mã 2330), có khoảng ngày 10 hằng tháng.
- [ ] **Việc làm công nghệ:** chỉ số tin tuyển lập trình viên của Indeed (FRED `IHLIDXUSTPSOFTDEVE`), sản lượng bán dẫn Mỹ (FRED `IPG3344S`), số tin trong luồng "Who is hiring" hằng tháng của HN (Algolia, `author_whoishiring`).
- [ ] **Phiên bản và ngày hết hỗ trợ** của công cụ đang dùng (Next.js, React, Node, TypeScript…): GitHub `releases.atom`, endoflife.date; ngày EOL đưa vào panel Lịch.
- [ ] **Nhận định công nghệ tuần do AI viết** từ tin, model mới, lỗ hổng mới (cùng ngân sách lượt gọi với `macronote`).

Phase 3:

- [ ] Xu hướng lượt tải npm và PyPI (`api.npmjs.org/downloads`, `pypistats.org`).
- [ ] Lượng tính toán huấn luyện của các model hàng đầu (Epoch AI, CSV `notable_ai_models`).
- [ ] Mất Internet theo quốc gia (IODA) làm một lớp trên bản đồ trang chủ.
- [ ] Lobsters bên cạnh Hacker News; bão từ Kp (NOAA SWPC) và lịch phóng tên lửa trên trang này.

## Trang Việt Nam

Trang `/vi/vietnam` xong ngày 2026-11-09 (BR-22, LLDD 04 §3c). Việt Nam cũng là hàng cuối trên trang Vĩ mô thế giới để so với các nước khác.

- [x] Gom những gì đã có: VN-Index và độ rộng thị trường, USD/VND (Yahoo, Vietcombank), USDT/VND P2P, vàng SJC và chênh lệch với giá thế giới, tin VnExpress.
- [x] Vĩ mô năm từ IMF: bảng 5 năm trước đến 2 năm sau, kèm trung bình nhóm mới nổi. World Bank WDI không thêm gì so với IMF nên bỏ.
- [x] Lãi suất điều hành NHNN: khai báo tay trong `config/policy-rates.ts`, nguồn `sbv` ghi thành series `sbv:REFI` và báo lỗi khi quá 180 ngày chưa kiểm tra lại (2026-11-09).
- [x] CPI tháng: IMF CPI dataset có Việt Nam đến 9/2026 (`imf:CPI_M:VNM`). GDP quý: World Bank GEM (`wb:GDP:VNM`), chậm khoảng một quý so với Tổng cục Thống kê.
- [ ] Không có nguồn miễn phí: PMI Việt Nam (S&P Global).
