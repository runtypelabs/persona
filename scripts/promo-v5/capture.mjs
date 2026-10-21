// Renders the promo deterministically: seek → screenshot per frame → ffmpeg.
// Start the page first (from this folder):
//   ../../packages/widget/node_modules/.bin/vite --config vite.config.mjs
// then:
//   node capture.mjs --stills 0.5,2.2,6        (PNG stills for review)
//   node capture.mjs --fps 60 --scale 2 --out persona-v5.mp4
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") ? true : all[i + 1] ?? true]);
  return acc;
}, []));
const url = args.url ?? "http://localhost:5199/";
const scale = Number(args.scale ?? 1);
const fps = Number(args.fps ?? 60);
const duration = Number(args.duration ?? 10);
const outDir = args.dir ?? "out";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale, reducedMotion: "no-preference" });
page.on("console", (m) => { if (m.type() === "error") console.error("[page]", m.text()); });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.waitForTimeout(2500); // let mount-time transitions finish before virtual time starts

if (args.stills) {
  for (const t of String(args.stills).split(",").map(Number)) {
    await page.evaluate((t) => window.__seek(t), t);
    const file = path.join(outDir, `still-${t.toFixed(2)}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
  await browser.close();
  process.exit(0);
}

const out = args.out ?? "persona-v5-preview.mp4";
const total = Math.round(fps * duration);
const ff = spawn("ffmpeg", [
  "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
  "-vf", "scale=1920:1080:flags=lanczos,format=yuv420p",
  "-c:v", "libx264", "-preset", "slow", "-crf", String(args.crf ?? 16), "-profile:v", "high", "-level", "4.2",
  "-r", String(fps), "-movflags", "+faststart", out,
], { stdio: ["pipe", "inherit", "inherit"] });
const started = Date.now();
for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.__seek(t), i / fps);
  const png = await page.screenshot({ type: "png" });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 60 === 0) console.log(`frame ${i}/${total} · ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
console.log(`wrote ${out}`);
