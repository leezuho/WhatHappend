<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# WhatHappend: ghi chú cho agent

Dashboard cá nhân song ngữ (vi/en): worker Node gọi các nguồn dữ liệu và ghi vào SQLite, web Next.js chỉ đọc ra hiển thị. Cách chạy và cây thư mục xem `README.md`. Thiết kế chi tiết ở `TechDesign/` (HLDD và LLDD 01–07), yêu cầu nghiệp vụ ở `BRD/`. Đọc file LLDD liên quan trước khi sửa lớn ở phần đó.

## Kiểm tra trước khi báo xong

- `npm run typecheck`, `npm run lint` và `npm test` (`node:test` chạy qua tsx, file trong `test/`). Hàm cần DB thì test trên `openDb(":memory:")` từ `lib/db`, không đụng `data/`.
- Sửa một nguồn: chạy thử bằng `npm run fetch -- <id>`, xem log và số bản ghi.
- Sửa giao diện: `npm run dev`, xem cả `/vi` lẫn `/en`, cả chế độ sáng lẫn tối.

## Quy tắc kiến trúc

- Web (`app/`, `components/`, `lib/queries.ts`) không bao giờ gọi API bên ngoài hay gọi AI. Chỉ `worker/` và `scripts/` (qua `lib/sources/`) mới fetch. Muốn web kích hoạt một việc thì ghi cờ vào bảng `kv` để worker xử lý ở tick sau (ví dụ `app/api/brief/route.ts`).
- Web chỉ được import type từ `lib/sources/`, không import fetcher. Lịch chạy để riêng trong `config/sources.ts` để web tính độ cũ của dữ liệu mà không kéo fetcher vào bundle.
- Thêm nguồn: tạo `lib/sources/<id>.ts` (fetch → validate bằng zod → upsert, trả về số bản ghi), thêm vào `SOURCE_META` trong `config/sources.ts`, đăng ký trong `lib/sources/index.ts`. Chi tiết ở `TechDesign/LLDD/03-worker-and-sources-framework.md`.
- Nguồn lỗi thì cứ throw: runner ghi lỗi vào `source_status` và panel tự hiện "Dữ liệu cũ" hoặc "Lỗi nguồn". Không nuốt lỗi, không trả dữ liệu giả. Nhiều endpoint là không chính thức (Yahoo, SSI, PNJ, Vietcombank…) nên code phải chịu được việc chúng hỏng.
- Schema SQLite nằm trong `lib/db/index.ts` (`CREATE TABLE IF NOT EXISTS`, không có migration). Đổi schema thì cập nhật `TechDesign/LLDD/01-database-schema.md` và báo người dùng xoá `data/` nếu bảng cũ không còn tương thích.
- Key AI chỉ đọc từ env ở server và worker, không bao giờ đưa xuống client.

## Song ngữ

- Chuỗi giao diện nằm trong `messages/en.json` và `messages/vi.json`. `en.json` quy định cấu trúc, thiếu key bên `vi.json` sẽ thành lỗi typecheck. Luôn thêm key vào cả hai file.
- Tên khai báo trong `config/` dùng kiểu `Bi` (`{ en, vi }`) và hiển thị qua `pick()` trong `lib/i18n.ts`.

## Next.js 16

- Middleware ở đây là `proxy.ts` (export hàm `proxy`), không phải `middleware.ts`. Nó chuyển các đường dẫn chưa có ngôn ngữ sang `/vi` hoặc `/en`.
- Gặp API lạ thì tra `node_modules/next/dist/docs/` như block ở đầu file dặn.
