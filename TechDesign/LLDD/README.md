# LLDD — Low Level Design Documents

> Phiên bản 0.3 · Ngày 2026-10-31 · Trạng thái: Đã triển khai
> Liên quan: [HLDD](../HLDD/HLDD.md) · [BRD](../../BRD/README.md)

| # | Tài liệu | Nội dung |
|---|---|---|
| 01 | [Database schema](01-database-schema.md) | Các bảng SQLite, khóa, index, quy ước id, cách ghi, PRAGMA, thời hạn lưu |
| 02 | [Data sources](02-data-sources.md) | 33 nguồn đã kiểm chứng: endpoint, cách lưu, giới hạn tần suất, lưu ý, nguồn đã loại |
| 03 | [Worker và framework nguồn](03-worker-and-sources-framework.md) | Interface `Source`, runner, scheduler, HTTP helpers, store helpers, cách thêm nguồn mới |
| 04 | [Frontend](04-frontend.md) | Routing, layout, mẫu Panel, query layer, client components, đặc tả biểu đồ, token màu, bản đồ, i18n |
| 05 | [AI pipeline](05-ai-pipeline.md) | Lớp provider cấu hình được (Gemini / Claude), dịch và phân loại tiêu đề, Daily Brief, guardrails, hạn mức và chi phí, kết quả chạy thật |
| 06 | [Risk Regime](06-risk-regime.md) | Thuật toán chỉ báo tổng hợp risk-on / neutral / risk-off |
| 07 | [Kiểm thử và vận hành](07-testing-and-operations.md) | Kế hoạch kiểm chứng, runbook, xử lý sự cố |
