// Screenshot a page (or one panel of it) after the client charts have drawn.
//
//   node scripts/screenshot.mjs <url> <out.png> [--panel "text in the panel"] [--dark] [--size 1440x1100] [--wait 12000]
//
// Chrome's own --screenshot fires before Recharts and MapLibre render, and its
// default headless mode has no WebGL, so the macro page's cycle clock and world
// map came out blank. This drives Chrome over the DevTools protocol instead:
// software WebGL (SwiftShader), wait, scroll the panel into view, capture it.
// Needs Google Chrome; set CHROME to its binary when it is not in the default
// macOS location. Uses Node's built-in fetch and WebSocket, no dependencies.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const dark = args.includes("--dark") ? (args.splice(args.indexOf("--dark"), 1), true) : false;
const panel = flag("--panel");
const [w, h] = (flag("--size") ?? "1440x1100").split("x");
const wait = Number(flag("--wait") ?? 12000);
const [url, out] = args;
if (!url || !out) {
  console.error('usage: node scripts/screenshot.mjs <url> <out.png> [--panel "text"] [--dark] [--size 1440x1100] [--wait 12000]');
  process.exit(2);
}

const chromeBin = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), "wh-shot-"));
const chrome = spawn(
  chromeBin,
  ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--window-size=${w},${h}`, `--user-data-dir=${profile}`, "about:blank"],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let ws;
  for (let i = 0; i < 50 && !ws; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
    } catch {
      await sleep(200);
    }
  }
  if (!ws) throw new Error("Chrome did not start");
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) => new Promise((r) => (pending.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));

  await send("Page.enable");
  if (dark) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await send("Page.navigate", { url });
  await sleep(wait);

  let clip;
  if (panel) {
    // The innermost <section> (a Panel) containing the text.
    const r = await send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const s = [...document.querySelectorAll("main section")].filter((e) => e.textContent.includes(${JSON.stringify(panel)})).pop();
        if (!s) return null;
        s.scrollIntoView({ block: "start" });
        const b = s.getBoundingClientRect();
        return { x: b.x + scrollX, y: b.y + scrollY, width: b.width, height: b.height };
      })()`,
    });
    clip = r.result?.result?.value;
    if (!clip) throw new Error(`no panel containing "${panel}"`);
    await sleep(2500);
  }
  const shot = await send("Page.captureScreenshot", clip ? { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: true } : { format: "png" });
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log(`saved ${out}`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
