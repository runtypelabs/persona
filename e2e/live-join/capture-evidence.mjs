import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [label, source, output] = process.argv.slice(2);
if (!['before', 'after'].includes(label) || !source || !output) {
  throw new Error('Usage: node e2e/live-join/capture-evidence.mjs before|after <source-repo> <output-directory>');
}
const sha = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const port = Number(process.env.PERSONA_JOIN_PORT || 4318);
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['e2e/live-join/server.mjs'], {
  env: { ...process.env, PERSONA_JOIN_DIST: resolve(source, 'packages/widget/dist') },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const ready = new Promise((accept, reject) => {
  server.stdout.once('data', accept);
  server.once('error', reject);
  server.once('exit', code => reject(new Error(`Fixture server exited: ${code}`)));
});
let browser;
try {
  await ready;
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
  for (const viewport of [{ width: 1100, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, colorScheme: 'light' });
    await page.goto(url);
    await page.waitForFunction(() => !!window.joinController);
    await page.waitForFunction(() => !document.querySelector('textarea')?.disabled);
    const input = page.locator('textarea').first();
    await input.fill('[[mock:tool name=mcp_custom_join_fixture_slow_tool args={"delayMs":8000}]]');
    await input.press('Enter');
    await page.waitForFunction(() => window.joinController.getMessages().some(message => message.toolCall?.name?.includes('slow_tool') && message.toolCall.status !== 'complete'));
    const file = `${label}-${viewport.width}.png`;
    await page.screenshot({ path: resolve(output, file), fullPage: true, animations: 'disabled' });
    await writeFile(resolve(output, `${label}-${viewport.width}.json`), JSON.stringify({ label, sha, viewport, route: '/', theme: 'light', state: 'first slow MCP tool in progress', file }, null, 2));
    await page.waitForFunction(() => window.joinController.getMessages().some(message => message.toolCall?.name?.includes('slow_tool') && message.toolCall.status === 'complete'));
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
