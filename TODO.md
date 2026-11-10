# TODO

Việc đã chốt nhưng để làm sau. Thiết kế chung của trang Vĩ mô ở BRD-21 (`BRD/02-business-requirements.md`) và LLDD 04 §3b.

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
