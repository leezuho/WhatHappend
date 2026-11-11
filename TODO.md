# TODO

Việc đã chốt nhưng để làm sau. Thiết kế chung của trang Vĩ mô ở BRD-21 (`BRD/02-business-requirements.md`) và LLDD 04 §3b.

## Review sản phẩm (2026-11-10)

Đọc cả 5 trang trên dữ liệu thật ngày 2026-11-10, dưới góc nhìn đầu tư, vĩ mô và địa chính trị. Dữ liệu đã đủ rộng (60 nguồn). Chỗ hở là phần tổng hợp: dashboard có đủ mảnh ghép nhưng chưa nói ra câu chuyện chính, đúng vấn đề số 2 mà BRD 01 §1 đặt ra. Ngày hôm đó câu chuyện lớn nhất là cú sốc năng lượng vùng Vịnh: Brent +48% từ đầu năm nhưng −13% trong tuần, khí TTF +192%, CPI năng lượng Mỹ +20,4%, Fed được định giá tăng 45 bp, lợi suất thực 10 năm 2,63%. Bản tin AI, nhận định vĩ mô tuần và "Điểm đáng chú ý" đều không nhắc tới.

Thứ tự làm: P0, rồi "Chủ đề chi phối" và "Có gì mới từ lần trước", rồi cảnh báo Telegram. Chưa thêm nguồn hay panel theo chiều rộng trước khi xong P0 và P1.

### P0: độ tin cậy

- [x] **Worker tự báo khi chạy code cũ.** Worker không có chế độ watch và chỉ nạp danh sách nguồn lúc khởi động. Ngày 2026-11-10 worker chạy từ 08:54, trước 3 commit trong ngày, nên:
  - `technote` chưa chạy lần nào, panel "Công nghệ tuần này" trống;
  - `vnstocks` và `vnflows` không được lên lịch, trang Việt Nam báo "Dữ liệu cũ";
  - bộ lọc token neo giá trong `coingecko.ts` chưa có hiệu lực, Figure Heloc vẫn đứng #9 top coin.

  Hướng làm: lúc khởi động, worker ghi git hash, giờ khởi động và danh sách id nguồn vào `kv`. Web so với `SOURCE_META` của bản đang chạy và hiện dải cảnh báo khi lệch (có nguồn worker không biết, hoặc hash khác). `dev:all` chạy worker bằng `tsx watch`. Việc trước mắt: khởi động lại worker.

  Xong 2026-11-11 (LLDD 03 §3): worker ghi `kv['worker:info']` (pid, giờ khởi động, id nguồn, danh sách file code lấy theo import từ `worker/index.ts`) và mỗi tick tự so mtime các file đó; web hiện dải cảnh báo dưới TopBar khi worker dừng quá 2 phút, khởi động trước khi có phần tự báo, thiếu nguồn so với `SOURCE_META`, hoặc có file đã sửa. Không so git hash như dự kiến: với `tsx watch` hash lệch sau mỗi commit dù code đã nạp mới, còn sửa chưa commit thì hash không bắt được. `npm run worker:watch` mới, `dev:all` dùng nó. Worker đã khởi động lại lúc 09:59 ngày 11/11.
- [x] **Risk Regime v2.** Ngày 2026-11-10 badge báo "Né rủi ro" (điểm 0,88, ngưỡng 0,75) trong khi 20/20 thị trường tăng, S&P +2,3%, SOX +6,9%, VIX 20. Điểm chủ yếu đến từ hai thành phần:
  - HY OAS z +2,5, số của ngày 6/11. Z-score trên cửa sổ 1 năm biến mức 3,42% thành tín hiệu nguy hiểm, dù so với lịch sử đây là mức thấp (căng thẳng thật thường từ 5% trở lên).
  - 2s10s z +1,4: mức 0,32 bị tính là căng thẳng, trong khi panel Đường cong lợi suất ghi "Bình thường".

  Việc cần làm:
  - tính z-score trên 5–10 năm, hoặc kết hợp với mức tuyệt đối (kiểm tra nguồn `fred` đang lưu lịch sử bao xa);
  - tách mức khỏi tốc độ: HY tăng từ khoảng 2,6% lên 3,42% trong vài tháng là tín hiệu thật, nên hiện thành cảnh báo phân kỳ "tín dụng xấu đi trong khi cổ phiếu tăng" thay vì gộp vào badge;
  - thêm xu hướng cổ phiếu: S&P so với MA200, số thị trường nằm trên MA50 (có sẵn từ Thị trường thế giới);
  - giảm trọng số cho đầu vào đã cũ; chỉ đổi trạng thái khi tín hiệu giữ đủ 2 phiên;
  - popover hiện giá trị gốc và ngày của từng thành phần (BR-06 còn thiếu).

  Cập nhật LLDD 06 khi đổi thuật toán.

  Xong 2026-11-11 (LLDD 06 v0.3): z so với tối đa 10 năm (`fred` lấy 10 năm cho `VIXCLS`, `SP500`, `BAA10Y`, `T10Y2Y`, `STLFSI4`), kẹp ±3; STLFSI dùng thẳng vì đã chuẩn hoá. FRED chỉ còn 3 năm HY OAS (ICE), nên điểm dùng chênh lệch Baa − 10 năm (`BAA10Y`, z 10 năm −1,24 ngày 10/11) và HY chuyển sang cảnh báo phân kỳ: HY cao hơn đáy 3 tháng ≥ 50 bp trong khi S&P còn trên MA200 (đang bật: 3,34% so với 2,60% ngày 28/8). Thêm S&P so với MA200 (z 10 năm) và số trong 20 thị trường nằm trên MA50; số trễ nửa trọng số; đổi trạng thái khi giữ 2 phiên (VIX > 35 đổi ngay); popover có giá trị gốc, ngày, "từ ngày", dấu "!" khi có phân kỳ. Ngày 10/11 ra "Trung tính" (−0,18). Kiểm lại trên lịch sử: 3/2020, 6 và 10/2022, 4/2025 ra né rủi ro; 6/2021, 11/2024 ra ưa rủi ro. `regimeFromDb` nằm ở `lib/data/regime.ts` để worker dùng được cho bản tin.
