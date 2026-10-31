# LLDD 06 — Risk Regime

> Phiên bản 0.2 · Ngày 2026-10-31 · Trạng thái: Đã triển khai
> Liên quan: [BRD-06](../../BRD/02-business-requirements.md) · [04 Danh mục chỉ số](../../BRD/04-indicator-catalog.md) · [04 Frontend](04-frontend.md)
> Mã nguồn: `lib/signals/risk-regime.ts` (`computeRegime`), đọc qua `getRegime()` trong `lib/queries.ts`, hiển thị bằng `RegimeBadge` trên TopBar

## 1. Mục tiêu

Gộp vài chỉ báo căng thẳng thị trường thành **một trạng thái**:

| Trạng thái | Ý nghĩa |
|---|---|
| `risk-on` | Thị trường ưa rủi ro, các chỉ báo căng thẳng thấp |
| `neutral` | Bình thường hoặc tín hiệu lẫn lộn |
| `risk-off` | Thị trường né rủi ro, căng thẳng cao |
| `unknown` | Không đủ dữ liệu |

Quy tắc phải đơn giản, minh bạch và giải thích được. Tooltip hiện đóng góp của từng thành phần.

## 2. Thành phần (đúng như `computeRegime`)

Mọi thành phần được đổi dấu sao cho **z dương = căng thẳng hơn bình thường**.

| `key` | Series | Biến đo | Dấu | Lý do |
|---|---|---|---|---|
| `vix` | `yahoo:^VIX` | Mức đóng cửa | `+` | VIX cao = sợ hãi |
| `hy` | `fred:BAMLH0A0HYM2` | Mức (%) | `+` | Spread rộng = tín dụng căng thẳng |
| `dxy` | `yahoo:DX-Y.NYB` | % thay đổi 21 quan sát (≈ 1 tháng) | `+` | USD tăng nhanh = thanh khoản toàn cầu thắt |
| `curve` | `fred:T10Y2Y` | Mức 2s10s (điểm %) | `−` | Đường cong phẳng/đảo ngược hơn bình thường = căng thẳng hơn |
| `fsi` | `fred:STLFSI4` | Mức (series tuần) | `+` | 0 = mức căng thẳng trung bình |

## 3. Chuẩn hóa

- Lấy các điểm trong **1 năm tính từ điểm mới nhất** của series (query đọc 400 ngày gần nhất).
- `z = (x_latest − mean(x)) / sd(x)` trên cửa sổ đó (độ lệch chuẩn tổng thể), rồi nhân với dấu ở §2.
- Bỏ thành phần nếu có **ít hơn 30 giá trị** hoặc `sd = 0`.
- Không clamp z và không kiểm tra độ tươi của điểm cuối (staleness đã hiện ở badge panel).

## 4. Tổng hợp và ngưỡng

```
if số thành phần hợp lệ < 2          → "unknown" (score = null)
score = trung bình z (trọng số bằng nhau)
VIX mới nhất > 35                     → "risk-off", override = "VIX > 35"
score ≥ +0.75                         → "risk-off"
score ≤ −0.50                         → "risk-on"
còn lại                               → "neutral"
```

Ngưỡng hai phía không đối xứng có chủ đích: chỉ báo căng thẳng thường lệch phải, nên cần bằng chứng mạnh hơn mới kết luận risk-off.

## 5. Kết quả trả về và hiển thị

```ts
interface RegimeResult {
  regime: "risk-on" | "neutral" | "risk-off" | "unknown";
  score: number | null;
  components: { key: "vix" | "hy" | "dxy" | "curve" | "fsi"; latest: number; z: number }[];
  override?: string;               // "VIX > 35"
}
```

- `RegimeBadge` (server, `<details>` trên TopBar): chấm trạng thái (`--good` risk-on, `--axis` neutral, `--critical` risk-off) **luôn kèm nhãn chữ**.
- Mở ra: câu giải thích, điểm `score`, z từng thành phần (tên song ngữ; z > 0,5 tô `--down`, z < −0,5 tô `--up`) và nhắc lại ngưỡng.

## 6. Pseudo-code

```ts
function computeRegime({ vix, hy, dxy, curve, fsi }): RegimeResult {
  const parts = [];
  add("vix", vix, level, +1);
  add("hy", hy, level, +1);
  add("dxy", dxy, pctChange21, +1);
  add("curve", curve, level, −1);
  add("fsi", fsi, level, +1);
  // add(): cửa sổ 1 năm → transform → z của giá trị cuối (cần ≥ 30 giá trị, sd > 0) → nhân dấu
  if (parts.length < 2) return { regime: "unknown", score: null, components: parts };
  const score = mean(parts.map(p => p.z));
  if (last(vix) > 35) return { regime: "risk-off", score, components: parts, override: "VIX > 35" };
  return { regime: score <= −0.5 ? "risk-on" : score >= 0.75 ? "risk-off" : "neutral", score, components: parts };
}
```

### 6.1 Khác biệt so với thiết kế v0.1 (có thể cải tiến sau)

| Thiết kế v0.1 | Cài đặt hiện tại |
|---|---|
| 2s10s dùng thay đổi 21 phiên, chỉ tính sau khi từng đảo ngược | Dùng mức 2s10s, đảo dấu, luôn tính |
| STLFSI dùng thẳng giá trị (đã chuẩn hóa) | STLFSI cũng lấy z 1 năm như các thành phần khác |
| Clamp z về [−3, 3], kiểm tra độ tươi 7/14 ngày, tối thiểu 60/26 điểm | Không clamp, không kiểm tra độ tươi, tối thiểu 30 giá trị |
| Trả thêm `asOf`, `contribution`, sắp xếp theo đóng góp | Chỉ `latest` và `z`, giữ thứ tự cố định |

## 7. Ví dụ tính

| Thành phần | Giá trị mới nhất | Mean 1Y | SD 1Y | z (đã nhân dấu) |
|---|---|---|---|---|
| VIX | 24,0 | 17,0 | 4,0 | +1,75 |
| HY OAS | 3,9% | 3,4% | 0,4 | +1,25 |
| DXY Δ21 | +2,1% | +0,1% | 1,2 | +1,67 |
| 2s10s | 0,20 | 0,40 | 0,20 | +1,00 (mức thấp hơn bình thường → căng hơn) |
| STLFSI | −0,2 | −0,5 | 0,3 | +1,00 |

- `score = (1,75 + 1,25 + 1,67 + 1,00 + 1,00) / 5 = 1,33` → **risk-off**. Không có ghi đè vì VIX = 24 < 35.
- Ví dụ ngược lại: VIX z = −1,0, HY z = −1,0, DXY z = −0,5 (chỉ 3 thành phần đủ dữ liệu) → `score = −0,83` → **risk-on**.

## 8. Kiểm thử

- Chưa có unit test tự động. Đề xuất: dữ liệu tổng hợp cho các trường hợp đủ/thiếu thành phần, `sd = 0`, ghi đè VIX, giá trị biên đúng tại ngưỡng −0,5 và +0,75.
- Đã kiểm tra thủ công với dữ liệu thật ngày 2026-10-31: badge trên TopBar hiện "Trung tính" (ảnh chụp giao diện).
- Kiểm tra lại với các giai đoạn lịch sử: 03/2020 phải ra risk-off, giữa 2021 phải ra risk-on hoặc neutral.
