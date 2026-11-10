import { getDict, type Locale } from "@/lib/i18n";
import { fmtRelative } from "@/lib/format";
import type { NewsItem } from "@/lib/queries";
import { Thumb } from "@/components/ui/Thumb";
import { Related } from "./NewsList";

/** Headlines with thumbnails in two columns from md up; the news list of the desk pages (crypto, tech). */
export function NewsGrid({ items, now, lang }: { items: NewsItem[]; now: number; lang: Locale }) {
  const d = getDict(lang);
  return (
    <ul className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
      {items.map((n) => (
        <li key={n.id} className="flex items-start gap-3 border-t border-line py-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <a href={n.url} target="_blank" rel="noreferrer" className="text-sm leading-snug text-ink hover:underline">
              {n.title}
            </a>
            <span className="text-[11px] text-muted">
              {n.source} · {fmtRelative(n.publishedAt, now, lang)}
              {n.alsoIn.length > 0 && ` · ${d.news.alsoIn} ${n.alsoIn.join(", ")}`}
            </span>
            <Related n={n} label={d.news.related} />
          </div>
          <Thumb src={n.image} className="h-12 w-[72px]" />
        </li>
      ))}
    </ul>
  );
}
