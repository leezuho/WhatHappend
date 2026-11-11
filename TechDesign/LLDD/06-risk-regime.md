# LLDD 06 — Risk Regime

> Phiên bản 0.3 · Ngày 2026-11-11 · Trạng thái: Đã triển khai
> Liên quan: [BRD-06](../../BRD/02-business-requirements.md) · [04 Danh mục chỉ số](../../BRD/04-indicator-catalog.md) · [04 Frontend](04-frontend.md)
> Mã nguồn: `lib/signals/risk-regime.ts` (`computeRegime`, `mergeDaily`), đọc DB qua `regimeFromDb` (`lib/data/regime.ts`, dùng được cả ở web lẫn worker), web gọi qua `getRegime()` trong `lib/queries.ts`, hiển thị bằng `RegimeBadge` trên TopBar

## 1. Mục tiêu

Gộp vài chỉ báo căng thẳng thị trường thành **một trạng thái**:

| Trạng thái | Ý nghĩa |
|---|---|
| `risk-on` | Thị trường ưa rủi ro, các chỉ báo căng thẳng thấp |
| `neutral` | Bình thường hoặc tín hiệu lẫn lộn |
| `risk-off` | Thị trường né rủi ro, căng thẳng cao |
| `unknown` | Không đủ dữ liệu |

Quy tắc phải đơn giản, minh bạch và giải thích được. Popover hiện giá trị gốc, ngày và z của từng thành phần.

### 1.1 Vì sao có v2 (2026-11-11)

Ngày 2026-11-10 bản v0.2 báo "Né rủi ro" (điểm 0,88) trong khi 20/20 thị trường tăng, S&P +2,3%, VIX 20. Hai nguyên nhân:

- **Cửa sổ 1 năm quá ngắn.** HY OAS 3,42% là mức thấp so với lịch sử (căng thẳng thật thường từ 5% trở lên), nhưng so với một năm spread hẹp bất thường (trung bình 2,90%, độ lệch chuẩn 0,21) thì thành z +2,5. 2s10s 0,25 cũng thành z +1,9 so với một năm quanh 0,5, trong khi panel Đường cong lợi suất ghi "Bình thường".
- **Gộp mức với tốc độ.** HY tăng từ 2,60% (28/8) lên 3,42% là tín hiệu thật, nhưng là tín hiệu về hướng đi chứ không phải mức căng thẳng hiện tại.

v2 đo mỗi thành phần so với tối đa 10 năm, thay HY bằng chênh lệch Baa trong điểm (FRED chỉ cho 3 năm HY, xem §2), đưa tốc độ giãn của HY ra thành cảnh báo phân kỳ riêng, thêm xu hướng và độ rộng của cổ phiếu, giảm trọng số cho số liệu cũ và chỉ đổi trạng thái khi tín hiệu giữ đủ 2 phiên.

## 2. Thành phần

Mọi thành phần được đổi dấu sao cho **z dương = căng thẳng hơn bình thường**, rồi kẹp về [−3, +3].

