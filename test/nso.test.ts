import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { NSO_FIELDS, nsoId } from "@/config/nso";
import { MACRO_COUNTRIES } from "@/config/countries";
import { cpiIds, gdpIds } from "@/lib/data/macro";
import { freshest } from "@/lib/data/series";
import { NSO_REPORTS_KEY, vnMonthly } from "@/lib/data/nso";
import { checkPick, checkReport, fieldTs, monthPattern, normText, pendingReports, reportMonth, type NsoPick, type ReportRef } from "@/lib/sources/nso";
import { upsertSeries } from "@/lib/sources/store";

// Vietnam's monthly figures read by AI from the statistics office's report
// (lib/sources/nso.ts): the model only points; these checks decide.

const field = (key: string) => NSO_FIELDS.find((f) => f.key === key)!;
const pick = (key: string, raw: string | null, quote: string | null, neg = false): NsoPick => ({ key, raw, quote, neg });
const OCT = { year: 2026, month: 10 };
const month = (y: number, m: number) => Date.UTC(y, m - 1, 1);

// Sentences of the October 2026 report (nso.gov.vn post 62888), as normalized.
const TEXT = normText(
  "2. Sản xuất công nghiệp Sản xuất công nghiệp tháng Mười tiếp tục duy trì xu hướng tăng trưởng tích cực. Chỉ số sản xuất công nghiệp (IIP) tháng Mười ước tăng 2,3% so với tháng trước và tăng 15,0% so với cùng kỳ năm trước. Tính chung mười tháng năm 2026, chỉ số IIP tăng 12,4% so với cùng kỳ năm trước. " +
    "Xuất khẩu hàng hóa tháng Mười đạt 64,67 tỷ USD, tăng 8,7% so với tháng trước và tăng 51,4% so với cùng kỳ năm trước. Tính chung mười tháng năm 2026, kim ngạch xuất khẩu hàng hóa đạt 499,24 tỷ USD, tăng 27,5% so với cùng kỳ năm trước. " +
    "Nhập khẩu hàng hóa đạt 57,36 tỷ USD, giảm 1,4% so với tháng trước và tăng 43,1% so với cùng kỳ năm trước. Theo số liệu sơ bộ, cán cân thương mại hàng hóa tháng Mười xuất siêu 7,31 tỷ USD. Tính chung mười tháng năm 2026, cán cân thương mại hàng hóa nhập siêu 12,07 tỷ USD. " +
    "Chỉ số giá tiêu dùng (CPI) tháng Mười tăng 0,20% so với tháng trước; tăng 4,41% so với tháng 12/2025 và tăng 5,09% so với cùng kỳ năm trước.",
);

test("reportMonth: month or quarter and year from the report's title, other posts ignored", () => {
  assert.deepEqual(reportMonth("Báo cáo tình hình kinh tế &#8211; xã hội tháng Mười và 10 tháng năm 2026"), { year: 2026, month: 10 });
  assert.deepEqual(reportMonth("Báo cáo tình hình kinh tế – xã hội tháng Mười Một và 11 tháng năm 2025"), { year: 2025, month: 11 });
  // "8 tháng năm 2026" (eight months) is not May.
  assert.deepEqual(reportMonth("Báo cáo tình hình kinh tế – xã hội tháng Tám và 8 tháng năm 2026"), { year: 2026, month: 8 });
  assert.deepEqual(reportMonth("Báo cáo tình hình kinh tế – xã hội tháng Năm và 5 tháng đầu năm 2026"), { year: 2026, month: 5 });
  assert.deepEqual(reportMonth("Báo cáo tình hình kinh tế – xã hội tháng Một năm 2026"), { year: 2026, month: 1 });
  assert.deepEqual(reportMonth("Báo cáo tình hình kinh tế – xã hội Quý II và sáu tháng đầu năm 2026"), { year: 2026, month: 6 });
  assert.deepEqual(reportMonth("Báo cáo tình hình kinh tế – xã hội quý IV và năm 2025"), { year: 2025, month: 12 });
  assert.equal(reportMonth("Một số nét chính tình hình kinh tế – xã hội tháng 10 và 10 tháng năm 2026"), null);
  assert.equal(reportMonth("Chỉ số sản xuất công nghiệp tháng Mười năm 2026"), null);
});

