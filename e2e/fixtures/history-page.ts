import { expect, type Page } from "@playwright/test";

/**
 * Selectors and small helpers shared by the history browser suite. Every
 * selector here is a stable contract asserted by the jsdom component tests
 * (`components/history-view.test.ts`, `ui.history-shell.test.ts`).
 */
export const sel = {
  historyToggle: "[data-persona-history-toggle]",
  view: ".persona-history-view",
  viewPresentation: "[data-persona-history-presentation]",
  close: '[data-persona-history-focus="close"]',
  row: ".persona-history-row",
  rowFor: (id: string) => `[data-persona-history-conversation="${id}"]`,
  state: "[data-persona-history-state]",
  transcript: "#persona-scroll-container",
  footer: ".persona-widget-footer",
  composerInput: ".persona-widget-footer textarea, .persona-widget-footer input[type='text']",
  bubble: "[data-message-id]",
  earlier: "[data-persona-history-earlier]",
  railShell: ".persona-history-rail-shell",
  newConversation: ".persona-history-new",
} as const;

export type FixtureMode = "demo" | "intercepted";

export interface FixtureOptions {
  mode?: FixtureMode;
  presentation?: "panel" | "rail" | "auto";
  width?: number;
  throwRenderView?: boolean;
  persist?: boolean;
  keyPrefix?: string;
}

/** URL for the internal fixture page (`apps/web/history-e2e.html`). */
export function fixtureUrl(options: FixtureOptions = {}): string {
  const params = new URLSearchParams();
  params.set("mode", options.mode ?? "demo");
  if (options.presentation) params.set("presentation", options.presentation);
  if (options.width) params.set("width", String(options.width));
  if (options.throwRenderView) params.set("throwRenderView", "1");
  if (options.persist === false) params.set("persist", "0");
  if (options.keyPrefix) params.set("keyPrefix", options.keyPrefix);
  return `/history-e2e.html?${params.toString()}`;
}

/** Resolves once the fixture has mounted and exposed its handles. */
export async function waitForWidget(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __personaE2E?: unknown }).__personaE2E)
  );
  await expect(page.locator(".persona-widget-container")).toBeVisible();
}

/** Opens Messages through the header button, as a visitor would. */
export async function openMessages(page: Page): Promise<void> {
  await page.locator(sel.historyToggle).click();
}

/** Every localStorage entry whose key looks like the visitor credential. */
export async function visitorEntries(
  page: Page
): Promise<Array<{ key: string; value: string }>> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.includes("visitor:"))
      .map((key) => ({ key, value: localStorage.getItem(key) ?? "" }))
  );
}

export async function visitorToken(page: Page): Promise<string | null> {
  const entries = await visitorEntries(page);
  return entries.length === 1 ? entries[0]!.value : null;
}

/** Sends a message through the real composer. */
export async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.locator(sel.composerInput).first();
  await input.click();
  await input.fill(text);
  await input.press("Enter");
}
