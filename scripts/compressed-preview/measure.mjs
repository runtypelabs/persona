import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const url = process.env.PERSONA_PREVIEW_URL ?? "http://localhost:5204/";
const output = resolve(process.env.PERSONA_PREVIEW_RESULTS ?? "/tmp/persona-compressed-preview");
const repetitions = Number(process.env.PERSONA_PREVIEW_RUNS ?? 3);
assert(Number.isInteger(repetitions) && repetitions > 0, "PERSONA_PREVIEW_RUNS must be positive");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const [name, mbps, latency] of [["local", 0, 0], ["10 Mbps / 40 ms", 10, 40], ["1 Mbps / 100 ms", 1, 100]]) {
    for (let run = 1; run <= repetitions; run++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: `${output}/video` } });
      try {
        const page = await context.newPage();
        const errors = [], responses = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("response", response => {
          if (new URL(response.url()).pathname.startsWith("/dist/")) {
            responses.push({ name: new URL(response.url()).pathname, status: response.status(), encoding: response.headers()["content-encoding"] });
          }
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        // Each new context starts empty; keep caching enabled so prefetches can
        // satisfy later loads within this first visit.
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
        if (mbps) await cdp.send("Network.emulateNetworkConditions", {
          offline: false, latency, downloadThroughput: mbps * 1_000_000 / 8,
          uploadThroughput: mbps * 1_000_000 / 8, connectionType: "cellular4g",
        });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.querySelector("#status")?.textContent.startsWith("Click the launcher"), null, { timeout: 30_000 });
        // Click as soon as the real launcher is available; don't add a warm-up
        // delay. Normal installer prefetch remains part of the measured path.
        await page.locator('[data-persona-launcher-surface] button').first().click();
        await page.waitForFunction(() => window.__preview?.readyMs != null, null, { timeout: 60_000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const result = await page.evaluate(() => window.__preview);
        assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
        assert.equal(errors.length, 0, JSON.stringify(errors));
        assert(result.readyMs > 0, "Missing click-to-ready measurement");
        assert(responses.length > 5, "Expected real widget/chunk downloads");
        assert(responses.every(r => r.status === 200 && r.encoding === "br"), JSON.stringify(responses));
        assert(result.resources.some(r => r.name === "index.global.js" && r.encoded > 0 && r.encoded < r.decoded), "Browser did not report compressed core bytes");
        await page.screenshot({ path: `${output}/${name.split(" ")[0]}-${run}.png` });
        results.push({ profile: name, run, ...result, responses, video: await page.video().path() });
        console.log(`${name}, run ${run}: ${Math.round(result.readyMs)} ms, Brotli verified`);
        // One functional smoke check, after the measured interval.
        if (name === "local" && run === 1) {
          const input = page.locator('[data-persona-composer-input]').first();
          await input.fill("Hello"); await input.press("Enter");
          await page.getByText("Replies are mocked. This response uses the local compressed widget build.", { exact: true }).waitFor();
        }
      } finally { await context.close(); }
    }
  }
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ url, measuredAt: new Date().toISOString(), results }, null, 2));
}
for (const profile of [...new Set(results.map(r => r.profile))]) {
  const times = results.filter(r => r.profile === profile).map(r => r.readyMs).sort((a, b) => a - b);
  const middle = Math.floor(times.length / 2);
  const median = times.length % 2 ? times[middle] : (times[middle - 1] + times[middle]) / 2;
  console.log(`${profile}: median ${Math.round(median)} ms (${times.length} cold runs)`);
}
console.log(`Results, screenshots, and videos: ${output}`);