test("monthPattern: the month by name or number, not its neighbours", () => {
  const oct = monthPattern(2026, 10);
  assert.ok(oct.test("Xuất khẩu hàng hóa tháng Mười đạt"));
  assert.ok(oct.test("IIP tháng 10/2026 ước tăng"));
  assert.ok(!oct.test("cán cân tháng Mười Một"));
  assert.ok(!oct.test("Tính chung mười tháng năm 2026"));
  assert.ok(!oct.test("so với tháng 10/2025"));
  assert.ok(monthPattern(2026, 1).test("CPI tháng 01/2026 tăng nhẹ"));
  assert.ok(!monthPattern(2026, 12).test("tăng 4,41% so với tháng 12/2025"));
  assert.ok(!monthPattern(2026, 5).test("Tính chung tám tháng năm 2026"));
});

test("checkPick: a short quote is read with the start of its sentence", () => {
  assert.deepEqual(checkPick(field("EXPORTS_YOY"), pick("EXPORTS_YOY", "51,4", "tăng 51,4% so với cùng kỳ năm trước"), TEXT, OCT), { value: 51.4 });
  assert.deepEqual(checkPick(field("IIP_YOY"), pick("IIP_YOY", "15,0", "tăng 15,0% so với cùng kỳ năm trước."), TEXT, OCT), { value: 15 });
  assert.deepEqual(checkPick(field("CPI_YOY"), pick("CPI_YOY", "5,09", "tăng 5,09% so với cùng kỳ năm trước"), TEXT, OCT), { value: 5.09 });
});

test("checkPick: the year-to-date figure, another comparison or another measure is rejected", () => {
  // Ten months, not October.
  assert.match(String((checkPick(field("IIP_YOY"), pick("IIP_YOY", "12,4", "chỉ số IIP tăng 12,4% so với cùng kỳ năm trước"), TEXT, OCT) as { reason: string }).reason), /month/);
  // CPI against last December, not a year earlier.
  assert.match(String((checkPick(field("CPI_YOY"), pick("CPI_YOY", "4,41", "tăng 4,41% so với tháng 12/2025"), TEXT, OCT) as { reason: string }).reason), /cùng kỳ/);
  // Exports' change on the month put in place of the change on a year.
  assert.match(String((checkPick(field("EXPORTS_YOY"), pick("EXPORTS_YOY", "8,7", "tăng 8,7% so với tháng trước"), TEXT, OCT) as { reason: string }).reason), /cùng kỳ/);
  // Imports' sentence for the exports field.
  assert.match(String((checkPick(field("EXPORTS"), pick("EXPORTS", "57,36", "Nhập khẩu hàng hóa đạt 57,36 tỷ USD"), TEXT, OCT) as { reason: string }).reason), /xuất khẩu/);
  // A quote the report does not contain, or a number the quote does not hold.
  assert.equal((checkPick(field("EXPORTS"), pick("EXPORTS", "64,67", "Xuất khẩu hàng hoá tháng Mười đạt 64,67 tỷ USD"), TEXT, OCT) as { reason: string }).reason, "quote not in the report");
  assert.match(String((checkPick(field("EXPORTS"), pick("EXPORTS", "64,6", "Xuất khẩu hàng hóa tháng Mười đạt 64,67 tỷ USD"), TEXT, OCT) as { reason: string }).reason), /does not contain/);
  // Nothing given is not an error; a quarterly figure in a month report is.
  assert.deepEqual(checkPick(field("GDP_YOY"), pick("GDP_YOY", null, null), TEXT, OCT), { reason: null });
  assert.match(String((checkPick(field("GDP_YOY"), pick("GDP_YOY", "15,0", "tăng 15,0%"), TEXT, OCT) as { reason: string }).reason), /quarter/);
});

