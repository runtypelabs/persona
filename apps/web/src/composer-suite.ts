/**
 * Composer suite: every phase of the composer roadmap on one page.
 *
 * Keyless by construction. Replies come from `createDemoEchoFetch`, which emits
 * Persona's unified streaming frames in the browser, so no request leaves the
 * page and no UI behavior here depends on a live model. The echo streams slowly
 * on purpose: `defer-one` needs a reachable window to type during.
 */

import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  createLocalStorageAdapter,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type AgentWidgetRequestPayload,
  type AgentWidgetStoredState,
  type ComposerAction,
  type ComposerActionOverflowConfig,
  type ComposerBeforeSendResult,
  type ComposerMode,
  type ComposerModeGroup,
  type ComposerState,
  type ComposerSubmissionSnapshot,
  type ComposerSubmitKey,
} from "@runtypelabs/persona";

import { createDemoConfigInspector } from "./demo-config-inspector";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import { renderDemoScaffold } from "./demo-scaffold";
import type { Mode } from "./examples-nav";
import { runWidgetMountWithInspector, setupMountMode } from "./mount-mode";
import { createFakeUploadAdapter } from "./composer-suite-upload-adapter";
import {
  buildContextMentions,
  buildSlashCommands,
} from "./composer-suite-mentions";

const STORAGE_KEY = "persona-composer-suite";
const SIGNATURE = "\n\n(signed by the composer suite demo)";

// ── Sidebar state (mirrored into the widget through controller.update) ───────
const controls = {
  overflowWidth: 560 as number | null,
  beforeSend: true,
  inputDisabled: false,
  sendDisabled: false,
  submitKey: "enter" as ComposerSubmitKey,
  failNextUpload: false,
  mentions: false,
  mentionDisplay: "chip" as "chip" | "inline",
  foldMentionButton: false,
  controlSize: "40px",
};

let activeMode: Mode = "inline";
let activeStage: HTMLElement | null = null;
let activeController: AgentWidgetController | null = null;
let teardownActive: (() => void) | null = null;

const scaffold = renderDemoScaffold({
  slug: "composer-suite",
  title: "Composer suite",
  blurb:
    "Modes, models, overflow, send interception, locks, uploads, drafts, deferred sends, and the public composer state, all on one keyless page.",
});

const configInspector = createDemoConfigInspector({ title: "Composer suite" });

// ── Sidebar plumbing ─────────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(selector: string): T | null =>
  document.querySelector<T>(selector);

const logEl = $<HTMLElement>("#cs-log");
const optionsReadout = $<HTMLElement>("#cs-composer-options");
const stateReadout = $<HTMLElement>("#cs-state");
const beforeSendStatus = $<HTMLElement>("#cs-before-send-status");

/**
 * Browsers restore checkbox and select values across a reload, and the restore
 * does not reliably fire `change`. Reading the live DOM into `controls` before
 * the first mount keeps the sidebar and the config that ships from drifting.
 */
function readControlsFromDom(): void {
  const width = $<HTMLSelectElement>("#cs-overflow-width")?.value;
  if (width !== undefined) {
    controls.overflowWidth = width === "" ? null : Number(width);
  }
  const checkbox = (selector: string, fallback: boolean): boolean =>
    $<HTMLInputElement>(selector)?.checked ?? fallback;
  controls.beforeSend = checkbox("#cs-before-send", controls.beforeSend);
  controls.inputDisabled = checkbox("#cs-input-disabled", controls.inputDisabled);
  controls.sendDisabled = checkbox("#cs-send-disabled", controls.sendDisabled);
  controls.failNextUpload = checkbox("#cs-fail-upload", controls.failNextUpload);
  controls.mentions = checkbox("#cs-mentions", controls.mentions);
  controls.foldMentionButton = checkbox(
    "#cs-mentions-fold",
    controls.foldMentionButton,
  );
  const submitKey = $<HTMLSelectElement>("#cs-submit-key")?.value;
  if (submitKey) controls.submitKey = submitKey as ComposerSubmitKey;
  const display = $<HTMLSelectElement>("#cs-mentions-display")?.value;
  if (display) controls.mentionDisplay = display as "chip" | "inline";
  const controlSize = $<HTMLSelectElement>("#cs-control-size")?.value;
  if (controlSize) controls.controlSize = controlSize;
}
readControlsFromDom();

