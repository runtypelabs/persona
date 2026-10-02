import { expect, type Page } from "@playwright/test";
import { sseEvent } from "./fake-history-api";

/**
 * Selectors and helpers for the full-duplex voice suite. The fixture page is
 * `apps/web/voice-e2e.html`; its chat traffic (`/e2e-api/v1/client/*`) is
 * faked by `installFakeHistoryApi` and its voice socket by
 * `startFakeVoiceServer`.
 */
export const voiceSel = {
  mic: "[data-persona-composer-mic]",
  composerInput: ".persona-widget-footer textarea, .persona-widget-footer input[type='text']",
  bubble: "[data-message-id]",
  userBubble: '[data-message-id][data-persona-theme-zone="user-message"]',
  assistantBubble: '[data-message-id][data-persona-theme-zone="assistant-message"]',
} as const;

export interface VoicePageOptions {
  voiceHost: string;
  clientDelegation?: boolean;
  callContext?: string;
  approvalTimeoutMs?: number;
  /** `false` hides the AI-disclosure notice. */
  disclosureText?: string | false;
}

export function voiceFixtureUrl(options: VoicePageOptions): string {
  const params = new URLSearchParams({ voiceHost: options.voiceHost });
  if (options.clientDelegation === false) params.set("clientDelegation", "0");
  if (options.callContext) params.set("callContext", options.callContext);
  if (options.approvalTimeoutMs) params.set("approvalTimeoutMs", String(options.approvalTimeoutMs));
  if (options.disclosureText !== undefined) params.set("disclosureText", options.disclosureText || "0");
  return `/voice-e2e.html?${params.toString()}`;
}

export async function openVoicePage(page: Page, options: VoicePageOptions): Promise<void> {
  await page.goto(voiceFixtureUrl(options));
  await page.waitForFunction(
    () => Boolean((window as unknown as { __personaE2E?: unknown }).__personaE2E),
  );
  await expect(page.locator(".persona-widget-container")).toBeVisible();
}

export async function typeMessage(page: Page, text: string): Promise<void> {
  const input = page.locator(voiceSel.composerInput).first();
  await input.click();
  await input.fill(text);
  await input.press("Enter");
}

/**
 * Click the mic during a live call (hang up). The live-level animation keeps
 * the button's box moving, so Playwright's stability wait never settles.
 */
export async function clickLiveMic(page: Page): Promise<void> {
  await page.locator(voiceSel.mic).click({ force: true });
}

/** Visible bubbles in DOM order, as `role: text` (whitespace collapsed). */
export async function transcript(page: Page): Promise<string[]> {
  return page.locator(voiceSel.bubble).evaluateAll((nodes) =>
    nodes
      .filter((node) => node.getAttribute("data-persona-theme-zone")?.endsWith("-message"))
      .map((node) => {
        const role =
          node.getAttribute("data-persona-theme-zone") === "user-message" ? "user" : "assistant";
        return `${role}: ${(node.textContent ?? "").replace(/\s+/g, " ").trim()}`;
      }),
  );
}

/** One agent turn that calls a tool, then streams Markdown text. */
export function toolThenMarkdownStream(options: {
  toolName: string;
  parameters: Record<string, unknown>;
  result: unknown;
  markdown: string;
  executionId?: string;
}): string {
  const executionId = options.executionId ?? "exec_voice";
  const now = new Date().toISOString();
  let seq = 0;
  const ev = (type: string, data: Record<string, unknown>) =>
    sseEvent(type, { executionId, seq: ++seq, ...data });
  // Stream the Markdown in a few deltas, as a model would.
  const chunks = options.markdown.match(/[\s\S]{1,24}/g) ?? [];
  return (
    ev("execution_start", {
      kind: "agent",
      agentId: "agent_e2e_voice",
      agentName: "E2E",
      maxTurns: 2,
      startedAt: now,
    }) +
    ev("turn_start", { id: "turn_1", iteration: 1, role: "assistant" }) +
    ev("tool_start", {
      toolCallId: "call_hours",
      toolName: options.toolName,
      toolType: "custom",
      parameters: options.parameters,
      iteration: 1,
    }) +
    ev("tool_complete", { toolCallId: "call_hours", success: true, result: options.result }) +
    ev("text_start", { id: "text_1", role: "assistant" }) +
    chunks.map((delta) => ev("text_delta", { id: "text_1", delta })).join("") +
    ev("text_complete", { id: "text_1" }) +
    ev("turn_complete", {
      id: "turn_1",
      iteration: 1,
      role: "assistant",
      stopReason: "end_turn",
      completedAt: now,
    }) +
    ev("execution_complete", { kind: "agent", success: true, completedAt: now })
  );
}

/** Messages (role + text) of a recorded `/v1/client/chat` request body. */
export function chatMessages(
  body: Record<string, unknown> | null,
): Array<{ role: string; text: string }> {
  const messages = (body?.messages ?? []) as Array<{ role?: string; content?: unknown }>;
  return messages.map((m) => ({
    role: String(m.role ?? ""),
    text:
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .map((part) => (part as { text?: string })?.text ?? "")
              .join("")
          : JSON.stringify(m.content ?? ""),
  }));
}