test("checkPick: the sign comes from the words before the number", () => {
  assert.deepEqual(checkPick(field("TRADE_BAL"), pick("TRADE_BAL", "7,31", "cán cân thương mại hàng hóa tháng Mười xuất siêu 7,31 tỷ USD"), TEXT, OCT), { value: 7.31 });
  const text = normText("Theo số liệu sơ bộ, cán cân thương mại hàng hóa tháng Tám nhập siêu 0,12 tỷ USD.");
  const aug = { year: 2026, month: 8 };
  assert.deepEqual(checkPick(field("TRADE_BAL"), pick("TRADE_BAL", "0,12", "cán cân thương mại hàng hóa tháng Tám nhập siêu 0,12 tỷ USD", true), text, aug), { value: -0.12 });
  // The model's flag contradicting the text drops the figure.
  assert.match(String((checkPick(field("TRADE_BAL"), pick("TRADE_BAL", "0,12", "cán cân thương mại hàng hóa tháng Tám nhập siêu 0,12 tỷ USD", false), text, aug) as { reason: string }).reason), /sign/);
  // "So với cùng kỳ năm trước, CPI tháng Mười Hai tăng 3,48%": the comparison before the number.
  const dec = normText("Chỉ số giá tiêu dùng (CPI) tháng Mười Hai tăng 0,19% so với tháng trước. So với cùng kỳ năm trước, CPI tháng Mười Hai tăng 3,48%. CPI bình quân quý IV/2025 tăng 3,44%.");
  assert.deepEqual(checkPick(field("CPI_YOY"), pick("CPI_YOY", "3,48", "CPI tháng Mười Hai tăng 3,48%"), dec, { year: 2025, month: 12 }), { value: 3.48 });
});

test("checkReport: imports tied to the month by the balance, January's balance derived, a trio that does not add up dropped", () => {
  const picks = [
    pick("EXPORTS", "64,67", "Xuất khẩu hàng hóa tháng Mười đạt 64,67 tỷ USD"),
    pick("IMPORTS", "57,36", "Nhập khẩu hàng hóa đạt 57,36 tỷ USD"),
    pick("TRADE_BAL", "7,31", "cán cân thương mại hàng hóa tháng Mười xuất siêu 7,31 tỷ USD"),
  ];
  const ok = checkReport(picks, TEXT, OCT);
  assert.deepEqual(ok.values, { EXPORTS: 64.67, TRADE_BAL: 7.31, IMPORTS: 57.36 });
  assert.deepEqual(ok.dropped, {});

  // Without the stated balance, the month's imports cannot be confirmed; exports − imports is not trusted then.
  const noBal = checkReport(picks.slice(0, 2), TEXT, OCT);
  assert.equal(noBal.values.IMPORTS, undefined);
  assert.equal(noBal.values.TRADE_BAL, undefined);

  const jan = normText(
    "Kim ngạch xuất khẩu hàng hóa tháng 01/2026 đạt 43,19 tỷ USD, giảm 2,0% so với tháng trước. Kim ngạch nhập khẩu hàng hóa tháng 01/2026 đạt 44,97 tỷ USD, tăng 1,1% so với tháng trước. Cán cân thương mại hàng hóa nhập siêu 1,78 tỷ USD.",
  );
  const janOut = checkReport(
    [
      pick("EXPORTS", "43,19", "Kim ngạch xuất khẩu hàng hóa tháng 01/2026 đạt 43,19 tỷ USD"),
      pick("IMPORTS", "44,97", "Kim ngạch nhập khẩu hàng hóa tháng 01/2026 đạt 44,97 tỷ USD"),
      pick("TRADE_BAL", "1,78", "Cán cân thương mại hàng hóa nhập siêu 1,78 tỷ USD", true),
    ],
    jan,
    { year: 2026, month: 1 },
  );
  assert.equal(janOut.values.TRADE_BAL, -1.78);
  assert.deepEqual(janOut.derived, ["TRADE_BAL"]);

  const bad = normText("Xuất khẩu hàng hóa tháng Mười đạt 64,67 tỷ USD. Nhập khẩu hàng hóa tháng Mười đạt 50,36 tỷ USD. Cán cân thương mại hàng hóa tháng Mười xuất siêu 7,31 tỷ USD.");
  const badOut = checkReport(
    [
      pick("EXPORTS", "64,67", "Xuất khẩu hàng hóa tháng Mười đạt 64,67 tỷ USD"),
      pick("IMPORTS", "50,36", "Nhập khẩu hàng hóa tháng Mười đạt 50,36 tỷ USD"),
      pick("TRADE_BAL", "7,31", "Cán cân thương mại hàng hóa tháng Mười xuất siêu 7,31 tỷ USD"),
    ],
    bad,
    OCT,
  );
  assert.deepEqual(badOut.values, {});
  assert.deepEqual(Object.keys(badOut.dropped).sort(), ["EXPORTS", "IMPORTS", "TRADE_BAL"]);
});

