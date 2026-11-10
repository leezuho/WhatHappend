import type { Bi } from "@/lib/i18n";

// Rate decisions of the major central banks other than the Fed (config/fomc.ts),
// for the macro page's calendar. Each date was read off the bank's own site on
// 2026-11-09; banks publish the next year's schedule between July and December,
// so add a year when it appears. `end` is the decision day (start = end for
// banks that only announce a date). Not yet published on 2026-11-09:
// Bank Indonesia 2027, Banco de México 2027, RBI from April 2027 (fiscal year
// 2027-28). The PBoC has no meetings: its loan prime rate is fixed on the 20th
// of each month (next working day on a holiday), see LPR_DAY.
//
// Sources:
// ECB  https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html
// BoE  https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates
// BoJ  https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm
// BoC  https://www.bankofcanada.ca/2026/07/bank-canada-publishes-2027-schedule-policy-interest-rate-announcements-other-major-publications/
// RBA  https://www.rba.gov.au/schedules-events/board-meeting-schedules.html
// BoK  https://www.bok.or.kr/eng/main/contents.do?menuNo=400020
// RBI  https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=62422
// BI   https://www.bi.go.id/id/publikasi/ruang-media/news-release/Pages/sp_2730825.aspx
// BCB  https://www.bcb.gov.br/en/about/bcb-calendar
// Banxico https://www.banxico.org.mx/monetary-policy/d/%7B0C35369C-BF8F-E5A8-7710-FD5A6716474F%7D.pdf

export type BankId = "ecb" | "boe" | "boj" | "boc" | "rba" | "bok" | "rbi" | "bi" | "bcb" | "banxico";

export const BANKS: Record<BankId, { name: Bi; country: string }> = {
  ecb: { name: { en: "ECB", vi: "ECB" }, country: "EA" },
  boe: { name: { en: "Bank of England", vi: "NHTW Anh (BoE)" }, country: "UK" },
  boj: { name: { en: "Bank of Japan", vi: "NHTW Nhật (BoJ)" }, country: "JP" },
  boc: {
    name: { en: "Bank of Canada", vi: "NHTW Canada (BoC)" },
    country: "CA",
  },
  rba: {
    name: { en: "Reserve Bank of Australia", vi: "NHTW Úc (RBA)" },
    country: "AU",
  },
  bok: {
    name: { en: "Bank of Korea", vi: "NHTW Hàn Quốc (BoK)" },
    country: "KR",
  },
  rbi: {
    name: { en: "Reserve Bank of India", vi: "NHTW Ấn Độ (RBI)" },
    country: "IN",
  },
  bi: {
    name: { en: "Bank Indonesia", vi: "NHTW Indonesia (BI)" },
    country: "ID",
  },
  bcb: {
    name: { en: "Brazil central bank (Copom)", vi: "NHTW Brazil (Copom)" },
    country: "BR",
  },
  banxico: {
    name: { en: "Banco de México", vi: "NHTW Mexico (Banxico)" },
    country: "MX",
  },
};

export interface CbMeeting {
  bank: BankId;
  start: string;
  /** Decision day. */
  end: string;
}

const m = (bank: BankId, start: string, end = start): CbMeeting => ({
  bank,
  start,
  end,
});

export const CB_MEETINGS: CbMeeting[] = [
  // ECB: two-day meetings, decision on day 2.
  m("ecb", "2026-12-16", "2026-12-17"),
  m("ecb", "2027-02-03", "2027-02-04"),
  m("ecb", "2027-03-17", "2027-03-18"),
  m("ecb", "2027-04-28", "2027-04-29"),
  m("ecb", "2027-06-09", "2027-06-10"),
  m("ecb", "2027-07-21", "2027-07-22"),
  m("ecb", "2027-09-08", "2027-09-09"),
  m("ecb", "2027-10-27", "2027-10-28"),
  m("ecb", "2027-12-15", "2027-12-16"),
  // Bank of England: announcement days.
  m("boe", "2026-12-17"),
  m("boe", "2027-02-04"),
  m("boe", "2027-03-18"),
  m("boe", "2027-04-29"),
  m("boe", "2027-06-17"),
  m("boe", "2027-07-29"),
  m("boe", "2027-09-16"),
  m("boe", "2027-11-04"),
  m("boe", "2027-12-16"),
  // Bank of Japan: two-day meetings.
  m("boj", "2026-12-17", "2026-12-18"),
  m("boj", "2027-01-21", "2027-01-22"),
  m("boj", "2027-03-17", "2027-03-18"),
  m("boj", "2027-04-27", "2027-04-28"),
  m("boj", "2027-06-10", "2027-06-11"),
  m("boj", "2027-07-21", "2027-07-22"),
  m("boj", "2027-09-21", "2027-09-22"),
  m("boj", "2027-10-28", "2027-10-29"),
  m("boj", "2027-12-16", "2027-12-17"),
  // Bank of Canada: announcement days.
  m("boc", "2026-12-09"),
  m("boc", "2027-01-27"),
  m("boc", "2027-03-03"),
  m("boc", "2027-04-28"),
  m("boc", "2027-06-02"),
  m("boc", "2027-07-21"),
  m("boc", "2027-09-08"),
  m("boc", "2027-10-27"),
  m("boc", "2027-12-08"),
  // Reserve Bank of Australia: two-day meetings, decision 2:30 pm Sydney on day 2.
  m("rba", "2026-12-07", "2026-12-08"),
  m("rba", "2027-02-08", "2027-02-09"),
  m("rba", "2027-03-22", "2027-03-23"),
  m("rba", "2027-05-03", "2027-05-04"),
  m("rba", "2027-06-21", "2027-06-22"),
  m("rba", "2027-08-09", "2027-08-10"),
  m("rba", "2027-09-27", "2027-09-28"),
  m("rba", "2027-11-01", "2027-11-02"),
  m("rba", "2027-12-13", "2027-12-14"),
  // Bank of Korea: rate-decision meetings only (not the financial-stability ones).
  m("bok", "2026-11-26"),
  m("bok", "2027-01-14"),
  m("bok", "2027-02-25"),
  m("bok", "2027-04-09"),
  m("bok", "2027-05-27"),
  m("bok", "2027-07-15"),
  m("bok", "2027-08-26"),
  m("bok", "2027-10-15"),
  m("bok", "2027-11-25"),
  // Reserve Bank of India: three-day meetings; fiscal year 2026-27 only.
  m("rbi", "2026-12-02", "2026-12-04"),
  m("rbi", "2027-02-03", "2027-02-05"),
  // Bank Indonesia: two-day board meetings; 2026 only.
  m("bi", "2026-11-17", "2026-11-18"),
  m("bi", "2026-12-15", "2026-12-16"),
  // Brazil (Copom): two-day meetings.
  m("bcb", "2026-12-08", "2026-12-09"),
  m("bcb", "2027-01-26", "2027-01-27"),
  m("bcb", "2027-03-16", "2027-03-17"),
  m("bcb", "2027-04-27", "2027-04-28"),
  m("bcb", "2027-06-15", "2027-06-16"),
  m("bcb", "2027-08-03", "2027-08-04"),
  m("bcb", "2027-09-21", "2027-09-22"),
  m("bcb", "2027-10-26", "2027-10-27"),
  m("bcb", "2027-12-07", "2027-12-08"),
  // Banco de México: announcement days; 2026 only.
  m("banxico", "2026-12-17"),
];

/** Day of the month the PBoC fixes the loan prime rate (moved to the next working day on a holiday, which is not modelled). */
export const LPR_DAY = 20;