function log(message: string, tone: "info" | "error" | "session" = "info"): void {
  if (!logEl) return;
  const entry = document.createElement("div");
  entry.className = `log-entry ${tone}`;
  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = new Date().toLocaleTimeString();
  entry.append(time, document.createTextNode(` ${message}`));
  logEl.prepend(entry);
  while (logEl.childElementCount > 40) logEl.lastElementChild?.remove();
}

function setBeforeSendStatus(text: string, tone: "idle" | "blocked" | "sent"): void {
  if (!beforeSendStatus) return;
  beforeSendStatus.textContent = text;
  beforeSendStatus.dataset.tone = tone;
}

// ── 1. Models and modes ──────────────────────────────────────────────────────
const MODELS = [
  { id: "swift-1", label: "Swift 1" },
  { id: "atlas-2", label: "Atlas 2" },
  { id: "atlas-2-pro", label: "Atlas 2 Pro" },
];

const MODE_GROUPS: ComposerModeGroup[] = [
  { id: "answer-style", selection: "single" },
];

const MODES: ComposerMode[] = [
  {
    id: "concise",
    groupId: "answer-style",
    label: "Answer concisely",
    shortLabel: "Concise",
    iconName: "zap",
    placeholder: "Ask for the short version…",
    persistence: "sticky",
  },
  {
    id: "deep-dive",
    groupId: "answer-style",
    label: "Deep dive for this turn only",
    shortLabel: "Deep dive",
    iconName: "search",
    placeholder: "Ask something worth a long answer, once…",
    persistence: "once",
  },
  {
    id: "cite-sources",
    label: "Cite sources",
    shortLabel: "Cite",
    iconName: "quote",
    placeholder: "Ask, and every claim gets a citation…",
    persistence: "sticky",
  },
];

// ── 2. Host actions, three of which fold into the overflow menu ──────────────
const appendToDraft = (suffix: string) => (ctx: { getValue: () => string; setValue: (v: string) => void }) => {
  const next = `${ctx.getValue().trim()} ${suffix}`.trim();
  ctx.setValue(next);
};

const HOST_ACTIONS: ComposerAction[] = [
  {
    id: "summarize",
    placement: "start",
    presentation: "auto",
    order: 300,
    label: "Ask for a summary",
    tooltipText: "Ask for a summary",
    iconName: "file-text",
    onSelect: appendToDraft("Summarize this in five bullets."),
  },
  {
    id: "translate",
    placement: "start",
    presentation: "auto",
    order: 310,
    label: "Ask for a translation",
    tooltipText: "Ask for a translation",
    iconName: "globe",
    onSelect: appendToDraft("Translate the result into Spanish."),
  },
  {
    id: "tone",
    placement: "start",
    presentation: "auto",
    order: 320,
    label: "Ask for a friendlier tone",
    tooltipText: "Ask for a friendlier tone",
    iconName: "heart",
    onSelect: appendToDraft("Keep the tone warm and plain."),
  },
  {
    // Always in the menu, whatever the width: the contrast makes "auto" legible.
    id: "clear-draft",
    placement: "start",
    presentation: "overflow",
    order: 330,
    label: "Clear the draft",
    tooltipText: "Clear the draft",
    iconName: "x",
    disableWhenStreaming: true,
    onSelect: (ctx) => ctx.setValue(""),
  },
];

const overflowConfig = (): ComposerActionOverflowConfig => ({
  enabled: true,
  ...(controls.overflowWidth !== null && {
    collapseAutoActionsBelow: controls.overflowWidth,
  }),
  // Folding a built-in is always explicit: enabling the menu never moves the
  // mention affordance by itself.
  includeBuiltIns: controls.foldMentionButton ? ["mentions"] : [],
});

