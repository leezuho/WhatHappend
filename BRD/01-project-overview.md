# 01 — Tổng quan dự án

> Phiên bản 0.3 · Ngày 2026-10-31 · Trạng thái: Đã triển khai M1–M7
> Liên quan: [02 Yêu cầu nghiệp vụ](02-business-requirements.md) · [03 NFR](03-non-functional-requirements.md) · [04 Danh mục chỉ số](04-indicator-catalog.md) · [HLDD](../TechDesign/HLDD/HLDD.md)

## 1. Bối cảnh và vấn đề

Để nắm được "thế giới hôm nay ra sao", người dùng hiện phải mở rất nhiều nguồn:
- trang tin quốc tế và trong nước;
- ứng dụng chứng khoán và crypto;
- trang dữ liệu vĩ mô (FRED, World Bank);
- bản đồ thiên tai, mạng xã hội, lịch kinh tế…

Cách làm này có các vấn đề sau:

- **Tốn thời gian.** Mỗi sáng mất 20–40 phút chuyển qua lại giữa các tab.
- **Thiếu bức tranh tổng thể.** Tin tức, giá thị trường và chỉ số vĩ mô bị tách rời, nên khó thấy mối liên hệ. Ví dụ: căng thẳng ở Trung Đông → dầu Brent tăng → kỳ vọng lạm phát tăng.
- **Không biết nên xem gì.** Có quá nhiều con số, trong khi chuyên gia chỉ theo dõi một bộ "dấu hiệu sinh tồn" nhỏ.
- **Rào cản ngôn ngữ.** Phần lớn nguồn chất lượng là tiếng Anh, còn tin trong nước là tiếng Việt.

## 2. Tầm nhìn

> Một màn hình duy nhất cho người dùng biết **thế giới đang diễn ra gì, có điều gì bất thường, và điều đó có ý nghĩa gì**, đọc được trong vài phút, bằng tiếng Việt hoặc tiếng Anh.

## 3. Mục tiêu

| Mã | Mục tiêu |
|---|---|
| OBJ-1 | Gom tin tức, thị trường, vĩ mô, địa chính trị, thiên tai, trending, prediction markets và tin Việt Nam về một trang. |
| OBJ-2 | Ưu tiên thông tin theo cách chuyên gia nhìn thế giới, chia 3 tầng: **Vital Signs → Bối cảnh → Câu chuyện** (xem [04](04-indicator-catalog.md)). |
| OBJ-3 | Làm nổi bật bất thường: ô đổi màu khi vượt ngưỡng, badge Risk Regime. |
| OBJ-4 | Dùng AI để tóm tắt ("Hôm nay thế giới có gì") và dịch tiêu đề tin. |
| OBJ-5 | Chạy trên máy cá nhân với nguồn dữ liệu miễn phí và chi phí AI rất thấp. |

## 4. Người dùng mục tiêu

- **Người dùng chính:** chủ sở hữu dashboard, dùng cho mục đích cá nhân. Đây là người quan tâm đến kinh tế, thị trường và thời sự quốc tế, đọc được cả tiếng Việt lẫn tiếng Anh.
- **Ngữ cảnh sử dụng:**
  - Mở dashboard mỗi sáng để nắm tình hình.
  - Thỉnh thoảng xem lại trong ngày khi có biến động.
  - Có thể để dashboard chạy trên màn hình phụ.
- **Không có** nhiều người dùng, phân quyền hay đăng nhập.

## 5. Phạm vi

### 5.1 Trong phạm vi

1. **Vital Signs:** 12 ô KPI (giá, % thay đổi, sparkline 30 ngày, đổi màu theo ngưỡng).
2. **Bối cảnh vĩ mô:** yield curve, lạm phát so với lãi suất điều hành, stress panel, jobless claims, GDPNow, bảng cân đối Fed.
3. **Risk Regime:** badge risk-on / neutral / risk-off kèm giải thích.
4. **AI Daily Brief:** song ngữ, tạo lúc 06:00 giờ Việt Nam, có nút làm mới.
5. **Tin tức:** từ RSS của 11 báo (GDELT dùng cho điểm nóng trên bản đồ), loại trùng, phân loại theo khu vực/chủ đề, dịch tiêu đề.
6. **Bản đồ sự kiện:** động đất, thiên tai, cháy rừng, điểm nóng tin tức.
7. **Lịch sắp tới:** lịch kinh tế, họp FOMC, phóng tàu vũ trụ (bầu cử: chưa làm, xem BR-10).
8. **Trending:** Wikipedia (EN/VI), Hacker News (Reddit đã loại vì bị chặn).
9. **Prediction markets:** Polymarket, Kalshi.
10. **Môi trường và sức khỏe:** CO₂, nhiệt độ toàn cầu, chất lượng không khí, cảnh báo dịch bệnh của WHO.
11. **Góc Việt Nam:** VN-Index, USD/VND, giá vàng SJC, tin VnExpress.
12. **Tiện ích:** song ngữ VI/EN, dark mode, watchlist, hộp thoại chi tiết, cảnh báo dữ liệu cũ (stale).
13. **Trang Công nghệ (BR-23):** cổ phiếu công nghệ và bán dẫn, trạng thái các đám mây và dịch vụ AI, model AI mới, nghiên cứu AI, lỗ hổng đang bị khai thác, tin công nghệ.

