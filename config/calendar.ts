// US releases on the economic calendar whose result can be read off FRED once
// published (ForexFactory's feed has no "actual" field). Matched on the
// ForexFactory title of USD events; lib/sources/calendar.ts computes the number
// the release reports from the FRED series, for the period the release covers.

export interface ActualDef {
  /** ForexFactory event title (country USD). */
  title: string;
  /** FRED series code. */
  code: string;
  /** How the release reports the series: % change on the previous period or a year earlier, change in level, or the level. */
  calc: "mom" | "yoy" | "diff" | "level";
  /** Period the release covers: the month before the release, the quarter before, or the week ending the Saturday before. */
  freq: "m" | "q" | "w";
  /** Printed like ForexFactory prints the forecast. */
  unit: "%" | "K";
  digits: number;
  /** Multiply the computed value (ICSA counts people; ForexFactory prints thousands). */
  scale?: number;
  /** Higher than forecast is good (jobs, growth, spending) or bad (inflation, unemployment) news for the economy. */
  polarity: "up-good" | "up-bad";
}

export const CALENDAR_ACTUALS: ActualDef[] = [
  { title: "CPI m/m", code: "CPIAUCSL", calc: "mom", freq: "m", unit: "%", digits: 1, polarity: "up-bad" },
  { title: "Core CPI m/m", code: "CPILFESL", calc: "mom", freq: "m", unit: "%", digits: 1, polarity: "up-bad" },
  { title: "CPI y/y", code: "CPIAUCSL", calc: "yoy", freq: "m", unit: "%", digits: 1, polarity: "up-bad" },
  { title: "Core PCE Price Index m/m", code: "PCEPILFE", calc: "mom", freq: "m", unit: "%", digits: 1, polarity: "up-bad" },
  { title: "PCE Price Index m/m", code: "PCEPI", calc: "mom", freq: "m", unit: "%", digits: 1, polarity: "up-bad" },
  { title: "PPI m/m", code: "PPIFIS", calc: "mom", freq: "m", unit: "%", digits: 1, polarity: "up-bad" },
  { title: "Non-Farm Employment Change", code: "PAYEMS", calc: "diff", freq: "m", unit: "K", digits: 0, polarity: "up-good" },
  { title: "Unemployment Rate", code: "UNRATE", calc: "level", freq: "m", unit: "%", digits: 1, polarity: "up-bad" },
  { title: "Average Hourly Earnings m/m", code: "CES0500000003", calc: "mom", freq: "m", unit: "%", digits: 1, polarity: "up-bad" },
  { title: "Unemployment Claims", code: "ICSA", calc: "level", freq: "w", unit: "K", digits: 0, scale: 1 / 1000, polarity: "up-bad" },
  { title: "Retail Sales m/m", code: "RSAFS", calc: "mom", freq: "m", unit: "%", digits: 1, polarity: "up-good" },
  { title: "Core Retail Sales m/m", code: "RSFSXMV", calc: "mom", freq: "m", unit: "%", digits: 1, polarity: "up-good" },
  // Real GDP, % change at an annual rate: FRED stores the published rate itself.
  { title: "Advance GDP q/q", code: "A191RL1Q225SBEA", calc: "level", freq: "q", unit: "%", digits: 1, polarity: "up-good" },
  { title: "Prelim GDP q/q", code: "A191RL1Q225SBEA", calc: "level", freq: "q", unit: "%", digits: 1, polarity: "up-good" },
  { title: "Final GDP q/q", code: "A191RL1Q225SBEA", calc: "level", freq: "q", unit: "%", digits: 1, polarity: "up-good" },
];

// Release dates of the main US data beyond ForexFactory's one week, from FRED's
// release calendar (keyless HTML, filtered by release id, about two months ahead).

export interface UsRelease {
  /** FRED release id (fred.stlouisfed.org/release?rid=…). */
  rid: number;
  name: { en: string; vi: string };
}

export const US_RELEASES: UsRelease[] = [
  { rid: 10, name: { en: "CPI inflation", vi: "Lạm phát CPI" } },
  { rid: 50, name: { en: "Jobs report (payrolls, unemployment)", vi: "Báo cáo việc làm (bảng lương, thất nghiệp)" } },
  { rid: 53, name: { en: "GDP", vi: "GDP" } },
  { rid: 54, name: { en: "Personal income, spending and PCE inflation", vi: "Thu nhập, chi tiêu và lạm phát PCE" } },
  { rid: 9, name: { en: "Retail sales", vi: "Doanh số bán lẻ" } },
  { rid: 46, name: { en: "Producer prices (PPI)", vi: "Giá sản xuất (PPI)" } },
  { rid: 192, name: { en: "Job openings (JOLTS)", vi: "Việc làm trống (JOLTS)" } },
];