- [x] **Bản tin AI đọc thêm lịch và thị trường.** Bản tin ngày 2026-11-10 gồm G7, vụ xả súng ở Krakow và chính sách nhập cư. Mục "Cần theo dõi" không có CPI Mỹ lúc 20:30 (tác động cao), vì `lib/ai/brief.ts` chỉ nhận tiêu đề 24 giờ và ảnh chụp Vital Signs. Cần thêm:
  - sự kiện tác động cao của hôm nay và ngày mai, theo giờ Việt Nam;
  - các biến động lớn nhất trong ngày và trong tuần;
  - trạng thái regime.

  Prompt xếp hạng tin theo hệ quả với thị trường và vĩ mô, không theo độ "nóng" của tin. Cập nhật LLDD 05 §3.

  Xong 2026-11-11 (LLDD 05 §3): `briefInput` thêm `moves` (8 biến động lớn nhất của phiên và của 7 ngày qua trong 20 chỉ số, 11 hàng hoá, DXY, Bitcoin), `bigMoves` (≥ 3% trong phiên hoặc ≥ 5% trong tuần, prompt buộc phải nhắc hết, vì lần thử đầu model bỏ qua khí Henry Hub +11,8%, Bitcoin −8,3%, KOSPI −6,5%), `regime` (trạng thái, từ ngày, nghiêng về đâu, cảnh báo phân kỳ, từng thành phần) và `calendar` (sự kiện tác động cao từ giờ đến hết ngày mai theo giờ Việt Nam, kể cả FOMC theo giờ Hà Nội, NHTW khác, VN30F, ngày Cục Thống kê; số vừa công bố so với dự báo). Snapshot thị trường dùng bp cho lợi suất thay cho % tương đối. Hai lần chạy thật ngày 11/11 (`gemini-3.8-flash`): "Cần theo dõi" mở đầu bằng "GDP m/m của Anh, 14:00 thứ Năm 12/11", có bullet lợi suất 10 năm +12 bp kèm cảnh báo phân kỳ tín dụng và các biến động lớn trong tuần.
- [x] **"Điểm đáng chú ý" ưu tiên cái mới.** `lib/signals/notable.ts` chỉ xét biến động một phiên và cho 2–3 điểm cho ngưỡng đã vượt từ lâu. Vì vậy CPI và PCE lõi Mỹ ngày nào cũng nằm trên panel, còn Brent −13% trong tuần thì không lên. Cần thêm:
  - ngưỡng vừa vượt trong vài ngày gần đây;
  - biến động 5 phiên tính theo z;
  - giảm điểm cho mục đã nằm trên panel nhiều ngày liên tiếp.

  Xong 2026-11-11 (LLDD 05 §3a): lý do ngưỡng có `since` và `fresh` (≤ 5 phiên với series ngày, kỳ mới nhất với series tháng); vừa vượt được 4/3 điểm, vượt đã lâu 2/1,5 và giảm một nửa mỗi 30 ngày (mức nguy hiểm cũ giữ sàn 0,75 để vẫn hiện, xếp cuối); lý do mới `week` là biến động 7 ngày lịch tính theo z; điểm dưới 0,5 không hiện. "Nằm lâu trên panel" suy từ tuổi của chuỗi vượt ngưỡng, không lưu trạng thái. Ngày 11/11 CPI, PCE lõi, GSCPI, CPI Việt Nam rời panel. Brent: quy tắc tuần bật ngày 4–6/11 (z −2,6 đến −2,3) nhưng đến 10/11 tuần −10,8% chỉ còn −1,5σ vì Brent năm nay biến động rất mạnh; bản tin vẫn nhắc qua `bigMoves`.

### P1: nối các chấm

- [ ] **Chủ đề chi phối**, đặt ở đầu trang Tổng quan. `config/themes.ts` khai 4–6 chủ đề (tên kiểu `Bi`). Mỗi chủ đề gắn series, từ khoá tin, kèo Polymarket và kênh truyền dẫn sang Việt Nam. Ví dụ theo dữ liệu ngày 2026-11-10:

  | Chủ đề | Gắn với |
  |---|---|
  | Năng lượng vùng Vịnh | Brent, TTF, CPI năng lượng, 5y5y, giá xăng Petrolimex, kèo phong tỏa Iran |
  | Lạm phát Mỹ và Fed | CPI lõi, mức Fed được định giá, lợi suất thực, DXY → USD/VND |
  | Chu kỳ AI và bán dẫn | SOX, doanh thu TSMC, tin về Nvidia |
  | Dòng vốn ngoại vào Việt Nam | khối ngoại, FTSE nâng hạng, khoảng cách tới trần tỷ giá |

  Mỗi thẻ có trạng thái leo thang hay hạ nhiệt (tính từ số liệu), 3 tin mới nhất và xác suất trên Polymarket. AI viết 2–3 câu cho mỗi chủ đề, chỉ từ dữ liệu gắn với chủ đề đó, dùng chung ngân sách lượt gọi với `macronote`. Đưa luôn các chủ đề vào đầu vào của `macronote`: nhận định tuần 46 không có chữ "dầu" vì AI chỉ đọc bảng số của trang Vĩ mô.
