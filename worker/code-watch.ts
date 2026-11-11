import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// The worker's own code, found by following static imports from its entry file.
// ESM keeps no public list of loaded modules, so this reads the sources: good
// enough to tell "a file the worker runs was edited after it started" without
// flagging web-only files such as lib/queries.ts.

// `import x from "m"`, `export { y } from "m"`, `import "m"`, `import("m")`.
// Type-only imports and re-exports are erased at runtime and skipped.
const IMPORT_RE = /\b(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".js", ".mjs", ".json", "/index.ts", "/index.tsx", "/index.js"];

function resolveLocal(spec: string, fromFile: string, root: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(root, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // a package or a node: builtin
  for (const ext of EXTENSIONS) {
    const file = base + ext;
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

/** Repo-relative paths of every local file reachable from `entry` by runtime imports, the entry included. */
export function importGraph(entry: string, root: string): string[] {
  const seen = new Set<string>();
  const queue = [path.resolve(root, entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith(".json")) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT_RE)) {
      const dep = resolveLocal(m[1] ?? m[2], file, root);
      if (dep && !seen.has(dep)) queue.push(dep);
    }
  }
  return [...seen].map((f) => path.relative(root, f)).sort();
}

/** Files edited after `since` (or deleted), newest first, with the newest edit time. */
export function changedSince(files: readonly string[], root: string, since: number): { changed: string[]; changedAt: number | null } {
  const hits: { file: string; at: number }[] = [];
  for (const file of files) {
    let at: number;
    try {
      at = statSync(path.join(root, file)).mtimeMs;
    } catch {
      at = Date.now(); // deleted or renamed: the worker still runs the old copy
    }
    if (at > since) hits.push({ file, at });
  }
  hits.sort((a, b) => b.at - a.at);
  return { changed: hits.map((h) => h.file), changedAt: hits[0]?.at ?? null };
}
