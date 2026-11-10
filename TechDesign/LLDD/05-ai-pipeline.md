# LLDD 05 — AI pipeline

> Phiên bản 0.3 · Ngày 2026-10-31 · Trạng thái: Đã chạy thật với Gemini; Claude chưa chạy thật
> Liên quan: [HLDD](../HLDD/HLDD.md) (ADR-10) · [01 Database schema](01-database-schema.md) · [03 Worker](03-worker-and-sources-framework.md) · [BRD-07, BRD-08](../../BRD/02-business-requirements.md) · [NFR-07](../../BRD/03-non-functional-requirements.md)
> Mã nguồn: `lib/ai/{config,provider,taxonomy,translate,brief,brief-shared,insights,insights-shared}.ts`, `lib/ai/providers/{gemini,anthropic}.ts`, `lib/signals/notable.ts`, `app/api/brief/route.ts`; các nguồn `translate`, `brief` và `insights` trong `SOURCE_META`

Phần AI **không gắn với một nhà cung cấp cụ thể**. `translate` và `brief` chỉ gọi một hàm `generateJson()`. Provider (Gemini hoặc Claude), key và model chọn qua biến môi trường. Ngày 2026-10-31 đã **chạy thật với Gemini** bằng một key Google AI Studio gói miễn phí (xem §6). Adapter Claude qua kiểm tra kiểu nhưng **chưa chạy thật** vì chưa có key.

## 0. Lớp provider

### 0.1 Cấu hình (`lib/ai/config.ts`)

File này không import SDK nào, nên cả worker và web server đều dùng được. Web dùng nó để hiện "Cần API key".

| Biến môi trường | Ý nghĩa |
|---|---|
| `AI_PROVIDER` | `gemini` hoặc `anthropic`. Tùy chọn. Giá trị khác thì coi như **chưa cấu hình** và có lý do (`AI_PROVIDER must be "gemini" or "anthropic"`) |
| `AI_API_KEY` | Key chung. Không có `AI_PROVIDER` thì đoán provider từ key: `sk-ant-…` là `anthropic`, còn lại là `gemini` |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY` | Key riêng từng provider, dùng khi không có `AI_API_KEY`. Không có `AI_PROVIDER` và `AI_API_KEY` thì ưu tiên Gemini rồi đến Anthropic |
| `AI_MODEL_BRIEF` | Model viết Daily Brief (tier `brief`) |
| `AI_MODEL_FAST` | Model dịch và phân loại hàng loạt (tier `fast`) |
| `AI_DAILY_LIMIT_BRIEF` | Số lần gọi model `brief` mỗi ngày (§4.1). Mặc định 20 với Gemini (gói miễn phí), không giới hạn với Claude; `0` = không giới hạn |
| `AI_DAILY_LIMIT_FAST` | Như trên cho model `fast`. Mặc định không giới hạn |

**Model mặc định:**

| Provider | `brief` | `fast` |
|---|---|---|
| `gemini` | `gemini-flash-latest` | `gemini-flash-lite-latest` |
| `anthropic` | `claude-sonnet-5-5` | `claude-haiku-5-5` |

- Alias `-latest` của Google luôn trỏ tới model ổn định mới nhất, nên không hỏng khi một phiên bản bị ngừng.
- `gemini-pro-latest` viết brief tốt hơn nhưng **không có hạn mức miễn phí**. Đã kiểm chứng: key gói miễn phí nhận 429 `limit: 0, model: gemini-3.1-pro`. Có gói trả phí thì đặt `AI_MODEL_BRIEF=gemini-pro-latest`.

API: `aiStatus()` trả về `{ ok: true, config }` hoặc `{ ok: false, reason }`; `isAiConfigured()`; `AI_ENV_HINT = "AI_API_KEY (Gemini or Claude)"`. Các biến cũ `BRIEF_MODEL`, `FAST_MODEL` và cơ chế chỉ dựa vào `ANTHROPIC_API_KEY` **đã bỏ**.

### 0.2 Hợp đồng chung (`lib/ai/provider.ts`)

```ts
generateJson({ tier: "brief" | "fast", system, user, schema, maxTokens?, db? })
  → { data: T | null, model, stopReason, usage: { input, output } | null }
