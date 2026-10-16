import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// These are the public composers that passed the separate access probe.
// ChatGPT/Claude challenge fresh automated browsers; Copilot requires sign-in.
// Never treat a challenge/login page's load as a usable-composer result.
const targets = [
  ["Gemini", "https://gemini.google.com/app", '[role="textbox"][aria-label="Enter a prompt for Gemini"]'],
  ["Perplexity", "https://www.perplexity.ai/", "#ask-input"],
  ["Persona", "http://localhost:5204/fullscreen", "[data-persona-composer-input]"],
];
const output = resolve(process.env.PERSONA_ASSISTANT_RESULTS ?? "/tmp/persona-assistant-bench/controlled");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const [profile, mbps, latency] of [["10 Mbps / 40 ms", 10, 40], ["1 Mbps / 100 ms", 1, 100]]) {
    for (let run = 1; run <= 3; run++) {
      for (const [name, url, selector] of targets) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: `${output}/video` } });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false, latency, downloadThroughput: mbps * 1_000_000 / 8,
          uploadThroughput: mbps * 1_000_000 / 8, connectionType: "cellular4g",
        });
        const result = { name, profile, run, url, elapsedMs: null, status: null, error: null };
        const started = performance.now();
        try {
          const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
          result.status = response?.status();
          await page.locator(selector).fill("benchmark", { timeout: 30_000 });
          await page.waitForFunction(selector => {
            const input = document.querySelector(selector);
            return (input?.value ?? input?.textContent ?? "").includes("benchmark");
          }, selector, { timeout: 5000 });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const retained = await page.locator(selector).evaluate(input => (input.value ?? input.textContent ?? "").includes("benchmark"));
          if (!retained) throw new Error("Composer discarded test text during initialization");
          result.elapsedMs = Math.round(performance.now() - started);
          await page.locator(selector).press("ControlOrMeta+A");
          await page.locator(selector).press("Backspace");
          await page.waitForFunction(selector => {
            const input = document.querySelector(selector);
            return !(input?.value ?? input?.textContent ?? "").includes("benchmark");
          }, selector, { timeout: 5000 });
          result.title = await page.title();
          result.finalUrl = page.url();
          result.resources = await page.evaluate(() => ({
            count: performance.getEntriesByType("resource").length,
            // Cross-origin resources without Timing-Allow-Origin can report 0.
            reportedTransferBytes: performance.getEntriesByType("resource").reduce((n, e) => n + e.transferSize, 0),
          }));
        } catch (error) {
          result.elapsedMs = null;
          result.error = error.message;
          result.title = await page.title();
          result.finalUrl = page.url();
        }
        const stem = `${name}-${mbps}-${run}`;
        result.screenshot = `${output}/${stem}.png`;
        await page.screenshot({ path: result.screenshot });
        result.video = await page.video().path();
        results.push(result);
        await context.close();
        await writeFile(`${output}/results.json`, JSON.stringify({ measuredAt: new Date().toISOString(), browser: browser.version(), method: "Fresh context, cache enabled, navigation to successful unsent composer fill; CPU unthrottled; recording enabled", results }, null, 2));
        console.log(`${name}, ${profile}, run ${run}: ${result.elapsedMs ?? "BLOCKED"} ms${result.error ? ` (${result.title})` : ""}`);
      }
    }
  }
} finally { await browser.close(); }
