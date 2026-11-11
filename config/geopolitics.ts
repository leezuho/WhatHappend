import type { Bi } from "@/lib/i18n";

// The geopolitical layer of the overview (TODO P1, LLDD 04 §3 Hàng 1b): sea
// chokepoints, geopolitical risk by country, and US sanctions and trade actions.
// Free of fetcher imports so the web can read it.

export interface Chokepoint {
  /** IMF PortWatch `portid` (lib/sources/portwatch.ts). */
  id: string;
  name: Bi;
  /** Why it matters, one line under the name. */
  note: Bi;
}

/** Table order: the Gulf, then the Red Sea route and its detour, then Asia, then the Americas. */
export const CHOKEPOINTS: Chokepoint[] = [
  { id: "chokepoint6", name: { en: "Strait of Hormuz", vi: "Eo Hormuz" }, note: { en: "The only sea exit for Gulf oil and LNG", vi: "Lối ra biển duy nhất của dầu và LNG vùng Vịnh" } },
  { id: "chokepoint4", name: { en: "Bab el-Mandeb", vi: "Eo Bab el-Mandeb" }, note: { en: "Mouth of the Red Sea, on the Asia–Europe route", vi: "Cửa Biển Đỏ, trên tuyến Á–Âu" } },
  { id: "chokepoint1", name: { en: "Suez Canal", vi: "Kênh đào Suez" }, note: { en: "The Asia–Europe shortcut", vi: "Đường tắt Á–Âu" } },
  { id: "chokepoint7", name: { en: "Cape of Good Hope", vi: "Mũi Hảo Vọng" }, note: { en: "The detour when ships avoid the Red Sea", vi: "Đường vòng khi tàu tránh Biển Đỏ" } },
  { id: "chokepoint5", name: { en: "Strait of Malacca", vi: "Eo Malacca" }, note: { en: "Main route from the Indian Ocean to East Asia", vi: "Tuyến chính từ Ấn Độ Dương vào Đông Á" } },
  { id: "chokepoint11", name: { en: "Taiwan Strait", vi: "Eo biển Đài Loan" }, note: { en: "Along China's coast to Northeast Asia", vi: "Dọc bờ biển Trung Quốc lên Đông Bắc Á" } },
  { id: "chokepoint2", name: { en: "Panama Canal", vi: "Kênh đào Panama" }, note: { en: "Links the US East Coast with Asia", vi: "Nối bờ Đông nước Mỹ với châu Á" } },
];

/** Series written by lib/sources/portwatch.ts: ships a day, and tankers among them. */
export const chokepointId = (id: string, part: "total" | "tanker" = "total") => (part === "total" ? `portwatch:${id}` : `portwatch:${id}:tanker`);

/**
 * Caldara & Iacoviello's country indices (lib/sources/gprc.ts), as rows of the heatmap. The source covers 44
 * countries but not Iran; small ones swing wildly month to month because few articles name them, so the list keeps
 * the powers, the hot spots and Vietnam. Any ISO3 code of the workbook (`GPRC_<code>`) can be added.
 */
export const GPR_COUNTRIES: { iso: string; name: Bi }[] = [
  { iso: "USA", name: { en: "United States", vi: "Mỹ" } },
  { iso: "CHN", name: { en: "China", vi: "Trung Quốc" } },
  { iso: "TWN", name: { en: "Taiwan", vi: "Đài Loan" } },
  { iso: "RUS", name: { en: "Russia", vi: "Nga" } },
  { iso: "UKR", name: { en: "Ukraine", vi: "Ukraine" } },
  { iso: "ISR", name: { en: "Israel", vi: "Israel" } },
  { iso: "SAU", name: { en: "Saudi Arabia", vi: "Ả Rập Xê Út" } },
  { iso: "EGY", name: { en: "Egypt", vi: "Ai Cập" } },
  { iso: "TUR", name: { en: "Turkey", vi: "Thổ Nhĩ Kỳ" } },
  { iso: "IND", name: { en: "India", vi: "Ấn Độ" } },
  { iso: "JPN", name: { en: "Japan", vi: "Nhật Bản" } },
  { iso: "KOR", name: { en: "South Korea", vi: "Hàn Quốc" } },
  { iso: "VNM", name: { en: "Vietnam", vi: "Việt Nam" } },
  { iso: "VEN", name: { en: "Venezuela", vi: "Venezuela" } },
  { iso: "DEU", name: { en: "Germany", vi: "Đức" } },
  { iso: "GBR", name: { en: "United Kingdom", vi: "Anh" } },
];