Trạng thái chi tiết từng yêu cầu: xem cột **Trạng thái** trong [02](02-business-requirements.md#tóm-tắt).

### 5.2 Ngoài phạm vi (phiên bản này)

- Đăng nhập, nhiều người dùng, chia sẻ công khai.
- Giao dịch, đặt lệnh, tư vấn đầu tư.
- Ứng dụng di động native, push notification.
- Dữ liệu trả phí: Bloomberg, Refinitiv, CME FedWatch API, PMI của S&P Global/ISM.
- Dữ liệu tick theo thời gian thực (độ trễ vài phút là chấp nhận được).
- Lưu trữ lịch sử dài hạn ngoài phạm vi các nguồn cung cấp.

## 6. Giả định và ràng buộc

| Loại | Nội dung |
|---|---|
| Giả định | Máy cá nhân có Internet ổn định. Người dùng tự chạy 2 tiến trình: web server và worker. |
| Giả định | Các API miễn phí (FRED, World Bank, USGS, GDELT…) vẫn hoạt động và giữ nguyên định dạng. |
| Ràng buộc | Chỉ dùng nguồn miễn phí hoặc có free tier. Một số nguồn không chính thức (Yahoo Finance, giá SJC, VN-Index) có thể hỏng bất cứ lúc nào. |
| Ràng buộc | Không có backend đám mây. Dữ liệu nằm trong một file SQLite cục bộ. |
| Ràng buộc | Chi phí AI chỉ vài cent mỗi ngày (xem [NFR-07](03-non-functional-requirements.md)). |
| Ràng buộc | Mọi API key là tùy chọn. Thiếu key thì module tương ứng hiện trạng thái "cần key", không làm hỏng trang. |
| Ràng buộc | Môi trường kỹ thuật: Node 26, Next.js 16.4, npm (xem [HLDD](../TechDesign/HLDD/HLDD.md)). |

## 7. Thước đo thành công

| Mã | Thước đo | Mục tiêu |
|---|---|---|
| KPI-1 | Thời gian nắm tình hình mỗi sáng | Dưới 2 phút (đọc Brief + Vital Signs) |
| KPI-2 | Độ tươi của giá (Vital Signs) | Không cũ quá 5 phút trong giờ giao dịch |
| KPI-3 | Độ tươi của tin tức | Không cũ quá 10–15 phút |
| KPI-4 | Độ tươi của dữ liệu vĩ mô | Cập nhật trong vòng 6 giờ sau khi nguồn công bố |
| KPI-5 | Tỷ lệ nguồn chạy thành công (`source_status.ok`) | ≥ 90% số nguồn ở trạng thái OK tại mọi thời điểm |
| KPI-6 | Khả năng chịu lỗi | Một nguồn hỏng không làm trang lỗi; panel liên quan hiện cảnh báo stale |
| KPI-7 | Chi phí AI | Dưới 0,10 USD/ngày (mục tiêu vài cent) |
| KPI-8 | Thời gian tải trang (máy cục bộ) | Khung trang hiện ngay, dữ liệu panel stream vào dưới 1 giây |

## 8. Các bên liên quan

| Vai trò | Ai | Trách nhiệm |
|---|---|---|
| Chủ sở hữu sản phẩm, người dùng cuối | Người dùng | Đặt yêu cầu, nghiệm thu, vận hành trên máy cá nhân |
| Phát triển | Người dùng cùng trợ lý AI lập trình | Thiết kế, xây dựng, kiểm thử |
| Nhà cung cấp dữ liệu | FRED, World Bank, IMF, BIS, USGS, GDACS, NASA, GDELT, Wikimedia, Polymarket, Kalshi, các báo… | Cung cấp dữ liệu theo điều khoản của từng bên |
| Nhà cung cấp AI | Google Gemini (đang dùng, key AI Studio) hoặc Anthropic Claude, chọn qua `AI_PROVIDER` / `AI_API_KEY` | Dịch, phân loại, tóm tắt |

## 9. Thuật ngữ

Ý nghĩa các chỉ số (VIX, 2s10s, DXY, HY OAS…) nằm trong [04 — Danh mục chỉ số](04-indicator-catalog.md). Các thuật ngữ khác:

| Thuật ngữ | Nghĩa |
|---|---|
| Vital Signs | Bộ 12 chỉ số "dấu hiệu sinh tồn", nhìn 10 giây là nắm được tình hình |
| Risk Regime | Trạng thái tâm lý thị trường tổng hợp: risk-on (ưa rủi ro), neutral, risk-off (né rủi ro) |
| Stale | Dữ liệu của panel đã cũ hơn mức cho phép hoặc lần lấy gần nhất bị lỗi |
| Source / Fetcher | Một module lấy dữ liệu từ một nguồn bên ngoài |
| Worker | Tiến trình chạy nền, lấy dữ liệu theo lịch rồi ghi vào SQLite |
| Brief | Bản tóm tắt AI "Hôm nay thế giới có gì" |
