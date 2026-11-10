import type { Locale } from "@/lib/i18n";

// Grouping headlines that tell the same story in different words ("Trump defends
// Nvidia's Huang…", "Jensen Huang affair puts Nvidia's future at risk…"), so a
// big story takes one row with "N more" instead of ten. Exact repeats are
// already merged by title key when reading; this works on the titles as shown
// (translated into the reader's language), by shared words weighted by rarity.

export interface Story {
  id: string;
  url: string;
  source: string;
  title: string;
  image: string | null;
  alsoIn: string[];
  related: { title: string; source: string; url: string }[];
}

const STOP: Record<Locale, Set<string>> = {
  en: new Set(
    "the a an and or of to in on for with at by from as is are was were be been it its this that these those after before over under into about amid says say said new how why what who will can could would may might not no more most than then there their his her he she they we you your our up out off just now get gets got has have had do does did all any some one two three first last top inside here also via vs per make makes made live".split(" "),
  ),
  vi: new Set(
    "của và các những cho với trong sau khi là có được bị đã sẽ về từ tại này một người không đến ra vào lại cũng như theo nhưng thì mà để hơn rất nhiều đang vừa hay hoặc vì nên do nếu thế nào gì ai sao trên dưới giữa cùng ở đó nay năm ngày tháng mới ông bà".split(" "),
  ),
};

/** Distinct content words of a title: lowercased, punctuation and possessives dropped, stopwords out, a plural "s" trimmed in English. */
export function titleWords(title: string, lang: Locale): string[] {
  const min = lang === "en" ? 3 : 2;
  const words = title
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length >= min && !STOP[lang].has(w))
    .map((w) => (lang === "en" && w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
  return [...new Set(words)];
}

/**
 * Default bar for "same story": shared words carry 35% of the shorter title's weight. Tuned on the
 * 2026-11-10 tech and world news: 0.4 left the Nvidia scandal in four rows, 0.35 added only right
 * merges. Lexical matching still folds look-alike events (two different ships running aground the
 * same day), which is why the folded headlines stay one click away.
 */
export const SAME_STORY = 0.35;

/**
 * Stories in order, each later headline folded into the first earlier one it resembles: at least two
 * shared words, whose rarity-weighted share of the shorter title is at least `threshold`. The kept
 * headline lists the folded ones under `related`, adds their outlets to `alsoIn` and borrows a photo.
 */
export function clusterStories<T extends Story>(items: T[], lang: Locale, threshold = SAME_STORY): T[] {
  const words = items.map((i) => titleWords(i.title, lang));
  const df = new Map<string, number>();
  for (const ws of words) for (const w of ws) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log(1 + items.length / (df.get(w) ?? 1));
  const weight = words.map((ws) => ws.reduce((a, w) => a + idf(w), 0));
  const similar = (i: number, j: number) => {
    const b = new Set(words[j]);
    const shared = words[i].filter((w) => b.has(w));
    if (shared.length < 2) return false;
    return shared.reduce((a, w) => a + idf(w), 0) / Math.min(weight[i], weight[j]) >= threshold;
  };
  const groups: number[][] = [];
  for (let i = 0; i < items.length; i++) {
    const g = groups.find((g) => g.some((j) => similar(i, j)));
    if (g) g.push(i);
    else groups.push([i]);
  }
  return groups.map(([head, ...rest]) => {
    const lead = { ...items[head], alsoIn: [...items[head].alsoIn], related: [...items[head].related] };
    for (const j of rest) {
      const it = items[j];
      lead.related.push({ title: it.title, source: it.source, url: it.url }, ...it.related);
      for (const s of [it.source, ...it.alsoIn]) if (s !== lead.source && !lead.alsoIn.includes(s)) lead.alsoIn.push(s);
      lead.image ??= it.image;
    }
    return lead;
  });
}
