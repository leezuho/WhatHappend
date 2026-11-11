import type { Bi } from "@/lib/i18n";

// National elections that can move markets, for the calendars (BR-10) and the AI
// brief. Kept by hand: there is no free, reliable feed. Dates were read on
// 2026-11-11 from Wikipedia's 2026 and 2027 national electoral calendars and
// checked against the source named on each entry. Add a vote when its date is
// set; `expected` marks a legal deadline or a likely date, not a fixed one.
//
// Left out on purpose: indirect votes (Germany's Federal Convention 30/1/2027,
// the Dutch Senate 24/5/2027, India's president 7/2027), Swiss referendums and
// Switzerland's federal election (24/10/2027). Poland, Greece and India's upper
// house vote in 2027 without a date yet.

export interface Election {
  /** Polling day, YYYY-MM-DD, local. */
  date: string;
  /** Two-letter code, as in the AI brief's calendar (ForexFactory uses currencies, central banks countries). */
  code: string;
  country: Bi;
  kind: Bi;
  /** A deadline or a likely date rather than a fixed one. */
  expected?: true;
  source: string;
}

export const ELECTIONS: Election[] = [
  {
    date: "2026-11-28",
    code: "TW",
    country: { en: "Taiwan", vi: "Đài Loan" },
    kind: { en: "nationwide local elections", vi: "bầu cử địa phương toàn quốc" },
    source: "https://en.wikipedia.org/wiki/2026_Taiwanese_local_elections",
  },
  {
    date: "2026-11-29",
    code: "ES",
    country: { en: "Spain", vi: "Tây Ban Nha" },
    kind: { en: "snap general election", vi: "tổng tuyển cử sớm" },
    source: "https://www.euronews.com/2026/10/05/pedro-sanchez-calls-early-elections-in-spain-after-defeat-of-housing-decrees",
  },
  {
    date: "2027-01-16",
    code: "NG",
    country: { en: "Nigeria", vi: "Nigeria" },
    kind: { en: "presidential and parliamentary elections", vi: "bầu tổng thống và quốc hội" },
    source: "https://www.premiumtimesng.com/news/top-news/859957-updated-inec-reschedules-2027-general-election-releases-new-election-timetable.html",
  },
  {
    date: "2027-04-18",
    code: "FR",
    country: { en: "France", vi: "Pháp" },
    kind: { en: "presidential election, first round", vi: "bầu tổng thống, vòng 1" },
    source: "https://www.service-public.gouv.fr/particuliers/actualites/A15053?lang=fr",
  },
  {
    date: "2027-05-02",
    code: "FR",
    country: { en: "France", vi: "Pháp" },
    kind: { en: "presidential election, runoff", vi: "bầu tổng thống, vòng 2" },
    source: "https://www.service-public.gouv.fr/particuliers/actualites/A15053?lang=fr",
  },
  {
    date: "2027-06-06",
    code: "MX",
    country: { en: "Mexico", vi: "Mexico" },
    kind: { en: "midterm election (Chamber of Deputies)", vi: "bầu cử giữa nhiệm kỳ (Hạ viện)" },
    // Federal elections fall on the first Sunday of June.
    source: "https://en.wikipedia.org/wiki/2027_national_electoral_calendar",
  },
  {
    date: "2027-08-10",
    code: "KE",
    country: { en: "Kenya", vi: "Kenya" },
    kind: { en: "general election", vi: "tổng tuyển cử" },
    source: "https://www.iebc.or.ke/uploads/resources/tpFfOlBLRh.pdf",
  },
  {
    date: "2027-10-24",
    code: "AR",
    country: { en: "Argentina", vi: "Argentina" },
    kind: { en: "presidential and congressional elections", vi: "bầu tổng thống và quốc hội" },
    source: "https://en.wikipedia.org/wiki/2027_Argentine_general_election",
  },
  {
    date: "2027-11-21",
    code: "AR",
    country: { en: "Argentina", vi: "Argentina" },
    kind: { en: "presidential runoff, if needed", vi: "bầu tổng thống vòng 2, nếu cần" },
    expected: true,
    source: "https://en.wikipedia.org/wiki/2027_Argentine_general_election",
  },
  {
    date: "2027-12-22",
    code: "IT",
    country: { en: "Italy", vi: "Ý" },
    kind: { en: "general election (latest legal date)", vi: "tổng tuyển cử (hạn chót theo luật)" },
    expected: true,
    source: "https://en.wikipedia.org/wiki/2027_Italian_general_election",
  },
];

/** The calendar's timestamp for a polling day: 17:00 Hanoi, as the Vietnam market dates are stamped. */
export function electionTs(e: Election): number {
  return Date.parse(`${e.date}T10:00:00Z`);
}