- [ ] **Lớp địa chính trị.** Hiện chỉ có chấm GDELT trên bản đồ (482 điểm ngày 2026-11-10, phần lớn là nhiễu) và một con số GPR toàn cầu. Cần thêm (chưa thử endpoint nào):
  - lưu lượng tàu qua Hormuz, Bab el-Mandeb, Suez, Malacca và eo biển Đài Loan: IMF PortWatch;
  - trừng phạt, kiểm soát xuất khẩu, thuế quan: Federal Register API (`federalregister.gov/api/v1`, không cần key);
  - GPR theo quốc gia: bản tháng của Caldara–Iacoviello (nguồn `gpr` đang đọc bản ngày, chỉ có chỉ số toàn cầu);
  - lịch bầu cử khai báo tay trong `config/` (BR-10 còn thiếu).
- [ ] **"Có gì mới từ lần trước"**: một dải ở đầu trang Tổng quan, phục vụ KPI-1 (nắm tình hình dưới 2 phút). Liệt kê:
  - regime đổi trạng thái;
  - ngưỡng mới vượt;
  - số thực tế lệch dự báo;
  - biến động trên 2σ;
  - lỗ hổng KEV mới của các hãng đang theo dõi.

  Mốc "lần trước" lưu ở `localStorage` (tiện ích riêng của người xem). Cần lưu thêm lịch sử regime theo ngày.
- [ ] **Cảnh báo qua Telegram**, do worker gửi. BRD 01 §5.2 đang để push ngoài phạm vi, nên cần cập nhật BRD. Bot token và chat id đặt trong `.env.local`. Các trường hợp cần báo:
  - số thực tế lệch dự báo;
  - Vietcombank bán ra cách trần dưới 2%;
  - chênh lệch SJC đổi mạnh;
  - xác suất một kèo Polymarket đổi hơn 15 điểm;
  - sự cố ở đám mây đang dùng;
  - regime đổi trạng thái.

  Mỗi cảnh báo chỉ gửi một lần cho tới khi điều kiện hết.

### P2: chiều sâu cho nhà đầu tư

- [ ] **Định giá và vị thế.** Lớp này hiện chưa có.
  - Vị thế trên thị trường tương lai theo báo cáo COT của CFTC (dầu, vàng, USD, trái phiếu Mỹ, BTC): API Socrata `publicreporting.cftc.gov`, không cần key, chưa thử.
  - P/E, P/B của VN-Index; dư nợ margin; số tài khoản mở mới (VSDC). Chưa dò nguồn.
- [ ] **Góc nhìn nhà đầu tư Việt.** Bảng "Các lớp tài sản" có chế độ quy ra VND, kèm mốc lãi tiết kiệm 12 tháng, để trả lời "năm nay cái gì thắng tiền gửi". Cần dò nguồn lãi suất niêm yết của các ngân hàng lớn.
- [ ] **Số liệu tháng của Việt Nam:** xuất khẩu (nhất là sang Mỹ), FDI giải ngân, tăng trưởng tín dụng, sản xuất công nghiệp. **Cần người dùng chọn** một trong hai cách:
  - form nhập tay ghi vào `kv`;
  - AI trích từ thông cáo của Cục Thống kê ngày mùng 6, có kiểm tra khoảng giá trị và gắn nhãn "AI trích".

  BR-22 đang để số của Cục Thống kê ngoài phạm vi, vì không có API và scrape dễ hỏng.
- [ ] **Chỉ số bất ngờ kinh tế Mỹ tự dựng.** Nguồn `calendar` thay toàn bộ danh sách mỗi lần chạy (`replaceItems`), nên số thực tế so với dự báo không được giữ lại. Cần lưu lịch sử này để tính chỉ số theo kiểu Citi Economic Surprise Index.

### P3: bố cục

- [ ] **Sắp lại trang Tổng quan.** Trang dài khoảng 7.000px với 17 panel, và màn hình đầu là quả địa cầu, ít thông tin cho người đọc buổi sáng. Thứ tự đề xuất:
  - đầu trang: regime, "Có gì mới từ lần trước", Chủ đề chi phối, sự kiện hôm nay;
  - kế tiếp: bản tin;
  - bản đồ chuyển xuống dưới.

  Thẻ "Điểm đáng chú ý" ngày nào cũng giảng lại định nghĩa chỉ số; nên thu về một dòng "đổi gì, vì sao quan trọng", phần giải thích để ở chế độ mở rộng.
- [ ] **Lọc kèo Polymarket** khi nguồn chạy lại. Bỏ các kèo từ 97% trở lên hoặc từ 3% trở xuống, vì không cho thêm thông tin (ví dụ kèo ngừng bắn Israel–Iran đang 100%). Xếp theo mức đổi xác suất trong 24 giờ.

## Review nội dung từng trang (2026-11-10)

Đọc lại 5 trang trên dữ liệu thật, tìm thông tin giá trị còn thiếu và chỗ một biểu đồ nói được nhiều hơn bảng hay số đơn lẻ. "Có sẵn" = dữ liệu đã nằm trong DB, chỉ cần query và giao diện. Endpoint ghi "thử 2026-11-10" là đã gọi thật, không cần key.

Đã làm trong lượt review:

