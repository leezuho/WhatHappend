# 03 — Yêu cầu phi chức năng

> Phiên bản 0.3 · Ngày 2026-10-31 · Trạng thái: Đã triển khai
> Liên quan: [01 Tổng quan](01-project-overview.md) · [02 Yêu cầu nghiệp vụ](02-business-requirements.md) · [HLDD](../TechDesign/HLDD/HLDD.md) · [LLDD Worker](../TechDesign/LLDD/03-worker-and-sources-framework.md)

## NFR-01 — Độ tươi dữ liệu

Mỗi nguồn có chu kỳ cập nhật riêng do worker quản lý.

| Nhóm dữ liệu | Chu kỳ lấy dữ liệu | Ngưỡng stale (3 × chu kỳ) |
|---|---|---|
| Giá thị trường (chỉ số, FX, hàng hóa, crypto) | 1–5 phút | 3–15 phút |
| Tin tức, sự kiện bản đồ | 10 phút | 30 phút |
| Vĩ mô FRED | 6 giờ | 18 giờ |
| File cập nhật hàng ngày (GPR, GSCPI, World Bank, IMF, BIS, CO₂…) | 24 giờ | 72 giờ |
| Trending, prediction markets | 10–30 phút | 30–90 phút |
| AI Daily Brief | 1 lần/ngày, lúc 06:00 Asia/Ho_Chi_Minh | Brief không phải của hôm nay |

Nguồn bị lỗi được thử lại sau `max(1 phút, chu kỳ/4)` (xem [LLDD 03](../TechDesign/LLDD/03-worker-and-sources-framework.md)).

## NFR-02 — Hiệu năng

- **Không gọi API bên ngoài khi render trang.** Trang chỉ đọc từ SQLite cục bộ.
- Khung trang (header, tiêu đề panel, skeleton) hiện ngay. Dữ liệu từng panel stream vào qua `<Suspense>`.
- Thời gian render server của trang đầy đủ dưới 1 giây trên máy cục bộ, với DB vài chục MB.
- Thư viện nặng chỉ tải phía client cho panel cần đến. Ví dụ: MapLibre chỉ tải cho panel bản đồ.

## NFR-03 — Độ tin cậy và cô lập lỗi

- Một nguồn lỗi (timeout, đổi định dạng, HTTP 4xx/5xx) **không bao giờ** làm trang hoặc worker dừng.
- Phản hồi từ API được kiểm tra bằng zod. Sai định dạng thì lần chạy đó thất bại và ghi rõ nguyên nhân vào `source_status`/`fetch_log`, **không ghi dữ liệu rác** vào DB.
- Panel hiện badge stale khi dữ liệu cũ hoặc lỗi (BR-19).
- Khởi động lại worker không gọi lại đồng loạt mọi API: thời điểm chạy được tính từ `source_status.last_run`.
- Ghi dữ liệu theo kiểu idempotent (upsert hoặc thay snapshot), nên chạy lại không sinh bản ghi trùng.

## NFR-04 — Giới hạn tần suất gọi và phép lịch sự với nhà cung cấp

- Tuân thủ giới hạn gọi API của từng nguồn. Ví dụ: GDELT tối đa khoảng 1 request mỗi 5 giây; Launch Library có giới hạn mỗi giờ.
- Gửi User-Agent nhận diện ứng dụng. Chỉ dùng UA trình duyệt khi nguồn bắt buộc.
- Chỉ retry 1 lần với lỗi 5xx/429, có backoff.

## NFR-05 — Bảo mật

- API key AI (`AI_API_KEY`, Gemini hoặc Claude) chỉ nằm trong `.env.local`: được gitignore (mẫu `.env*`), quyền file 600. Repo chỉ có `.env.example` với giá trị rỗng. Tài liệu và log không chứa key.
- Key **không bao giờ** gửi xuống trình duyệt. Chỉ worker dùng key. Web server chỉ đọc DB và kiểm tra AI đã cấu hình hay chưa (`isAiConfigured()`), không đọc giá trị key ra giao diện.
- Nội dung bên ngoài (tiêu đề, tên series) được coi là dữ liệu không tin cậy: render dạng text, không dùng `innerHTML`.
- Không có đăng nhập. Ứng dụng mặc định chỉ chạy trên localhost hoặc mạng cá nhân.

## NFR-06 — Song ngữ (i18n)

