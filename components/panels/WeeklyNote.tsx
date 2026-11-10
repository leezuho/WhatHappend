import { getDict, type Locale } from "@/lib/i18n";
import { fmtDateTime } from "@/lib/format";
import type { NoteView } from "@/lib/ai/macronote-shared";

// A weekly AI note (macro page, tech page): headline, themes in two columns, what to watch, and
// the week, time and model under it.

export function WeeklyNote({ note, lang, caveat }: { note: NoteView; lang: Locale; caveat: string }) {
  const d = getDict(lang);
  const [year, week] = note.week.split("-W");
  return (
    <article className="flex flex-col gap-3">
      <p className="font-display text-base leading-snug font-semibold text-ink">{note.text.headline}</p>
      <ol className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
        {note.text.bullets.map((b, i) => (
          <li key={i} className="text-sm leading-snug">
            <span className="font-semibold text-ink">{b.title}.</span> <span className="text-ink-2">{b.body}</span>
          </li>
        ))}
      </ol>
      {note.text.watch.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-ink-2">{d.brief.watch}</h3>
          <ul className="list-disc pl-4 text-xs text-ink-2">
            {note.text.watch.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="border-t border-line pt-2 text-[11px] text-muted">
        {d.macro.noteMeta.replace("{week}", `${Number(week)}/${year}`).replace("{date}", fmtDateTime(note.createdAt, lang)).replace("{model}", note.model)} · {caveat}
      </p>
    </article>
  );
}