```
- `tier` quyết định model (`config.models[tier]`) và mức suy nghĩ: `brief` là medium, `fast` là low.
- `data = null` khi model từ chối, bị cắt ngang, hoặc trả JSON sai schema. Nơi gọi tự xử lý (§2, §3).
- Mỗi adapter đều kiểm tra đầu ra bằng **cùng một zod schema**. Zod là hợp đồng duy nhất giữa prompt và code.
- Chưa cấu hình AI mà vẫn gọi thì ném lỗi `AI not configured: <reason>`. Thực tế runner đã chặn trước (§0.4).
- Truyền `db` thì lần gọi được tính vào ngân sách ngày của model (§4.1): hết ngân sách thì ném lỗi ngay, không gọi API; gặp 429 hết quota ngày thì khoá model đến lúc reset. Mọi nguồn AI đều truyền `db`.

### 0.3 Adapter

**Gemini** (`providers/gemini.ts`, `@google/genai` 2.32):
- Gọi `models.generateContent` với `systemInstruction`, `responseMimeType: "application/json"`, và `responseJsonSchema = z.toJSONSchema(schema)` đã bỏ khóa `$schema` (Gemini không nhận khóa này).
- `thinkingConfig.thinkingLevel`: `MEDIUM` cho `brief`, `LOW` cho `fast`. Nếu model báo 400 có nhắc tới "thinking" (dòng 2.x dùng `thinkingBudget`, không dùng level) thì gọi lại một lần, bỏ `thinkingConfig`.
- `maxOutputTokens` mặc định 32 768, vì token suy nghĩ của Gemini cũng tính vào giới hạn này.
- SDK tự thử lại tối đa 4 lần với lỗi **500/502/503/504**, giãn dần 5 → 60 giây (`httpOptions.retryOptions`). **Không** thử lại 429: với key miễn phí, 429 thường là hết hạn mức trong ngày, nên để bộ lập lịch xử lý.
- `model` lấy từ `modelVersion` (tên thật mà alias trỏ tới, ví dụ `gemini-3.8-flash`). `usage.output` gồm cả token suy nghĩ.

**Anthropic** (`providers/anthropic.ts`, `@anthropic-ai/sdk` 1.3):
- Gọi `messages.parse` với `output_config: { format: zodOutputFormat(schema), effort }`. Effort là `medium` cho `brief`, `low` cho `fast`. `max_tokens` 16 000 (không streaming).
- Với các model nhận được fallback phía server (`claude-sonnet-5-5`, `claude-opus-5-5`, `claude-opus-5`, `claude-fable-5-1`), gọi `beta.messages.parse` kèm `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"` và `betaZodOutputFormat`. Model khác dùng đường thường.
- `stop_reason === "refusal"` thì trả `data = null`.

### 0.4 Chặn khi chưa cấu hình

- `SOURCE_META.translate`, `SOURCE_META.brief` và `SOURCE_META.insights` có `needsAi: true`. Thay cho `requiresEnv` cũ.
- `runner.missingEnv()` thêm `aiStatus().reason` vào danh sách thiếu. Worker `skip` nguồn và in lý do.
- Khi khởi động, worker in `AI: gemini (brief …, fast …)` hoặc `AI: off`.
- Web: `getPanelStatus` hiện chip "Cần API key" (tooltip `AI_ENV_HINT`); `BriefBody` dùng `isAiConfigured()`.

## 1. Tổng quan