- [x] **Thị trường thế giới** trên trang Tổng quan: 20 chỉ số chứng khoán chính (Mỹ, Canada, Brazil, Mexico, khu vực euro, Đức, Pháp, Ý, Anh, Nhật, Hàn, Đài Loan, Trung Quốc, Hồng Kông, Ấn Độ, Úc, Indonesia, Việt Nam), % phiên, 1 tuần, 1 tháng, từ đầu năm tô nền theo mức, sparkline 1 năm. Trước đó trang chủ chỉ có chỉ số Mỹ và VN-Index.
- [x] **Lạm phát và lãi suất điều hành** (trang chủ) dùng CPI tháng mới nhất thay cho ước tính năm của IMF. Trước đó lãi suất thực ở trang chủ lệch so với trang Vĩ mô (khu vực euro −0,6% so với −1,3%, Việt Nam −0,2% so với −0,6%).
- [x] **Giá trị khớp lệnh HOSE** cạnh dòng độ rộng (SSI đã trả `totalValue` nhưng chưa hiện).
- [x] **Top đồng coin** bỏ token neo giá quanh $1 như Figure Heloc (đứng #9, giá $1,04, gần như không biến động).

### Tổng quan

- [x] **Lịch: số thực tế và độ lệch so với dự báo.** Panel chỉ có dự báo và kỳ trước vì JSON của ForexFactory không có trường actual. Ý chính của lịch kinh tế là "cao hay thấp hơn dự báo". Cách rẻ: map các sự kiện Mỹ (CPI, Core CPI, NFP, thất nghiệp, Claims, GDP, PCE) sang series FRED đã có, sau giờ công bố thì hiện số thực tế và tô màu theo độ lệch. Xong 2026-11-10: 15 sự kiện Mỹ trong `config/calendar.ts` (thêm PPI, bán lẻ, lương giờ), nguồn `calendar` chạy mỗi giờ để có số sớm; mục có kết quả còn hiện 18 giờ.
- [x] **Bảng Hàng hoá** cạnh Thị trường thế giới: dầu WTI `CL=F`, khí Henry Hub `NG=F`, khí châu Âu `TTF=F`, bạc `SI=F`, lúa mì `ZW=F`, ngô `ZC=F` (Yahoo, thử 2026-11-10), cùng kiểu cột phiên / tuần / tháng / từ đầu năm. Năng lượng và lương thực là kênh lạm phát chính của các nước mới nổi, kể cả Việt Nam. Xong 2026-11-10: 11 mặt hàng, thêm gạo `ZR=F` và cà phê `KC=F` vì Việt Nam xuất khẩu nhiều.
- [x] **Biểu đồ lịch sử 2s10s và 10Y−3M (2 năm)** dưới đường cong lợi suất. Panel chỉ cho thấy hình dạng hôm nay, trong khi tín hiệu nằm ở quá trình đảo ngược rồi hết đảo ngược (suy thoái thường bắt đầu sau khi hết đảo ngược). Có sẵn: `fred:T10Y2Y`, `fred:T10Y3M`. Xong 2026-11-10, kèm dòng "dương/đảo ngược từ ngày X" cho từng chênh lệch.
- [x] **Biểu đồ hiệu suất các lớp tài sản từ đầu năm**: cột ngang cho cổ phiếu Mỹ, cổ phiếu thế giới, trái phiếu 10 năm, vàng, dầu, đồng, USD, Bitcoin, VN-Index. Trả lời câu "năm nay cái gì thắng". Có sẵn. Xong 2026-11-10; cổ phiếu thế giới, mới nổi và trái phiếu dùng ETF `ACWI`, `EEM`, `IEF` (chỉ tính giá).

### Vĩ mô thế giới

- [x] **Biểu đồ tăng trưởng – lạm phát bốn góc phần tư** (scatter): trục x là GDP so cùng kỳ so với mức bình thường của nước đó, trục y là CPI trừ mục tiêu, mỗi nền kinh tế một chấm, kèm đuôi 4 quý. Các góc lần lượt là ổn định, quá nóng, đình lạm và suy yếu, nên đọc được nhanh hơn hai cột tương ứng trong bảng sức khoẻ. Có sẵn (dữ liệu của bảng sức khoẻ). Xong 2026-11-10; đuôi 4 quý chỉ hiện khi rê chuột, vẽ hết một lúc thì rối thành búi.
- [x] **Biểu đồ nợ công so với cân đối ngân sách** (scatter, IMF 2026): góc nợ cao và thâm hụt lớn là vùng rủi ro tài khoá (Mỹ, Pháp, Brazil, Trung Quốc). Hiện bảng có hai cột tách rời. Có sẵn; muốn vẽ kích thước bong bóng theo GDP thì thêm IMF `NGDPD`. Xong 2026-11-10, chưa có kích thước bong bóng.
- [x] **Thị trường đang định giá Fed cắt hay tăng bao nhiêu**: lợi suất 1 năm hoặc 2 năm trừ lãi suất Fed hiệu dụng ra số bp kỳ vọng trong 12 tháng (cần thêm FRED `DFF` theo ngày), hoặc lấy đường đi theo từng cuộc họp từ Kalshi khi nguồn này chạy lại. Đây là con số giới đầu tư nhìn trước tiên sau mỗi lần CPI. Xong 2026-11-10: tile `fedPriced` (`calc:FEDPRICED_US` = DGS1 − DFF, bp) trong panel Tiền tệ; hôm nay +45 bp, tức thị trường nghiêng về tăng. Đường đi theo từng cuộc họp vẫn chờ Kalshi.
- [x] **Phân rã lạm phát Mỹ**: CPI so cùng kỳ theo nhóm năng lượng, thực phẩm, hàng hoá lõi, nhà ở, dịch vụ trừ nhà ở (FRED `CPIENGSL`, `CPIUFDSL`, `CUSR0000SACL1E`, `CUSR0000SAH1`, `CUSR0000SASLE`), vẽ small multiples hoặc cột. Cho biết lạm phát dai dẳng nằm ở đâu. Xong 2026-11-10: biểu đồ đường 24 tháng dưới tile Mỹ của panel Lạm phát; dịch vụ trừ nhà ở dùng `CUSR0000SASL2RS` (trừ tiền thuê nhà) thay cho `SASLE` (vẫn gồm nhà ở).
- [x] **Lịch vĩ mô quá ngắn:** panel mở 28 ngày nhưng ngoài tuần này chỉ còn lịch NHTW, vì ForexFactory chỉ có `ff_calendar_thisweek.json` (`nextweek` trả 404, thử 2026-11-10) và lịch ICS của BLS trả 403. Hướng thay: API lịch công bố của FRED (cần key miễn phí) hoặc tự khai ngày CPI/NFP/GDP/PCE trong `config/` giống `config/central-banks.ts`. Xong 2026-11-10: trang HTML lịch của FRED không cần key (`/releases/calendar?rid=&vs=&ve=`), nguồn `releases` lấy 7 bản tin Mỹ khoảng 1–2 tháng tới, hiện sau tuần của ForexFactory ở cả lịch trang chủ và trang Vĩ mô.
- [x] Chưa xem được Đồng hồ chu kỳ và Bản đồ thế giới bằng ảnh chụp headless (hai biểu đồ chỉ vẽ sau khi đo kích thước ở client), nên lượt review này chưa đánh giá phần hình của chúng. Xong 2026-11-10: `scripts/screenshot.mjs` (DevTools protocol, WebGL phần mềm) chụp được cả hai. Hai biểu đồ hiển thị đúng; bản đồ thiếu lớp `wh-map` nên nút zoom và dòng nguồn trắng ở chế độ tối, đã sửa.

### Việt Nam

Trang mỏng nhất: 5 panel, phần lớn là bảng tĩnh và không có biểu đồ lịch sử.

- [x] **Khối ngoại mua/bán ròng HOSE**, chỉ số giới đầu tư Việt Nam xem hằng ngày. Response SSI hiện dùng đã có `totalBuyForeignQtty` / `totalSellForeignQtty` nhưng chỉ là khối lượng cổ phiếu. Cần dò endpoint có giá trị VND (SSI iBoard, VNDirect `api-finfo.vndirect.com.vn`, DNSE) và lịch sử theo ngày. Xong 2026-11-10: nguồn `vnflows` (VNDirect `api-finfo.vndirect.com.vn/v4/foreigns`, giá trị VND, lịch sử từ 2018), panel Khối ngoại với cột 40 phiên và tổng 5/20 phiên, từ đầu năm.
- [x] **Biểu đồ chênh lệch vàng SJC so với thế giới theo thời gian.** Đây là câu chuyện chính của giá vàng trong nước (hôm nay +13,8 triệu, +10,9%), nhưng panel chỉ có con số hôm nay. Vàng thế giới và USD/VND có 1 năm; giá SJC chỉ có từ 2026-10-31 vì vang.today không có lịch sử. Biểu đồ sẽ dài dần, hoặc tìm thêm nguồn lịch sử SJC. Xong 2026-11-10: biểu đồ trong panel Giá vàng, từ 31/10 (17,7 triệu) đến hôm nay (13,9 triệu). vang.today không truy cập được từ 9/11 (nguồn đang dùng PNJ dự phòng), nên chưa có nguồn lịch sử SJC.
- [x] **Ba giá đô trên một biểu đồ**: Yahoo/liên ngân hàng, Vietcombank bán ra, USDT P2P, kèm đường chênh lệch P2P so với Vietcombank (cho thấy áp lực tỷ giá ngoài hệ thống). Vietcombank và P2P chỉ có lịch sử từ 31/10 và 3/11, nên cần đợi vài tuần dữ liệu. Xong 2026-11-10: biểu đồ trong panel Tỷ giá, kèm dòng chênh P2P − Vietcombank; dài dần theo ngày.
- [x] **Tỷ giá trung tâm NHNN và trần biên độ ±5%**: Vietcombank bán ra còn cách trần bao nhiêu là thước đo áp lực tỷ giá rõ nhất. `sbv.gov.vn` redirect 302 (thử 2026-11-10), cần dò trang hoặc API thật. Xong 2026-11-10: nguồn `sbvrate` đọc bản Techcombank đăng lại (JSON theo ngày, lịch sử từ 2023), đường trần biên độ trên biểu đồ giá đô và dòng "Vietcombank bán ra cách trần". Hôm nay 1.120 ₫ (4,2%).
- [x] **Lãi suất liên ngân hàng qua đêm** (NHNN công bố hằng ngày): tín hiệu thanh khoản hệ thống, từng vọt lên trên 10% trong các đợt căng thẳng. Chung hướng dò với tỷ giá trung tâm. Xong 2026-11-10: nguồn `ibrate` đọc câu cố định trong bản tin hằng ngày của Thời báo Ngân hàng (NHNN chặn Node), tile qua đêm ở panel Kinh tế Việt Nam; lịch sử từ 15/10/2026 và dài dần. Là văn xuôi nên dễ vỡ, nguồn sẽ báo lỗi khi câu đổi.
- [x] **Giá xăng dầu Petrolimex** (RON 95-V, E10, E5 RON 92, DO) và kỳ điều hành hằng tuần: ảnh hưởng trực tiếp đến CPI và chi phí sinh hoạt. Trang chủ `petrolimex.com.vn` trả 200 nhưng giá nạp bằng script, cần tìm API phía sau. Xong 2026-11-10: nguồn `petrolimex` (API cổng `portals.petrolimex.com.vn`, 6 mặt hàng, RON 95 nay là E10), panel Giá xăng dầu; API không có lịch sử nên mức đổi chỉ hiện từ kỳ điều hành sau.
- [x] **VN-Index so với khu vực**: cột ngang từ đầu năm của các chỉ số châu Á, tô nổi VN-Index, còn lại màu xám. Có sẵn sau khi thêm Thị trường thế giới (`getWorldMarkets`). Xong 2026-11-10.
- [x] **Lạm phát và lãi suất tái cấp vốn theo thời gian** (hai đường, lãi suất thực là khoảng giữa). Hiện chỉ có tile riêng lẻ và một dòng chữ. Có sẵn: `imf:CPI_M:VNM` từ 2023, `sbv:REFI` từ 2022. Xong 2026-11-10.
- [x] **Thiên tai gần Việt Nam**: lọc GDACS, EONET, USGS trong khung khoảng 5–25°B, 100–118°Đ (bão, lũ miền Trung) thành một danh sách trên trang này. Có sẵn từ dữ liệu bản đồ. Xong 2026-11-10; bão lấy khung rộng hơn (tới 135°Đ) vì đi từ biển Philippines vào.
- [x] **Lịch thị trường Việt Nam** (2026-11-10): ngày đáo hạn VN30F (thứ Năm thứ ba) và ngày Cục Thống kê công bố số liệu tháng (ngày 6), cùng họp FOMC.
- [x] Ngày đáo hạn VN30F lùi về phiên liền trước khi trùng ngày nghỉ. Xong 2026-11-10: `VN_MARKET_HOLIDAYS` trong `config/vietnam.ts` (2026 theo thông báo của HOSE; 2027 theo Thông báo 11483/TB-BNV ngày 9/10/2026: Tết 4–10/2, Quốc khánh 2–5/9, cộng Giỗ Tổ 16/4 và nghỉ bù 1/5 vào thứ Hai 3/5). Đến hết 2027 không kỳ đáo hạn nào trùng ngày nghỉ (2/2026 đã lùi về 13/2). **Mỗi tháng 12 thêm năm sau** khi HOSE công bố lịch nghỉ; HOSE chưa ra lịch 2027 riêng, có thì đối chiếu lại. Ngày 24/11 (Ngày Văn hoá Việt Nam) đến 26/10/2026 vẫn chưa có thông báo nghỉ giao dịch.
- [ ] Lịch thị trường Việt Nam, phần còn lại: kỳ review FTSE/MSCI và ngày ETF cơ cấu danh mục (cần ngày công bố chính thức, không tự suy). Tìm ngày 2026-11-10: FTSE nâng hạng Việt Nam lên thị trường mới nổi thứ cấp từ 21/9/2026, đưa vào chỉ số qua 4 đợt (9/2026, 3/2027, 6/2027, 9/2027; báo chí ghi tỷ trọng 10/20/35/35%). Chưa tìm được lịch review chính thức của FTSE Russell (GEIS) và MarketVector (quỹ VNM) cho từng đợt, mới có báo chí; cần đọc lịch trên trang FTSE Russell rồi khai trong `config/`.
- [x] VN30, HNX-Index, UPCoM và heatmap VN30 (treemap theo vốn hoá, màu theo % ngày): cần dò endpoint SSI cho từng mã. Xong 2026-11-10: nguồn `vnstocks` (giá SSI, lịch sử chỉ số và số cổ phiếu lưu hành từ VNDirect vì lịch sử HNX/UPCoM của SSI bị chia 1000), 3 tile mới và panel Cổ phiếu VN30 kèm mã khối ngoại mua/bán ròng nhiều nhất.

### Crypto

- [x] **Lịch sử hợp đồng mở và tỷ lệ long/short trên Binance**: `fapi.binance.com/futures/data/openInterestHist` và `globalLongShortAccountRatio` (`period=1d`, tối đa 30 ngày; thử 2026-11-10). Biểu đồ OI so với giá cho thấy đòn bẩy đang tích tụ; hiện panel chỉ có một con số OI. Thêm lịch sử funding (`fapi/v1/fundingRate`). Xong 2026-11-10: panel Đòn bẩy BTC (hợp đồng mở tính bằng BTC so với giá, cùng đưa về 100; long/short; funding quy năm), series dài dần vì Binance chỉ trả 30 ngày.
- [x] **Dòng tiền ETF Bitcoin giao ngay** theo ngày, chỉ báo dòng tiền tổ chức được theo dõi nhiều nhất. Farside trả 403 Cloudflare (thử 2026-11-10); cần dò SoSoValue hoặc nguồn khác. Xong 2026-11-10: SoSoValue cũng 403; dùng bảng HTML của bitbo.io (nguồn `etfflows`, khoảng 10 phiên theo quỹ), panel Dòng tiền ETF bitcoin, lịch sử dài dần.
- [x] **Treemap top coin** theo vốn hoá, tô màu theo % 24 giờ hoặc 7 ngày: nhìn một lần biết thị trường đỏ hay xanh và tiền đang vào đâu. Có sẵn. Xong 2026-11-10.
- [x] **Biểu đồ ETH/BTC 1 năm**: thước đo quen thuộc cho mùa altcoin. Có sẵn (`yahoo:ETH-USD`, `yahoo:BTC-USD`). Xong 2026-11-10.
- [x] **TVL và phí theo chain** từ DefiLlama (`api.llama.fi/v2/chains`, thử 2026-11-10): hoạt động on-chain đang dồn về đâu. Xong 2026-11-10: panel Chain: TVL và phí (10 chain, thay đổi 7/30 ngày, phí 30 ngày và tuần so tuần).

### Công nghệ

- [x] **Trạng thái dịch vụ: tách sự cố kéo dài.** AWS hiện "Gián đoạn lớn" liên tục vì hai sự cố vùng Bahrain và UAE mở từ 1–2/3/2026. Bảng vì thế không trả lời được câu "hôm nay có gì hỏng". Đề xuất: sự cố mở quá 14 ngày xếp vào nhóm "ngừng dài hạn", vẫn liệt kê nhưng không tính vào mức tổng và dòng "N/8 dịch vụ đang báo sự cố". Xong 2026-11-10 (`splitStatus`).
- [x] **Gom tin trùng** ở các panel tin: tin công nghệ hôm nay có khoảng 10 bài về cùng vụ Jensen Huang. Gom theo cụm (tiêu đề gần giống hoặc cùng thực thể) thành một dòng "N bài", để chỗ cho tin khác. Xong 2026-11-10: `clusterStories` (từ chung có trọng số idf, ngưỡng 0,35) áp cho mọi panel tin; vụ Jensen Huang còn 1 dòng "+13 bài cùng chuyện" ở trang Công nghệ. Vẫn có thể gộp nhầm hai sự kiện na ná (hai tàu mắc cạn cùng ngày), nên các tiêu đề bị gộp luôn mở xem được.
- [x] **Model AI: chất lượng so với giá** (scatter giá đầu vào/ra so với điểm benchmark). Bảng OpenRouter hiện chỉ có giá, không cho biết model nào đáng tiền. Cần nguồn điểm: bảng xếp hạng LMArena hoặc API Artificial Analysis (cần key miễn phí), chưa thử. Xong 2026-11-10: LMArena công bố bảng xếp hạng thành dataset trên Hugging Face (lmarena.ai bị Cloudflare chặn); nguồn `arena` nối điểm với giá OpenRouter (69/100 model), panel scatter trục giá logarit trên trang Công nghệ.
- [x] **Treemap cổ phiếu công nghệ** theo vốn hoá, màu theo % ngày. Có sẵn từ bảng hiện tại. Xong 2026-11-10, là tab Bản đồ trong panel cổ phiếu.
- [x] **Lỗ hổng KEV theo hãng** (cột ngang 90 ngày: Microsoft, Ivanti, Cisco…): cho thấy sản phẩm nào đang bị nhắm nhiều nhất, thay vì chỉ một danh sách theo ngày. Xong 2026-11-10: nguồn `kev` lưu thêm `kev_vendors` (90 ngày và 1 năm).

## Trang Vĩ mô thế giới: chỗ còn thiếu sau Phase 2

Phase 2 (sáu panel theo chủ đề và Lịch vĩ mô) xong ngày 2026-11-09. Còn lại:

- [x] **CPI tháng cho khu vực euro, Pháp, Ý, Mexico, Nhật** (2026-11-09): nguồn `imfcpi` (IMF CPI dataset, không cần key) có cả 16 nước đến 9/2026; trang lấy số mới hơn giữa OECD và IMF. Lợi suất 10 năm của Indonesia lấy từ CNBC (`cnbc`) vì OECD dừng ở 12/2024.
- [x] **Lợi suất 10 năm của Việt Nam:** HNX có đường cong lợi suất theo ngày (LLDD 02 §7.5) nhưng `hnx.vn` thiếu chứng chỉ trung gian nên Node không kết nối được. Cần quyết định cách bổ sung chứng chỉ trước khi tích hợp. Xong 2026-11-10 mà không cần HNX: bản tin hằng ngày của Thời báo Ngân hàng có lợi suất TPCP thứ cấp (10 năm 4,47%), nguồn `ibrate` lưu `vn:GB10Y`, bảng sức khoẻ dùng làm `y10` của Việt Nam. Đường cong đầy đủ của HNX vẫn cần xử lý chứng chỉ nếu muốn.
- [x] **Thất nghiệp tháng của Brazil** (2026-11-10): nguồn `ibge` (API SIDRA của IBGE, không cần key, bình quân trượt 3 tháng, đến 9/2026: 5,2%), ở cột thất nghiệp của bảng sức khoẻ và small multiples. Số chưa điều chỉnh mùa vụ nên màu so cùng tháng năm trước (`uneNsa`); nếu dùng quy tắc Sahm thì quý I nào cũng báo động nhầm (3/2026 là +1,0 điểm % so với đáy dù giảm so cùng kỳ).
- [ ] **Thất nghiệp tháng của Ấn Độ:** PLFS hằng tháng của MoSPI có sẵn và không cần key (`api.mospi.gov.in`, từ 4/2025, 9/2026: 5,0%), nhưng server không hỗ trợ secure renegotiation nên Node báo `ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED` (curl thì chạy). **Cần người dùng quyết** có bật `SSL_OP_LEGACY_SERVER_CONNECT` riêng cho host này không (nới TLS, giống ca chứng chỉ của `hnx.vn`). URL và bộ lọc đã chốt (LLDD 02 §2.11); quyết xong thì nguồn chỉ khoảng 50 dòng, cùng kiểu `ibge`, khai `une: "mospi:UNE:IND"` cho Ấn Độ.
- [ ] **Thất nghiệp tháng của Trung Quốc, Indonesia, Việt Nam:** không có nguồn. NBS chặn (403 WAF), DBnomics NBS dừng ở 6/2026, ILOSTAT không có từ 2025; Indonesia chỉ công bố tháng 2 và 8, Việt Nam theo quý. Đang dùng ước tính năm của IMF.
- [ ] **Lịch NHTW:** thêm ngày 2027 của Bank Indonesia và Banxico (thường công bố tháng 12) và của RBI từ tháng 4/2027 (thường công bố tháng 3) vào `config/central-banks.ts`. Kiểm tra 2026-11-10: cả BI lẫn Banxico chưa công bố lịch 2027 (lịch 2026 của BI ra ngày 23/12/2025). Ngày LPR đang chỉ lùi qua cuối tuần, chưa tính ngày lễ Trung Quốc; đến hết 2027 không có ngày 20 nào rơi vào kỳ nghỉ lễ (kiểm tra 2026-11-09), nên chưa cần làm trước khi Trung Quốc công bố lịch nghỉ 2028.

## Trang Vĩ mô thế giới: Phase 3

- [x] AI viết nhận định vĩ mô hằng tuần từ các con số trên trang (nguồn `macronote`, LLDD 05 §3b), kèm ngân sách lượt gọi cho gói Gemini miễn phí (LLDD 05 §4.1). Xong 2026-11-09.
- [x] Bản đồ thế giới tô màu theo tăng trưởng GDP hoặc lạm phát (IMF, khoảng 220 nền kinh tế; LLDD 04 §3b). Xong 2026-11-09.

## Trang Công nghệ

Phase 1 xong ngày 2026-11-09 (BR-23, LLDD 04 §3d, nguồn ở LLDD 02 §8b): cổ phiếu công nghệ, trạng thái dịch vụ, model AI mới, nghiên cứu AI, lỗ hổng CISA KEV, Hacker News, tin công nghệ.

Phase 2, phần "insight" (đã thử endpoint ngày 2026-11-09, đều chạy không cần key):

- [ ] **Capex AI của 4 hyperscaler** (MSFT, GOOGL, AMZN, META) theo quý từ SEC EDGAR XBRL (`data.sec.gov/api/xbrl/companyconcept/<CIK>/us-gaap/PaymentsToAcquirePropertyPlantAndEquipment.json`). SEC yêu cầu User-Agent có tên và email liên hệ: cần người dùng chọn email trước khi tích hợp.
- [x] **Doanh thu tháng của TSMC** từ TWSE OpenAPI (`openapi.twse.com.tw/v1/opendata/t187ap05_L`, mã 2330), có khoảng ngày 10 hằng tháng. Xong 2026-11-10: nguồn `twse` cho TSMC và 6 hãng chuỗi máy chủ AI (Hồng Hải, Quanta, Wistron, MediaTek, ASE, Delta), panel Chuỗi phần cứng AI Đài Loan. TSMC tháng 9: +54,6% so cùng kỳ.
- [x] **Việc làm công nghệ:** chỉ số tin tuyển lập trình viên của Indeed (FRED `IHLIDXUSTPSOFTDEVE`), sản lượng bán dẫn Mỹ (FRED `IPG3344S`), số tin trong luồng "Who is hiring" hằng tháng của HN (Algolia, `author_whoishiring`). Xong 2026-11-10: panel Tuyển dụng công nghệ (tile Indeed, sản lượng bán dẫn, HN "Who is hiring?" theo tháng đã kết thúc, nguồn `hnhiring`).
- [x] **Phiên bản và ngày hết hỗ trợ** của công cụ đang dùng (Next.js, React, Node, TypeScript…): GitHub `releases.atom`, endoflife.date; ngày EOL đưa vào panel Lịch. Xong 2026-11-10: nguồn `eol` (endoflife.date + npm cho TypeScript), panel Phiên bản và hết hỗ trợ. Trang Công nghệ chưa có panel Lịch nên hạn EOL nằm trong panel này. PostgreSQL 14 hết hỗ trợ 12/11/2026.
- [x] **Nhận định công nghệ tuần do AI viết** từ tin, model mới, lỗ hổng mới (cùng ngân sách lượt gọi với `macronote`). Xong 2026-11-10: nguồn `technote` (LLDD 05 §3c), panel "Công nghệ tuần này"; cần còn 3 lượt model `brief` trong ngày, `BRIEF_RESERVE` của `insights` tăng lên 5. Máy này chưa có `AI_API_KEY` nên chưa chạy thật với model, mới kiểm tra đầu vào.

Phase 3:

- [x] Xu hướng lượt tải npm và PyPI (`api.npmjs.org/downloads`, `pypistats.org`). Xong 2026-11-10: nguồn `pkgtrends` (14 gói, tổng theo tuần trọn), panel Lượt tải thư viện trên trang Công nghệ.
- [x] Lượng tính toán huấn luyện của các model hàng đầu (Epoch AI, CSV `notable_ai_models`). Xong 2026-11-10: nguồn `epoch`, panel Lượng tính toán huấn luyện (12 lần lớn nhất, tiên phong tăng khoảng 4,8× mỗi năm từ 2018).
- [ ] Mất Internet theo quốc gia (IODA) làm một lớp trên bản đồ trang chủ. Đã thử 2026-11-10, chưa làm vì tín hiệu quá nhiễu để đưa thẳng lên bản đồ: `api.ioda.inetintel.cc.gatech.edu/v2/outages/events?entityType=country` (không cần key) trả 159 sự kiện trong 2 ngày, phần lớn là nhiễu BGP 1 giờ ở hàng chục đảo nhỏ cùng một phút (lỗi đo), còn "sự cố" lớn nhất là Trung Quốc theo tín hiệu Google (gtr), tức kiểm duyệt chứ không phải mất mạng. Nếu làm: chỉ lấy `bgp`, điểm ≥ 1000, dài ≥ 2 giờ, bỏ các sự kiện bắt đầu cùng 10 phút ở ≥ 5 nước; cần thêm bảng toạ độ tâm nước theo mã ISO2 (file `countries-110m.json` chỉ có ISO3, không có điểm đặt nhãn). Ngày thử, bộ lọc này còn Ethiopia 20 giờ, Namibia, Réunion, Venezuela 29 giờ, Gibraltar 118 giờ, chưa đối chiếu được với tin tức.
- [x] Lobsters bên cạnh Hacker News; bão từ Kp (NOAA SWPC) và lịch phóng tên lửa trên trang này. Xong 2026-11-10: tab Lobsters trong panel "Dân lập trình đang đọc gì", panel Không gian (Kp theo NOAA SWPC, lịch phóng).

## Trang Việt Nam

Trang `/vi/vietnam` xong ngày 2026-11-09 (BR-22, LLDD 04 §3c). Việt Nam cũng là hàng cuối trên trang Vĩ mô thế giới để so với các nước khác.

- [x] Gom những gì đã có: VN-Index và độ rộng thị trường, USD/VND (Yahoo, Vietcombank), USDT/VND P2P, vàng SJC và chênh lệch với giá thế giới, tin VnExpress.
- [x] Vĩ mô năm từ IMF: bảng 5 năm trước đến 2 năm sau, kèm trung bình nhóm mới nổi. World Bank WDI không thêm gì so với IMF nên bỏ.
- [x] Lãi suất điều hành NHNN: khai báo tay trong `config/policy-rates.ts`, nguồn `sbv` ghi thành series `sbv:REFI` và báo lỗi khi quá 180 ngày chưa kiểm tra lại (2026-11-09).
- [x] CPI tháng: IMF CPI dataset có Việt Nam đến 9/2026 (`imf:CPI_M:VNM`). GDP quý: World Bank GEM (`wb:GDP:VNM`), chậm khoảng một quý so với Tổng cục Thống kê.
- [ ] Không có nguồn miễn phí: PMI Việt Nam (S&P Global).