- Hai locale: `vi` (mặc định) và `en`. Định dạng số và ngày theo `vi-VN` hoặc `en-US`.
- Mọi chuỗi giao diện nằm trong file từ điển. Thiếu khóa thì lỗi được phát hiện khi chạy kiểm tra kiểu TypeScript.
- Nội dung tin được dịch bằng AI một lần khi lấy về và lưu cả hai bản. Thiếu bản dịch thì hiện bản gốc.

## NFR-07 — Chi phí

- Mục tiêu chi phí AI là **vài cent mỗi ngày**, tối đa 0,10 USD/ngày. Với Gemini gói miễn phí, chi phí là **0**, chỉ bị giới hạn hạn mức theo phút và theo ngày.
  - Dịch và phân loại tiêu đề: model tier `fast` (mặc định `gemini-flash-lite-latest`, hoặc `claude-haiku-5-5`), gửi theo lô, mỗi tiêu đề chỉ dịch một lần.
  - Daily Brief: model tier `brief` (mặc định `gemini-flash-latest`, hoặc `claude-sonnet-5-5`), 1 lần/ngày, thêm các lần người dùng bấm làm mới.
  - Dòng Gemini Pro không có hạn mức ở gói miễn phí (lỗi 429 `limit: 0`). Chỉ dùng Pro khi có gói trả phí.
- Mọi nguồn dữ liệu đều miễn phí hoặc dùng free tier.
- Không cần hạ tầng đám mây.

## NFR-08 — Accessibility và trình bày dữ liệu

- Dùng bộ màu biểu đồ đã kiểm định an toàn cho người mù màu (CVD-safe), có bước màu riêng cho sáng/tối (xem [LLDD Frontend](../TechDesign/LLDD/04-frontend.md)).
- Ý nghĩa **không bao giờ chỉ truyền bằng màu**: trạng thái cảnh báo luôn kèm biểu tượng và nhãn chữ; delta có dấu +/−.
- Biểu đồ có từ 2 series trở lên thì luôn có legend.
- Có tooltip, và có chế độ xem bảng cho mọi biểu đồ đường/cột (nút "Bảng"); bản đồ có chế độ "Danh sách".
- Không dùng biểu đồ hai trục tung.
- Tôn trọng `prefers-reduced-motion` (ticker không chạy).
- Thao tác được bằng bàn phím: nút, tab, drawer.

## NFR-09 — Khả năng bảo trì

- **Thêm một nguồn mới = 1 file trong `lib/sources/` + 1 dòng đăng ký trong registry.**
- Mã nguồn TypeScript ở chế độ strict. Phản hồi bên ngoài được kiểm tra bằng zod.
- Danh mục series, ngưỡng cảnh báo và danh sách feed nằm trong `config/`, tách khỏi logic.
- Mỗi nguồn chạy độc lập được bằng `npm run fetch -- <source-id>`.

## NFR-10 — Khả năng vận hành

- Chạy bằng 2 tiến trình: web (`npm run dev` hoặc `npm run start`) và worker (`npm run worker`).
- Toàn bộ trạng thái nằm trong một file SQLite (`./data/whathappend.db`). Muốn reset thì xóa thư mục `./data`.
- `fetch_log` lưu lịch sử chạy trong 7 ngày để chẩn đoán.

## NFR-11 — Pháp lý và điều khoản sử dụng

- Một số nguồn **không chính thức**: Yahoo Finance (qua `yahoo-finance2`), giá vàng SJC (scrape), endpoint VN-Index công khai. Các nguồn này:
  - chỉ dùng cho **mục đích cá nhân, phi thương mại**;
  - được cache trong DB, không gọi lại theo từng request;
  - được gọi với tần suất thấp, đúng mức cần thiết.
- Dữ liệu từ nguồn chính thức (FRED, World Bank, IMF, BIS, USGS, NASA, NOAA, WHO, Wikimedia…) phải ghi rõ nguồn trên panel.
- Tin tức chỉ hiển thị tiêu đề, tóm tắt ngắn và link về bài gốc. Không sao chép toàn văn.
- Brief AI có ghi chú: "Tóm tắt tự động, có thể sai sót; không phải khuyến nghị đầu tư".
- Nếu sau này chia sẻ công khai, phải rà soát lại ToS của từng nguồn. Việc này ngoài phạm vi phiên bản này.
