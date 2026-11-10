// Policy rates of central banks BIS does not publish, declared by hand and
// written to the database by lib/sources/sbv.ts. The State Bank of Vietnam
// moves its refinancing rate rarely and its website rejects automated clients,
// so the decisions live here. When the SBV announces a change, add a step and
// bump SBV_CHECKED; the source fails (and the panels say so) once the last
// check is older than SBV_RECHECK_DAYS.

export interface RateStep {
  /** First day the rate applies, YYYY-MM-DD. */
  from: string;
  rate: number;
  /** The SBV decision that set it. */
  decision: string;
}

/** SBV refinancing rate (lãi suất tái cấp vốn), the rate cited as Vietnam's policy rate, oldest first. */
export const SBV_REFI_STEPS: RateStep[] = [
  { from: "2022-09-23", rate: 5, decision: "1606/QĐ-NHNN" },
  { from: "2022-10-25", rate: 6, decision: "1809/QĐ-NHNN" },
  { from: "2023-04-03", rate: 5.5, decision: "574/QĐ-NHNN" },
  { from: "2023-06-19", rate: 4.5, decision: "1123/QĐ-NHNN" },
];

/** Day the steps above were last checked against sbv.gov.vn ("Các mức lãi suất do Ngân hàng Nhà nước quy định"). */
export const SBV_CHECKED = "2026-11-09";

export const SBV_RECHECK_DAYS = 180;