export const gprCountryId = (iso: string) => `gpr:C:${iso}`;

/** Class edges of the heatmap, on the index where 100 is the country's own 1985–2019 average. */
export const GPR_BINS = [100, 150, 200, 300, 500];

export type PolicyAgency = "ofac" | "bis" | "ustr" | "wh";

export const POLICY_AGENCIES: Record<PolicyAgency, { short: Bi; name: Bi }> = {
  ofac: { short: { en: "OFAC", vi: "OFAC" }, name: { en: "Treasury's Office of Foreign Assets Control: sanctions", vi: "Văn phòng Kiểm soát Tài sản Nước ngoài (Bộ Tài chính): trừng phạt" } },
  bis: { short: { en: "BIS", vi: "BIS" }, name: { en: "Commerce's Bureau of Industry and Security: export controls", vi: "Cục Công nghiệp và An ninh (Bộ Thương mại): kiểm soát xuất khẩu" } },
  ustr: { short: { en: "USTR", vi: "USTR" }, name: { en: "US Trade Representative: tariffs and trade cases", vi: "Đại diện Thương mại Mỹ: thuế quan và điều tra thương mại" } },
  wh: { short: { en: "White House", vi: "Nhà Trắng" }, name: { en: "Presidential documents on tariffs, trade and sanctions", vi: "Văn bản của Tổng thống về thuế quan, thương mại và trừng phạt" } },
};

/** Countries tagged on a US action when its English title names them. Vietnam is listed first so its rows stand out. */
export const POLICY_COUNTRIES: { code: string; name: Bi; re: RegExp }[] = [
  { code: "VN", name: { en: "Vietnam", vi: "Việt Nam" }, re: /\bviet ?nam(ese)?\b/i },
  { code: "CN", name: { en: "China", vi: "Trung Quốc" }, re: /\bchin(a|ese)\b|\bprc\b|\bhong kong\b/i },
  { code: "RU", name: { en: "Russia", vi: "Nga" }, re: /\brussia(n)?\b/i },
  { code: "IR", name: { en: "Iran", vi: "Iran" }, re: /\biran(ian)?\b/i },
  { code: "KP", name: { en: "North Korea", vi: "Triều Tiên" }, re: /\bnorth korea(n)?\b|\bdprk\b/i },
  { code: "KR", name: { en: "South Korea", vi: "Hàn Quốc" }, re: /\b(?<!north )korea(n)?\b/i },
  { code: "TW", name: { en: "Taiwan", vi: "Đài Loan" }, re: /\btaiwan(ese)?\b/i },
  { code: "JP", name: { en: "Japan", vi: "Nhật Bản" }, re: /\bjapan(ese)?\b/i },
  { code: "IN", name: { en: "India", vi: "Ấn Độ" }, re: /\bindia(n)?\b/i },
  { code: "EU", name: { en: "EU", vi: "EU" }, re: /\beuropean union\b|\beu\b/i },
  { code: "UK", name: { en: "UK", vi: "Anh" }, re: /\bunited kingdom\b|\bbritish\b/i },
  { code: "CA", name: { en: "Canada", vi: "Canada" }, re: /\bcanad(a|ian)\b/i },
  { code: "MX", name: { en: "Mexico", vi: "Mexico" }, re: /\bmexic(o|an)\b/i },
  { code: "BR", name: { en: "Brazil", vi: "Brazil" }, re: /\bbrazil(ian)?\b/i },
  { code: "VE", name: { en: "Venezuela", vi: "Venezuela" }, re: /\bvenezuela(n)?\b/i },
  { code: "CU", name: { en: "Cuba", vi: "Cuba" }, re: /\bcuba(n)?\b/i },
  { code: "BY", name: { en: "Belarus", vi: "Belarus" }, re: /\bbelarus(ian)?\b/i },
  { code: "SY", name: { en: "Syria", vi: "Syria" }, re: /\bsyria(n)?\b/i },
  { code: "IQ", name: { en: "Iraq", vi: "Iraq" }, re: /\biraq(i)?\b/i },
  { code: "LB", name: { en: "Lebanon", vi: "Liban" }, re: /\bleban(on|ese)\b|\bhizballah\b|\bhezbollah\b/i },
];

/** Codes of the countries an action's title names, in POLICY_COUNTRIES order. */
export function policyCountries(title: string): string[] {
  return POLICY_COUNTRIES.filter((c) => c.re.test(title)).map((c) => c.code);
}
