import type { Bi } from "@/lib/i18n";

// Funds whose quarterly 13F holdings report the tech page reads (lib/sources/sec13f.ts).
// `cik` is the filer's SEC number: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=<cik>

export interface Fund13FDef {
  /** Item id in `items` kind `fund13f`. */
  id: string;
  cik: number;
  name: Bi;
  /** What kind of fund it is, shown under the moves because it decides how far a quarter-old report can be copied. */
  style: Bi;
}

export const FUNDS_13F: Fund13FDef[] = [
  {
    id: "rentech",
    cik: 1037389,
    name: { en: "Renaissance Technologies", vi: "Renaissance Technologies" },
    style: {
      en: "Renaissance is a quant fund: models pick thousands of stocks and hold them briefly, so a position can be gone by the time the report is filed. The report covers all its funds together and does not say which fund bought what.",
      vi: "Renaissance là quỹ định lượng: mô hình chọn hàng nghìn mã và giữ không lâu, nên một vị thế có thể đã không còn khi báo cáo được nộp. Báo cáo gộp mọi quỹ của họ, không cho biết quỹ nào mua gì.",
    },
  },
];