// ── 11. Mentions and commands ────────────────────────────────────────────────
const listCommands = (): string =>
  buildSlashCommands({ log, listCommands: () => "" })
    .map((command) => `- /${command.name}: ${command.description ?? ""}`)
    .join("\n");

/** `undefined` removes contextMentions from the config entirely. */
const mentionsConfig = () =>
  controls.mentions
    ? buildContextMentions({
        display: controls.mentionDisplay,
        log,
        listCommands,
      })
    : undefined;

// ── 3. onBeforeSend ──────────────────────────────────────────────────────────
function onBeforeSend(
  snapshot: Readonly<ComposerSubmissionSnapshot>,
): ComposerBeforeSendResult {
  if (/blocked/i.test(snapshot.text)) {
    setBeforeSendStatus(
      "Blocked: the draft contained the word blocked, so the send was refused and your draft was left alone.",
      "blocked",
    );
    log(`onBeforeSend refused: "${snapshot.text}"`, "error");
    return false;
  }
  const sent = `${snapshot.text}${SIGNATURE}`;
  setBeforeSendStatus(
    `Sent with a signature appended. Typed ${snapshot.text.length} characters, sent ${sent.length}.`,
    "sent",
  );
  log(`onBeforeSend typed: "${snapshot.text}"`);
  log(`onBeforeSend sent:  "${sent.replace(/\n+/g, " ")}"`);
  return { text: sent };
}

// ── 6. Fake upload adapter ───────────────────────────────────────────────────
const uploadAdapter = createFakeUploadAdapter({
  shouldFailNext: () => {
    if (!controls.failNextUpload) return false;
    controls.failNextUpload = false;
    const toggle = $<HTMLInputElement>("#cs-fail-upload");
    if (toggle) toggle.checked = false;
    return true;
  },
  log,
});

// ── Keyless backend: the echo prints the payload it actually received ────────
const composerFetch = createDemoEchoFetch({
  // Slow on purpose: `defer-one` needs a window wide enough to type a second
  // message during the reply. Roughly 110 characters a second.
  chunkSize: 5,
  delayMs: 45,
  reply: (userText: string, payload: AgentWidgetRequestPayload) => {
    const received = {
      text: userText,
      composerOptions: payload.composerOptions ?? null,
    };
    return [
      "This is what actually reached the backend for this turn:",
      "",
      "```json",
      JSON.stringify(received, null, 2),
      "```",
      "",
      "No key and no network: an in-browser echo emits the same streaming frames a real dispatch does. It streams slowly on purpose, so keep typing and press enter to watch a second message queue itself above the composer.",
    ].join("\n");
  },
});

// ── Config ───────────────────────────────────────────────────────────────────
const buildConfig = (mode: Mode): AgentWidgetConfig => ({
  ...DEFAULT_WIDGET_CONFIG,
  customFetch: composerFetch,
  storageAdapter: createLocalStorageAdapter(STORAGE_KEY),
  persistState: {
    storage: "local",
    keyPrefix: "persona-composer-suite-",
    persist: { draft: true },
  },
  attachments: {
    enabled: true,
    maxFiles: 3,
    adapter: uploadAdapter,
  },
  messageActions: {
    ...DEFAULT_WIDGET_CONFIG.messageActions,
    enabled: true,
    showCopy: true,
    showEdit: true,
    showRegenerate: true,
    showQuote: true,
    visibility: "hover",
  },
  composer: {
    actions: HOST_ACTIONS,
    actionOverflow: overflowConfig(),
    models: MODELS,
    selectedModelId: "atlas-2",
    onModelChange: (modelId) => log(`onModelChange: ${modelId}`, "session"),
    modes: MODES,
    modeGroups: MODE_GROUPS,
    submitKey: controls.submitKey,
    streamingSubmitBehavior: "defer-one",
    ...(controls.beforeSend && { onBeforeSend }),
    ...(controls.inputDisabled && {
      inputDisabled: { reason: "Composition is locked while the account is read only." },
    }),
    ...(controls.sendDisabled && {
      sendDisabled: { reason: "Drafting is open, but sending is paused until the reviewer signs off." },
    }),
  },
  // Absent, not disabled, while the section is off: the key never reaches the
  // widget so the whole mention runtime stays unloaded.
  ...(controls.mentions && { contextMentions: mentionsConfig() }),
  theme: { components: { composer: { controlSize: controls.controlSize } } },
  welcome: {
    title: "Composer suite",
    subtitle:
      "Pick a model, toggle a mode, attach a file, then send and keep typing while it streams.",
  },
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    enabled: mode === "launcher",
    width: mode === "launcher" ? "min(420px, 94vw)" : "100%",
    title: mode === "launcher" ? "Composer suite" : undefined,
  },
});