test("pendingReports: unread or failed reports, newest first; three failures are left alone", () => {
  const ref = (month: number, id: number): ReportRef => ({ id, link: "", title: "", year: 2026, month, published: "" });
  const refs = [ref(10, 3), ref(9, 2), ref(8, 1)];
  const done = { id: 0, link: "", title: "", at: 0, kept: ["EXPORTS"], missing: [], dropped: {} };
  const pending = pendingReports(refs, {
    "2026-10": { ...done, id: 3 },
    "2026-09": { ...done, id: 2, kept: [], attempts: 1, error: "x" },
    "2026-08": { ...done, id: 1, kept: [], attempts: 3, error: "x" },
  });
  assert.deepEqual(pending.map((r) => r.month), [9]);
  // A republished report (new post id) is read again.
  assert.deepEqual(pendingReports([ref(10, 4)], { "2026-10": { ...done, id: 3 } }).map((r) => r.id), [4]);
});

test("vnMonthly: US exports of the month from year-to-date sums, balance since January, newest report", () => {
  const db = openDb(":memory:");
  const put = (key: string, pts: [number, number, number][]) => upsertSeries(db, nsoId(key), "nso", pts.map(([y, m, value]) => ({ ts: month(y, m), value })));
  put("EXPORTS_US_YTD", [
    [2025, 10, 125.0],
    [2026, 9, 140.0],
    [2026, 10, 159.4],
  ]);
  put("TRADE_BAL", Array.from({ length: 10 }, (_, i) => [2026, i + 1, i < 8 ? -2 : 3] as [number, number, number]));
  put("EXPORTS_YOY", [[2026, 10, 51.4]]);
  db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, 0)").run(
    NSO_REPORTS_KEY,
    JSON.stringify({ "2026-10": { id: 62888, link: "https://www.nso.gov.vn/x", title: "Báo cáo", at: 1, kept: ["EXPORTS"], missing: [], dropped: {} } }),
  );
  const v = vnMonthly(db, Date.UTC(2026, 10, 12));
  assert.equal(Math.round(v.usMonth!.value * 10) / 10, 19.4);
  assert.equal(Math.round(v.usYtdYoy! * 10) / 10, 27.5);
  assert.equal(v.balanceYtd, -10);
  assert.deepEqual(v.report && [v.report.year, v.report.month], [2026, 10]);
  // Rows start at the first month with a figure.
  assert.equal(v.rows[0].ts, month(2026, 1));
  assert.equal(v.rows[v.rows.length - 1].exportsYoy, 51.4);
});

test("Vietnam's scorecard takes the statistics office's CPI and GDP when they are newer", () => {
  const vn = MACRO_COUNTRIES.find((c) => c.imf === "VNM")!;
  const db = openDb(":memory:");
  upsertSeries(db, "imf:CPI_M:VNM", "imfcpi", [{ ts: month(2026, 9), value: 5.1 }]);
  upsertSeries(db, "nso:CPI_YOY", "nso", [{ ts: month(2026, 10), value: 5.09 }]);
  upsertSeries(db, "wb:GDP:VNM", "worldbank", [{ ts: month(2026, 4), value: 8.8 }]);
  upsertSeries(db, "nso:GDP_YOY", "nso", [{ ts: fieldTs(field("GDP_YOY"), 2026, 9), value: 9.95 }]);
  assert.equal(freshest(db, cpiIds(vn))?.id, "nso:CPI_YOY");
  assert.equal(freshest(db, gdpIds(vn))?.last.ts, month(2026, 7));
  // Same month in both: the IMF's stays.
  upsertSeries(db, "imf:CPI_M:VNM", "imfcpi", [{ ts: month(2026, 10), value: 5.1 }]);
  assert.equal(freshest(db, cpiIds(vn))?.id, "imf:CPI_M:VNM");
});