| `key` | Series | Biến đo | Cách chuẩn hoá | Dấu | Tuổi tối đa (đủ trọng số) |
|---|---|---|---|---|---|
| `vix` | `fred:VIXCLS` (lịch sử) ghép `yahoo:^VIX` (mới nhất) | Mức đóng cửa | z, ≤ 10 năm | `+` | 4 ngày |
| `credit` | `fred:BAA10Y` | Lợi suất trái phiếu doanh nghiệp Baa (Moody's) trừ lợi suất 10 năm, % | z, ≤ 10 năm | `+` | 5 ngày |
| `dxy` | `yahoo:DX-Y.NYB` | % thay đổi 21 phiên | z, ≤ 10 năm (thực tế khoảng 1 năm vì Yahoo chỉ lưu 14 tháng) | `+` | 4 ngày |
| `curve` | `fred:T10Y2Y` | Mức 2s10s (điểm %) | z, ≤ 10 năm | `−` | 5 ngày |
| `fsi` | `fred:STLFSI4` | Mức (series tuần) | Dùng thẳng: chỉ số đã chuẩn hoá, 0 = trung bình | `+` | 14 ngày |
| `trend` | `fred:SP500` (lịch sử) ghép `yahoo:^GSPC` (mới nhất) | % cao hơn trung bình 200 phiên | z, ≤ 10 năm | `−` | 4 ngày |
| `breadth` | 20 chỉ số trong `WORLD_INDICES` | Tỷ lệ chỉ số đóng cửa trên trung bình 50 phiên | Thang cố định: `2 × (0,5 − tỷ lệ)`, tức tất cả trên MA50 → −1, một nửa → 0, không chỉ số nào → +1 | | Bỏ chỉ số không có giá trong 7 ngày; cần ≥ 5 chỉ số |

- **Vì sao Baa thay cho HY.** Từ năm 2026 FRED chỉ phục vụ 3 năm gần nhất của các series ICE BofA (`BAMLH0A0HYM2` bắt đầu từ 2023-11-13, kiểm tra 2026-11-11), nên không có 10 năm để chuẩn hoá. `BAA10Y` của Moody's có từ 1986. Hai series đi cùng nhau ở các đợt căng thẳng (3/2020, 2022); ngày 2026-11-10 Baa ở 1,51% (z 10 năm −1,24) trong khi HY tăng nhanh, đúng tình huống §5 tách riêng.
- **Lịch sử dài.** `fred` lấy 10 năm cho `FRED_LONG_CODES` (`VIXCLS`, `SP500`, `BAA10Y`, `T10Y2Y`, `STLFSI4`; `config/series.ts`), các series khác 3 năm. `SP500` trên FRED chỉ có 10 năm do giấy phép của S&P. `mergeDaily` ghép theo ngày UTC, nguồn Yahoo thắng khi trùng ngày.
- `years` của mỗi thành phần là số năm lịch sử thực có trong cửa sổ (popover hiện khi rê chuột). Cần ít nhất 250 giá trị (khoảng 1 năm ngày) để tính z.

## 3. Chuẩn hoá và trọng số

- Với thành phần kiểu z: lấy điểm mới nhất tại thời điểm xét và mọi điểm trong 10 năm trước nó; `z = (x − mean) / sd` (độ lệch chuẩn tổng thể), nhân dấu, kẹp ±3. Bỏ thành phần nếu có ít hơn 250 giá trị hoặc `sd = 0`.
- **Trọng số theo tuổi:** tuổi = thời điểm xét − ngày của điểm mới nhất. Tuổi ≤ ngưỡng ở §2 → trọng số 1; ≤ 3 lần ngưỡng → 0,5 (popover ghi nghiêng, rê chuột hiện "Số liệu cũ, nửa trọng số"); lâu hơn → bỏ thành phần.
- `score = Σ(w·z) / Σw`.

## 4. Trạng thái

```
if số thành phần hợp lệ < 2           → "unknown" (score = null)
VIX (giá trị của thành phần vix) > 35  → "risk-off", override = "VIX > 35"
score ≥ +0.75                          → "risk-off"
score ≤ −0.50                          → "risk-on"
còn lại                                → "neutral"
```

Ngưỡng hai phía không đối xứng có chủ đích: chỉ báo căng thẳng thường lệch phải, nên cần bằng chứng mạnh hơn mới kết luận risk-off.

**Giữ 2 phiên.** Phiên là các ngày có giá VIX (hoặc S&P nếu thiếu VIX). Hàm đọc 15 phiên gần nhất: các phiên trước đọc tại cuối ngày của phiên đó, phiên mới nhất đọc tại `now` (nên số liệu ngừng cập nhật bị giảm trọng số). Trạng thái ban đầu là kết quả của phiên đầu tiên có dữ liệu; sau đó chỉ đổi khi kết quả mới giữ **2 phiên liên tiếp**. Ghi đè VIX > 35 đổi ngay, không chờ. Kết quả trả thêm:

- `since`: phiên đầu của trạng thái hiện tại; `sinceAtLeast = true` khi trạng thái đã có từ đầu 15 phiên xét (popover ghi "từ … hoặc sớm hơn").
- `pending`: kết quả của phiên mới nhất khi nó khác trạng thái đang hiện ("Phiên gần nhất nghiêng về …").

## 5. Cảnh báo phân kỳ tín dụng

Không tính vào điểm. Bật khi **cả hai**:

- HY OAS (`fred:BAMLH0A0HYM2`, điểm mới nhất trong 10 ngày) cao hơn mức thấp nhất của 63 quan sát trước đó (khoảng 3 tháng) **ít nhất 50 bp** (làm tròn tới bp);
- S&P 500 vẫn cao hơn trung bình 200 phiên.

Trên 3 năm dữ liệu HY, luật này bật ở 8/2024 (carry trade yên), 25/3/2025 (hai tuần trước cú giảm tháng 4), vài đợt ngắn năm 2025–2026 và liên tục từ 30/9/2026. Khi bật, badge có dấu "!" và popover mở đầu bằng "Tín dụng xấu đi trong khi cổ phiếu tăng" kèm HY hiện tại, đáy và ngày, khoảng cách S&P tới MA200.

## 6. Kết quả trả về và hiển thị

```ts
interface RegimeResult {
  regime: "risk-on" | "neutral" | "risk-off" | "unknown";
  score: number | null;          // của phiên mới nhất
  components: {
    key: "vix" | "credit" | "dxy" | "curve" | "fsi" | "trend" | "breadth";
    value: number;               // giá trị gốc (breadth: tỷ lệ 0–1)
    ts: number;                  // ngày của điểm mới nhất
    z: number;                   // đã nhân dấu, kẹp ±3
    weight: number;              // 1 hoặc 0.5
    years?: number;              // số năm lịch sử của z
    count?: { above: number; total: number }; // breadth
  }[];
  override?: string;             // "VIX > 35"
  since: number | null;
  sinceAtLeast: boolean;
  pending: Regime | null;
  divergence: { hy; hyTs; low; lowTs; spxGap } | null;
}
```

- `RegimeBadge` (server, `<details>` trên TopBar): chấm trạng thái (`--good` risk-on, `--axis` neutral, `--critical` risk-off) **luôn kèm nhãn chữ**; thêm dấu "!" nền `warning` khi có cảnh báo phân kỳ.
- Mở ra (rộng 22rem, không quá màn hình trừ 2rem): khối cảnh báo phân kỳ (nếu có), câu giải thích, điểm và "từ ngày", dòng `pending` (nếu có), bảng thành phần (tên · giá trị gốc · ngày · z; z > 0,5 tô `--down`, z < −0,5 tô `--up`), dòng quy tắc.
- Giá trị gốc theo đơn vị riêng: VIX và STLFSI là số, tín dụng là %, USD và S&P là % có dấu, 2s10s theo `fmtValue` của series, độ rộng là "10/20".

### 6.1 Lịch sử theo ngày (từ 2026-11-11)

Badge tính lại toàn bộ lịch sử mỗi lần đọc, nên điểm của một ngày cũ có thể khác điểm người dùng thấy hôm đó (số liệu được sửa, số trễ đến sau). Nguồn `changes` (LLDD 03, LLDD 01 §3.13) ghi điểm như worker thấy vào series `calc:REGIME_SCORE`, mỗi ngày Việt Nam một điểm (lần chạy sau trong ngày ghi đè), và ghi mỗi lần trạng thái đổi vào bảng `changes` (`kind = 'regime'`) kèm giờ nhận ra. Dải "Có gì mới từ lần trước" đọc bảng này; cảnh báo Telegram (TODO) sẽ đọc cùng nguồn.

## 7. Kiểm thử

`test/signals.test.ts`:

- cần ít nhất 2 thành phần; ramp về mức cực trị đọc ra risk-on/risk-off; VIX > 35 ghi đè ngay;
- một phiên căng thẳng chỉ thành `pending`, hai phiên mới đổi trạng thái, một phiên dịu lại không đổi ngược;
- mức được so với 10 năm (chín năm quanh 5%, một năm quanh 2,6%, hiện 3,4% → z âm);
- số liệu trễ 8 ngày nửa trọng số, trễ 20 ngày bị bỏ; z kẹp ở 3;
- phân kỳ bật khi HY +60 bp và S&P trên MA200, tắt khi S&P giảm hoặc HY chỉ +40 bp;
- độ rộng 15/20 → z −0,5; `mergeDaily`.

Kiểm tra lại trên lịch sử (FRED, 2026-11-11, chưa gồm DXY và độ rộng vì thiếu lịch sử dài): 24/12/2018 +1,58, 16/3/2020 +2,41, 16/6/2022 +1,18, 12/10/2022 +1,31, 8/4/2025 +1,04 (risk-off); 15/6/2021 −0,68, 11/11/2024 −0,60 (risk-on); 5/8/2024 VIX 38 ghi đè; 10/11/2026 −0,18 (neutral, kèm cảnh báo phân kỳ).