function remount(): void {
  if (!activeStage) return;
  teardownActive?.();
  const mounted = runWidgetMountWithInspector(
    configInspector,
    activeMode,
    activeStage,
    buildConfig,
  );
  activeController = mounted.controller;
  teardownActive = mounted.teardown;
}

setupMountMode({
  slug: "composer-suite",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    activeMode = mode;
    activeStage = stage;
    remount();
    return () => {
      teardownActive?.();
      teardownActive = null;
      activeController = null;
      activeStage = null;
    };
  },
});

// ── 10. Live composer state, and the composerOptions it would ship ───────────
// The event bubbles and is composed, so one document listener outlives every
// remount and every mount mode.
document.addEventListener("persona:composer:state", (event) => {
  const state = (event as CustomEvent<ComposerState>).detail;
  if (!state) return;

  if (optionsReadout) {
    const options = {
      ...(state.selectedModelId && { selectedModelId: state.selectedModelId }),
      ...(state.activeModeIds.length > 0 && {
        activeModeIds: [...state.activeModeIds],
      }),
    };
    optionsReadout.textContent = JSON.stringify(options, null, 2);
  }

  if (stateReadout) {
    // Read back through the public getter, not the event payload, so the panel
    // proves the controller view rather than the event view.
    const snapshot = activeController?.getComposerState() ?? state;
    stateReadout.textContent = JSON.stringify(snapshot, null, 2);
  }
});

// ── 2. Overflow collapse width, live ─────────────────────────────────────────
$<HTMLSelectElement>("#cs-overflow-width")?.addEventListener("change", (event) => {
  const value = (event.currentTarget as HTMLSelectElement).value;
  controls.overflowWidth = value === "" ? null : Number(value);
  activeController?.update({ composer: { actionOverflow: overflowConfig() } });
  log(
    controls.overflowWidth === null
      ? "collapseAutoActionsBelow unset: auto actions stay in the bar"
      : `collapseAutoActionsBelow: ${controls.overflowWidth}px`,
  );
});

// ── 3. onBeforeSend on and off, live ─────────────────────────────────────────
$<HTMLInputElement>("#cs-before-send")?.addEventListener("change", (event) => {
  controls.beforeSend = (event.currentTarget as HTMLInputElement).checked;
  // An explicit undefined resets the hook: the patch policy treats it as a
  // removal, not a no-op.
  activeController?.update({
    composer: { onBeforeSend: controls.beforeSend ? onBeforeSend : undefined },
  });
  setBeforeSendStatus(
    controls.beforeSend
      ? "Interceptor on. Sends containing the word blocked are refused."
      : "Interceptor off. Every send goes out exactly as typed.",
    "idle",
  );
  log(`composer.onBeforeSend ${controls.beforeSend ? "installed" : "removed"}`);
});

// ── 4. Locks, live ───────────────────────────────────────────────────────────
$<HTMLInputElement>("#cs-input-disabled")?.addEventListener("change", (event) => {
  controls.inputDisabled = (event.currentTarget as HTMLInputElement).checked;
  activeController?.update({
    composer: {
      inputDisabled: controls.inputDisabled
        ? { reason: "Composition is locked while the account is read only." }
        : false,
    },
  });
  log(`composer.inputDisabled: ${controls.inputDisabled}`);
});