| Tác vụ | Model | Kích hoạt | Đầu vào | Đầu ra |
|---|---|---|---|---|
| Dịch và phân loại tiêu đề | tier `fast` (mặc định `gemini-flash-lite-latest` / `claude-haiku-5-5`) | Nguồn `translate`, mỗi 5 phút | Tiêu đề chưa xử lý | `articles.title_vi`, `title_en`, `region`, `topic`; `events.title_vi`; `items.title_vi` (chỉ `kind` `polymarket`, `who`) |
| Daily Brief | tier `brief` (mặc định `gemini-flash-latest` / `claude-sonnet-5-5`) | Nguồn `brief`: 06:00 Asia/Ho_Chi_Minh, cộng nút làm mới | Tin 24h + Vital Signs + sự kiện | Bảng `briefs` (2 dòng: `vi`, `en`) |
| Diễn giải chỉ số | tier `brief` | Nguồn `insights`, mỗi 30 phút, chỉ gọi model khi có ghi chú cần viết | Chỉ số đáng chú ý + 60 tiêu đề 24h | Bảng `insights` (1 dòng mỗi chỉ số) |

Cả ba nguồn khai báo `needsAi: true` (§0.4). Chưa cấu hình AI thì runner bỏ qua (skipped) và panel hiện "Cần API key".

## 2. Dịch và phân loại (`translate`)

**Chọn bản ghi:**
- `articles` có `title_vi IS NULL` hoặc `title_en IS NULL` hoặc `region IS NULL`, mới nhất trước. Lô 40 bài, tối đa 4 lô (160 bài) mỗi lần chạy. Mỗi phần tử gồm `{ id, lang, source, title }`.
- Văn bản ngắn tiếng Anh cần dịch sang tiếng Việt, gộp chung 1 lần gọi: tối đa 40 `events` có `title_vi IS NULL`, và tối đa 40 `items` có `title_vi IS NULL` thuộc `kind` `polymarket`, `polymarket_crypto`, `who`, `hf_papers` (`TRANSLATED_ITEM_KINDS`). Các `kind` khác (tên bài Wikipedia, launch, lịch…) giữ nguyên. Sự kiện GDELT tự ghi sẵn `title_vi` nên không cần dịch.

**Prompt (tóm tắt):**
- Dịch sang ngôn ngữ còn lại (`en` ↔ `vi`), giữ nguyên tên riêng, ký hiệu tiền tệ và mã chứng khoán.
- Phân loại `region` và `topic` theo danh sách cố định bên dưới.
- Chỉ trả về JSON.

**Kiểm tra đầu ra bằng zod:**
```ts
z.object({ items: z.array(z.object({
  id: z.string(),
  title_en: z.string(), title_vi: z.string(),
  region: z.enum(REGIONS), topic: z.enum(TOPICS),
})) })
```
- Ghi `UPDATE … WHERE id = ?` trong một transaction.
- Phần tử không được trả về thì ghi tiêu đề gốc vào cột tương ứng và `region = global`, `topic = other`, để không bị gửi lại mãi.