$<HTMLInputElement>("#cs-send-disabled")?.addEventListener("change", (event) => {
  controls.sendDisabled = (event.currentTarget as HTMLInputElement).checked;
  activeController?.update({
    composer: {
      sendDisabled: controls.sendDisabled
        ? { reason: "Drafting is open, but sending is paused until the reviewer signs off." }
        : false,
    },
  });
  log(`composer.sendDisabled: ${controls.sendDisabled}`);
});

// ── 5. submitKey, live ───────────────────────────────────────────────────────
$<HTMLSelectElement>("#cs-submit-key")?.addEventListener("change", (event) => {
  controls.submitKey = (event.currentTarget as HTMLSelectElement)
    .value as ComposerSubmitKey;
  activeController?.update({ composer: { submitKey: controls.submitKey } });
  log(`composer.submitKey: ${controls.submitKey}`);
});

// ── 5b. Composer control size, live ──────────────────────────────────────────
// One theme token sizes every icon control in the action row at once.
$<HTMLSelectElement>("#cs-control-size")?.addEventListener("change", (event) => {
  controls.controlSize = (event.currentTarget as HTMLSelectElement).value;
  activeController?.update({
    theme: { components: { composer: { controlSize: controls.controlSize } } },
  });
  log(`theme.components.composer.controlSize: ${controls.controlSize}`);
});

// ── 6. Fail the next upload ──────────────────────────────────────────────────
$<HTMLInputElement>("#cs-fail-upload")?.addEventListener("change", (event) => {
  controls.failNextUpload = (event.currentTarget as HTMLInputElement).checked;
  log(
    controls.failNextUpload
      ? "the next upload will fail, then the switch clears itself"
      : "uploads will succeed",
  );
});

// ── 7. Draft persistence ─────────────────────────────────────────────────────
// The draft rides the conversation storage payload, so dropping just the draft
// key (rather than the whole record) is the honest demonstration.
$<HTMLButtonElement>("#cs-clear-draft")?.addEventListener("click", () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as AgentWidgetStoredState;
      delete stored.draft;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  window.location.reload();
});

// ── 11. Mentions and commands, live ──────────────────────────────────────────
// An explicit undefined removes `contextMentions` from the config; the patch
// policy treats an own undefined as a delete, so the widget sees the key gone
// rather than a disabled block.
const applyMentions = (): void => {
  activeController?.update({ contextMentions: mentionsConfig() });
  const select = $<HTMLSelectElement>("#cs-mentions-display");
  if (select) select.disabled = !controls.mentions;
  const fold = $<HTMLInputElement>("#cs-mentions-fold");
  if (fold) fold.disabled = !controls.mentions;
};

$<HTMLInputElement>("#cs-mentions")?.addEventListener("change", (event) => {
  controls.mentions = (event.currentTarget as HTMLInputElement).checked;
  applyMentions();
  log(
    controls.mentions
      ? `contextMentions enabled, display ${controls.mentionDisplay}`
      : "contextMentions removed from the config",
  );
});

$<HTMLSelectElement>("#cs-mentions-display")?.addEventListener("change", (event) => {
  controls.mentionDisplay = (event.currentTarget as HTMLSelectElement).value as
    | "chip"
    | "inline";
  applyMentions();
  log(`contextMentions.display: ${controls.mentionDisplay}`);
});

$<HTMLInputElement>("#cs-mentions-fold")?.addEventListener("change", (event) => {
  controls.foldMentionButton = (event.currentTarget as HTMLInputElement).checked;
  activeController?.update({ composer: { actionOverflow: overflowConfig() } });
  log(
    controls.foldMentionButton
      ? "actionOverflow.includeBuiltIns: [\"mentions\"]"
      : "actionOverflow.includeBuiltIns: []",
  );
});

setBeforeSendStatus(
  "Interceptor on. Sends containing the word blocked are refused.",
  "idle",
);
applyMentions();

Object.defineProperty(window, "composerSuiteController", {
  configurable: true,
  get: () => activeController,
});

void scaffold;