**Cache:** mỗi bản ghi chỉ dịch **một lần**, vì đã có bản dịch thì không được chọn lại. `replaceEvents` và `replaceItems` giữ `title_vi` qua các lần thay snapshot khi tiêu đề không đổi (xem [01](01-database-schema.md#5-cách-ghi-store-helpers)). Trước 2026-11-09, `replaceItems` xoá luôn bản dịch nên kèo Polymarket bị dịch lại sau mỗi lần nguồn chạy (15 phút).

**Lỗi:** lô trả `data = null` (bị từ chối, bị cắt ngang hoặc sai schema) thì ghi tiêu đề gốc (chống vòng lặp thử lại vô hạn) và ghi log. Lỗi HTTP/SDK còn lại sau khi đã thử lại (ví dụ 429 hết hạn mức) làm lần chạy lỗi, `source_status.ok = 0`; worker thử lại sau `max(1 phút, interval/4)`.

### Taxonomy

| `region` | Ý nghĩa |
|---|---|
| `global` | Toàn cầu / nhiều khu vực |
| `asia` | Châu Á (trừ Việt Nam và Trung Đông) |
| `vietnam` | Việt Nam |
| `europe` | Châu Âu (gồm Nga, Ukraine) |
| `americas` | Bắc, Trung, Nam Mỹ |
| `middle-east` | Trung Đông và Bắc Phi |
| `africa` | Châu Phi hạ Sahara |
| `oceania` | Úc, NZ, Thái Bình Dương |

| `topic` | Ý nghĩa |
|---|---|
| `politics` | Chính trị, bầu cử, ngoại giao |
| `conflict` | Chiến tranh, khủng bố, bạo động |
| `economy` | Kinh tế vĩ mô, chính sách, thương mại |
| `markets` | Thị trường tài chính |
| `crypto` | Tiền mã hóa, blockchain |
| `business` | Doanh nghiệp |
| `tech` | Công nghệ, AI |
| `science` | Khoa học, vũ trụ |
| `climate` | Khí hậu, thiên tai, môi trường |
| `health` | Y tế, dịch bệnh |
| `society` | Xã hội, văn hóa |
| `sports` | Thể thao (bị loại khỏi đầu vào của Brief) |
| `other` | Khác |

## 3. Daily Brief (`brief`)

**`isDue(now, status, db)`** đúng khi đồng thời:
- lần chạy trước không lỗi trong vòng 30 phút qua;
- **hoặc** có cờ `kv['brief:force']` mới hơn brief gần nhất và brief đó đã cũ ít nhất 10 phút (`MIN_FORCE_GAP`; yêu cầu sớm hơn được giữ lại và chạy khi đủ 10 phút), **hoặc** chưa có brief cho ngày hôm nay (Asia/Ho_Chi_Minh) và giờ ≥ 06:00;
- có ít nhất 15 bài trong 24 giờ qua.

Nút "Viết lại" (`BriefRefresh`) gọi `POST /api/brief`. Route này chỉ ghi cờ `kv['brief:force']` (không xóa sau khi chạy; so sánh theo thời gian với `briefs.created_at`). Web server không gọi API AI nào (giữ nguyên tắc của ADR-04). Kiểu `StoredBrief` và `FORCE_KEY` nằm ở `lib/ai/brief-shared.ts` để web không import SDK.

**Đầu vào** (gom từ DB, không gọi API ngoài):
1. Tối đa 90 tiêu đề trong 24 giờ qua (tiếng Anh nếu có), gộp theo `title_key`, bỏ `topic = sports` và bỏ các báo chuyên mục crypto và công nghệ (`DESK_OUTLETS` = `CRYPTO_OUTLETS` + `TECH_OUTLETS`). Mỗi tiêu đề được đánh số `n` kèm `source`, `region`, `topic`.
2. Snapshot 12 Vital Signs: tên, giá trị, % thay đổi.
3. Thiên tai đáng chú ý trong 48 giờ: sự kiện mức orange/red và động đất M ≥ 6 (tối đa 15).

**Đầu ra (JSON, kiểm tra bằng zod), sinh cho cả `vi` và `en`:**
Một lần gọi sinh cả hai ngôn ngữ: `{ vi: BriefLang, en: BriefLang }`, với
```json
{
  "headline": "Một câu tóm tắt ngày hôm nay",
  "bullets": [
    { "title": "Ngắn gọn", "body": "1–3 câu: chuyện gì và vì sao quan trọng", "refs": [3, 17] }
  ],
  "watch": ["2–4 điều cần theo dõi 1–2 ngày tới"]
}
```
- 5–7 bullet, quan trọng nhất trước. `refs` là số thứ tự tiêu đề đầu vào. Khi lưu, ref không hợp lệ bị bỏ, và mỗi báo chỉ giữ **một** chip: tiêu đề đầu tiên được dẫn từ báo đó. Tối đa 4 chip `{ title, url, source }`.
- Lưu `StoredBrief` (`headline`, `bullets[].sources`, `watch`, `model`, `headlineCount`) vào `briefs (date, lang, content, created_at)`, upsert theo `(date, lang)`. `model` là tên model thật mà provider trả về (ví dụ `gemini-3.8-flash`). Log provider, model và số token vào/ra.
- `data = null` thì lần chạy lỗi (`brief not produced by <model> (stop_reason=…)`).

**Guardrails trong prompt:**
- Chỉ tóm tắt **thông tin có trong đầu vào**. Không bổ sung sự kiện hay số liệu ngoài.
- Không tự thêm chức danh, vai trò hay mô tả cho người và tổ chức (ví dụ "cựu", "quyền") nếu tiêu đề không ghi. Chỉ dẫn này được thêm sau khi lần chạy Gemini đầu tiên viết "cựu Tổng thống Trump" dù tiêu đề không có chữ "cựu".
- Mỗi ý phải dựa trên các tiêu đề được đánh số (`refs`); UI hiện nguồn thành chip link cạnh từng ý.
- Không đưa khuyến nghị đầu tư, không dự báo giá.
- Giọng văn trung lập. Với chủ đề nhạy cảm, nêu theo nguồn ("theo BBC…").
- Chân panel ghi "Dựa trên N tin · thời điểm · model" để người đọc biết đây là tóm tắt tự động.

**Khi lỗi:** panel hiện brief gần nhất (theo `created_at`) kèm badge stale (theo `source_status` của `brief`). Chưa cấu hình AI thì hiện hướng dẫn đặt `AI_API_KEY` (Gemini hoặc Claude) trong `.env.local`. Chưa có brief nhưng đã có key thì hiện lời giải thích lịch 06:00 và nút "Viết lại".

## 3a. Diễn giải chỉ số (`insights`)

Người không chuyên nhìn con số không hiểu nó nói gì, nên chỉ số nào nổi bật thì có thêm 2–3 câu giải thích bằng lời thường.

**Chọn chỉ số** (`lib/signals/notable.ts`, quy tắc thuần, web và worker dùng chung): duyệt mọi khóa trong `SERIES` (CPI tính theo y/y), gắn lý do:
- `crit` / `warn`: vượt ngưỡng trong `config/series.ts` (cùng `alertOf` mà tile dùng);
- `move`: thay đổi mới nhất ≥ 2 lần độ lệch chuẩn của các thay đổi trong ~400 ngày (cần > 30 điểm);
- `high` / `low`: cao hoặc thấp nhất 1 năm (cần ≥ 120 điểm, nên chỉ áp dụng chuỗi theo ngày).

Điểm xếp hạng: `crit` 3, `warn` 2, `high`/`low` 1,5, `move` 0,6 × |z| (tối đa z = 5). Lấy 8 chỉ số đầu.

**Khi nào viết lại** (`needsNote`): chỉ số chưa có ghi chú, có lý do mới chưa nằm trong `basis` đã lưu, hoặc ghi chú cũ hơn 12 giờ. Lý do chỉ mất đi (dao động mạnh nhạt dần trong phiên, `crit` lùi về `warn`) không kích hoạt viết lại, vì z-score lơ lửng quanh ngưỡng sẽ làm `basis` đổi qua lại và tốn một lần gọi model mỗi lượt. Mọi chỉ số cần viết gộp vào **một** lần gọi model.

**Đầu vào mỗi chỉ số:** tên, mô tả tĩnh (`explain`), giá trị, ngày số liệu (`asOf`), thay đổi (lợi suất tính bằng điểm phần trăm thay cho bp), lý do và biên độ 1 năm. Kèm 60 tiêu đề 24 giờ (`recentHeadlines` của brief); nếu có chỉ số crypto trong danh sách thì thêm 25 tiêu đề từ báo crypto (`recentHeadlines(…, "crypto")`), có Nasdaq hoặc SOX (`TECH_SIGNS`) thì thêm 25 tiêu đề từ báo công nghệ (`recentHeadlines(…, "tech")`).

**Prompt** yêu cầu: (1) giải nghĩa mức hiện tại bằng lời thường, (2) nêu nguyên nhân **chỉ khi** tiêu đề nói rõ và ghi số tiêu đề vào `refs`, (3) có thể nêu tác động thường gặp tới người dân (giá xăng, lãi vay, Việt Nam), không dự báo, không khuyến nghị đầu tư. Số liệu tuần/tháng có `asOf` cũ hơn tin nên không được gán cho tin 24 giờ. Mỗi ghi chú dưới 60 từ, viết song ngữ.

**Hiển thị:** panel "Điểm đáng chú ý" dưới bản đồ, cùng ghi chú trong hộp thoại chi tiết của tile. Chip nguồn lấy từ `refs`, tối đa 2, mỗi báo một chip. Chưa có ghi chú (chưa cấu hình AI hoặc worker chưa chạy) thì hiện mô tả tĩnh `explain`.

**Chạy thật (2026-10-31, `gemini-3.8-flash`):** 8 chỉ số, khoảng 2,7K token vào và 4K token ra, 77 giây (một lần khác mất 5,5 phút vì Gemini quá tải phải thử lại).

## 3b. Nhận định vĩ mô tuần (`macronote`, `lib/ai/macronote.ts`)

Phase 3 của trang Vĩ mô thế giới: mỗi tuần một đoạn nhận định bằng lời thường, đọc từ chính các con số của trang.

**Khi nào chạy** (`isDue`): tuần ISO theo giờ Việt Nam (`isoWeek`) khác tuần đã kiểm tra gần nhất, model `brief` còn ít nhất 2 lượt trong ngày (một cho nhận định, một chừa cho bản tin), và lần lỗi trước đã qua 6 giờ. Tức là chạy ở lượt đầu tiên của thứ Hai (giờ Việt Nam).

**Đầu vào** (`macroInput`, khoảng 6.000 ký tự ≈ 1,8K token): 8 ô Nhịp kinh tế thế giới, bảng sức khoẻ 16 nền kinh tế dạng chữ gọn (`cellText`: "3.7 Sep '26 [warn]"), pha chu kỳ, 7 tín hiệu suy thoái Mỹ, danh sách thay đổi so với nhận định tuần trước (`changesSince`: số tháng/quý/năm khác đi, lợi suất lệch ≥ 0,25 điểm %, tỷ giá ≥ 2 điểm %) và các quyết định lãi suất, số liệu tác động cao trong 8 ngày tới. Bảng sức khoẻ đọc qua `lib/data/macro.ts` (`scorecardRows`, `cycleRows`), dùng chung với web.

**Tiết kiệm lượt gọi:** một lần gọi mỗi tuần cho cả hai ngôn ngữ; gửi phần thay đổi thay vì cả bảng tuần trước; băm (`hash`) các số tháng/quý/năm và pha chu kỳ, trùng với nhận định trước thì không gọi model, chỉ ghi nhận đã kiểm tra tuần này; chưa đủ 8 nền kinh tế có CPI tháng thì báo lỗi thay vì viết từ dữ liệu thiếu.

**Đầu ra** (zod): `{ en, vi }`, mỗi bản có `headline`, 4–6 `bullets` (`title`, `body`), một ý dành cho Việt Nam so với các nước, và 2–4 mục `watch` lấy từ danh sách sắp tới. Prompt cấm bịa số, yêu cầu nói rõ khi số liệu đã cũ.

**Lưu:** `kv` khoá `macro:note` (`StoredMacroNote` trong `macronote-shared.ts`: tuần viết, tuần đã kiểm tra, model, `hash`, bảng rút gọn để so tuần sau, hai bản văn). Web đọc qua `getMacroNote()` và hiện ở panel thứ hai của trang Vĩ mô.

## 3c. Nhận định công nghệ tuần (`technote`, `lib/ai/technote.ts`)

Cùng khuôn với `macronote`, cho trang Công nghệ.

**Khi nào chạy** (`isDue`): tuần ISO (`isoWeek` của `macronote`) khác tuần đã kiểm tra, model `brief` còn ít nhất **3** lượt trong ngày (nhận định này, nhận định vĩ mô và bản tin), lần lỗi trước đã qua 6 giờ.

**Đầu vào** (`techInput`, khoảng 6.000 ký tự): 25 câu chuyện công nghệ lớn nhất trong 7 ngày (tin công nghệ như `getTechNews`, tiêu đề tiếng Anh, gộp bằng `clusterStories`, xếp theo số bài rồi số báo), model mới trên OpenRouter trong 7 ngày kèm giá, lỗ hổng KEV mới trong 7 ngày, sự cố dịch vụ đang mở (bỏ sự cố mở quá `LONG_INCIDENT_DAYS`), 20 cổ phiếu công nghệ (hôm nay, 30 ngày, từ đầu năm), doanh thu tháng chuỗi phần cứng AI Đài Loan, ba tile tuyển dụng, hạn hết hỗ trợ trong 120 ngày tới. Chưa đủ 15 câu chuyện thì báo lỗi.

**Tiết kiệm lượt gọi:** một lần mỗi tuần cho cả hai ngôn ngữ; băm 10 câu chuyện đầu, model mới và lỗ hổng mới, trùng với lần trước thì không gọi.

**Đầu ra:** cùng schema với `macronote` (`headline`, 4–6 `bullets`, 2–4 `watch`, bản `en` và `vi`). Prompt yêu cầu chỉ dùng tiêu đề và số được đưa, ghi "theo tin" khi tiêu đề là tin đồn.

**Lưu:** `kv` khoá `tech:note` (`StoredTechNote` trong `technote-shared.ts`). Web đọc qua `getTechNote()` (`lib/queries-tech.ts`) và hiện ở panel "Công nghệ tuần này" (`TechNoteBody` → `WeeklyNote`, dùng chung với `MacroNoteBody`).

## 4. Chi phí và hạn mức

**Số đo thật** (Gemini, 2026-10-31):

| Tác vụ | Một lần chạy |
|---|---|
| `translate` | 220 mục trong 41 giây (4 lô bài báo + 1 lô văn bản ngắn) |
| `brief` (`gemini-3.8-flash`) | 90 tiêu đề, khoảng 3,8K token vào và 2,7–3,0K token ra (gồm token suy nghĩ), 2–3 phút |

**Gemini gói miễn phí:**
- Không mất tiền, nhưng bị giới hạn số lần gọi theo phút và theo ngày cho từng model.
- Dòng Pro có hạn mức 0, nên mặc định dùng Flash/Flash-Lite.
- Hết hạn mức trả 429. Lần chạy đó lỗi, worker tự thử lại sau.

**Gói trả phí** (Gemini hoặc Claude):
- Chi phí bằng tổng token nhân đơn giá hiện hành của model. Tra đơn giá lúc dùng, không ghi cứng trong tài liệu.
- Mục tiêu vẫn là **vài cent mỗi ngày**, tối đa 0,10 USD ([NFR-07](../../BRD/03-non-functional-requirements.md)).

### 4.1 Ngân sách lượt gọi mỗi ngày (`lib/ai/budget.ts`)

Ngày 2026-11-09, `gemini-flash-latest` trỏ tới `gemini-3.8-flash` với hạn mức gói miễn phí **20 lần gọi mỗi ngày**. Bản tin hôm đó không viết được (429 `generate_content_free_tier_requests, limit: 20`) vì `insights` (cùng model, có thể chạy mỗi 30 phút) đã dùng hết lượt.

- Mỗi lần gọi qua `generateJson({ …, db })` cộng một vào `kv` khoá `ai:calls:<ngày>:<model>`. Ngày tính theo giờ Thái Bình Dương (`quotaDay`), vì Google reset hạn mức lúc nửa đêm giờ đó. Bộ đếm cũ quá 7 ngày bị xoá.
- Gặp 429 có "per day" (`isDailyQuotaError`) thì ghi `ai:exhausted:<model>` = ngày đó: model bị khoá đến khi sang ngày mới, các nguồn không gọi thử vô ích nữa.
- `callsLeft(db, config, tier)` = hạn mức (`dailyLimit`) − số lần đã gọi, bằng 0 khi bị khoá.
- Chia 20 lượt của model `brief`: bản tin chạy khi còn lượt (`isDue` bỏ qua khi `callsLeft = 0`); nhận định vĩ mô tuần cần còn ≥ 2 lượt, nhận định công nghệ tuần ≥ 3; `insights` chỉ dùng model `brief` khi còn hơn `BRIEF_RESERVE` = 5 lượt (bản tin, một lần bấm "Viết lại", hai nhận định tuần và một lần thử lại), còn lại dùng model `fast`.
- Bộ đếm chỉ thấy các lần gọi của worker này. Key dùng chung ở nơi khác (AI Studio, máy khác) vẫn tiêu hạn mức thật; khi đó 429 sẽ khoá model như trên.

**Biện pháp giữ chi phí:** gửi theo lô, mỗi tiêu đề chỉ dịch một lần, giới hạn số bản ghi mỗi lần chạy, brief 1 lần/ngày, nhận định vĩ mô và công nghệ mỗi loại 1 lần/tuần, `insights` chỉ gọi model khi có ghi chú mới cần viết (thường vài lần mỗi ngày) và nhường model `brief` khi sắp hết lượt (§4.1). Mỗi lần gọi đều ghi số token vào log qua `ctx.log`.

## 5. Chưa cấu hình AI

| Chức năng | Hành vi |
|---|---|
| Tiêu đề tin | Hiện tiêu đề gốc. Bộ lọc khu vực chỉ có các `region` gán sẵn theo feed (VnExpress kinh doanh/thời sự → `vietnam`, SCMP → `asia`); bộ lọc chủ đề ẩn và hiện ghi chú "cần AI_API_KEY" |
| Events / items | Hiện tiêu đề gốc |
| Brief | Panel hiện chip "Cần API key" và hướng dẫn đặt `AI_API_KEY` (Gemini hoặc Claude) |
| Điểm đáng chú ý | Vẫn liệt kê chỉ số theo quy tắc, kèm mô tả tĩnh thay cho ghi chú AI và dòng nhắc đặt `AI_API_KEY` |

## 6. Kết quả chạy thật (2026-10-31, Gemini)

- **Key:** Google AI Studio gói miễn phí, định dạng `AQ.…`. Chạy được trên `generativelanguage.googleapis.com`. Endpoint Vertex (`aiplatform.googleapis.com`) trả 403 "API disabled" và không được dùng. Key chỉ nằm trong `.env.local`.
- **`translate`:** 220 mục trong 41 giây.
  - 160 bài báo có đủ hai ngôn ngữ, `region` và `topic`.
  - 96 sự kiện bản đồ được dịch.
  - 30 item được dịch: `polymarket` 12, `who` 8, `airquality` 10 (có sẵn tên tiếng Việt).
  - Tiếng Việt tự nhiên, đúng tên riêng.
- **`brief`:**
  - Lần đầu với `gemini-pro-latest` lỗi 429 `limit: 0`, nên đổi mặc định sang `gemini-flash-latest` (trỏ tới `gemini-3.8-flash`).
  - Đọc 90 tiêu đề, viết 6 ý, có chip nguồn và 3 mục "cần theo dõi". Mỗi lần mất 2–3 phút.
  - Một lần gặp 503 "high demand", nên đã bật retry trong SDK.
- **Luồng end-to-end đã kiểm chứng:** nút "Viết lại" → `POST /api/brief` → cờ `kv['brief:force']` → worker → brief mới hiện trên panel, chân panel ghi đúng model.
- **Claude:** adapter qua kiểm tra kiểu nhưng chưa gọi thật.
