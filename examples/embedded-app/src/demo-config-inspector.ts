/**
 * Shared live config inspector for advanced Persona examples.
 * Renders in the left rail: Live config (delta), Install code, optional Scenario payload.
 */

import {
  DEFAULT_WIDGET_CONFIG,
  generateCodeSnippet,
  type AgentWidgetConfig,
  type CodeFormat,
} from "@runtypelabs/persona";
import type { Mode } from "./examples-nav";

export type DemoConfigInspectorOptions = {
  /** Mount target; defaults to `[data-config-inspector]` or appends to `.stage-controls`. */
  root?: HTMLElement | string;
  /** Shown in the card subtitle, e.g. "Ask User Question". */
  title?: string;
  /** Default install snippet format. */
  defaultFormat?: CodeFormat;
  /** Keys to always show even when equal to defaults (e.g. apiUrl in demos). */
  alwaysShowKeys?: string[];
};

export type DemoConfigUpdate = {
  config: AgentWidgetConfig | Record<string, unknown>;
  mode?: Mode;
  /** Optional inject payload (tool args, form props, etc.). */
  scenario?: unknown;
  scenarioLabel?: string;
};

export type DemoConfigInspector = {
  update: (patch: DemoConfigUpdate) => void;
  setScenario: (payload: unknown, label?: string) => void;
  root: HTMLElement;
  destroy: () => void;
};

const INSTALL_FORMATS: { value: CodeFormat; label: string }[] = [
  { value: "esm", label: "ESM module" },
  { value: "script-installer", label: "Script tag (installer)" },
  { value: "script-manual", label: "Script tag (manual)" },
  { value: "script-advanced", label: "Script tag (advanced)" },
];

const LOCAL_API_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i;

const DEMO_PLACEHOLDER_API = "https://your-api.example.com/api/chat/dispatch";

type TabId = "live" | "install" | "scenario";

function resolveRoot(options: DemoConfigInspectorOptions): HTMLElement {
  if (options.root) {
    if (typeof options.root === "string") {
      const el = document.querySelector<HTMLElement>(options.root);
      if (el) return el;
    } else {
      return options.root;
    }
  }
  const slot = document.querySelector<HTMLElement>("[data-config-inspector]");
  if (slot) return slot;
  const controls = document.querySelector<HTMLElement>(".stage-controls");
  if (!controls) {
    const fallback = document.createElement("div");
    fallback.setAttribute("data-config-inspector", "");
    document.body.appendChild(fallback);
    return fallback;
  }
  const mount = document.createElement("div");
  mount.setAttribute("data-config-inspector", "");
  mount.className = "config-inspector-mount";
  controls.appendChild(mount);
  return mount;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => deepEqual(a[k], b[k]));
}

/** Strip keys equal to DEFAULT_WIDGET_CONFIG unless showFull. */
function configDelta(
  config: Record<string, unknown>,
  showFull: boolean,
  alwaysShowKeys: string[],
): Record<string, unknown> {
  if (showFull) return sanitizeForDisplay(config);
  const defaults = DEFAULT_WIDGET_CONFIG as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(config)) {
    if (alwaysShowKeys.includes(key)) {
      out[key] = sanitizeValue(config[key], key);
      continue;
    }
    const def = defaults[key];
    const val = config[key];
    if (def === undefined) {
      out[key] = sanitizeValue(val, key);
      continue;
    }
    if (!deepEqual(val, def)) {
      out[key] = sanitizeValue(val, key);
    }
  }
  return out;
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (typeof value === "function") {
    const name = value.name || "anonymous";
    return { __demo: `/* function */ ${name}()` };
  }
  if (key === "storageAdapter" && value && typeof value === "object") {
    return { __demo: "createLocalStorageAdapter('your-storage-key')" };
  }
  if (key === "postprocessMessage" && typeof value === "function") {
    return { __demo: "markdownPostprocessor" };
  }
  if (key === "plugins" && Array.isArray(value)) {
    return value.map((p) => {
      if (typeof p === "object" && p !== null && "name" in p) {
        return { __demo: `plugin: ${String((p as { name?: string }).name)}` };
      }
      return { __demo: "custom plugin" };
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (isPlainObject(value)) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      obj[k] = sanitizeValue(v, k);
    }
    return obj;
  }
  return value;
}

function sanitizeForDisplay(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    out[key] = sanitizeValue(value, key);
  }
  return out;
}

function configForInstallSnippet(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const clean = { ...config };
  delete clean.postprocessMessage;
  delete clean.initialMessages;
  delete clean.storageAdapter;
  if (typeof clean.apiUrl === "string" && LOCAL_API_PATTERN.test(clean.apiUrl)) {
    clean.apiUrl = DEMO_PLACEHOLDER_API;
  }
  if (typeof clean.apiUrl === "string" && clean.apiUrl.includes("noop.test")) {
    clean.apiUrl = DEMO_PLACEHOLDER_API;
  }
  return clean;
}

async function copyText(text: string, button: HTMLButtonElement): Promise<void> {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    button.textContent = "Copied";
  }
  window.setTimeout(() => {
    button.textContent = original;
  }, 2000);
}

export function createDemoConfigInspector(
  options: DemoConfigInspectorOptions = {},
): DemoConfigInspector {
  const root = resolveRoot(options);
  const defaultFormat = options.defaultFormat ?? "esm";
  const alwaysShowKeys = options.alwaysShowKeys ?? ["apiUrl", "features", "plugins"];

  let activeTab: TabId = "live";
  let showFull = false;
  let installFormat: CodeFormat = defaultFormat;
  let lastConfig: Record<string, unknown> = {};
  let lastMode: Mode | undefined;
  let lastScenario: unknown;
  let lastScenarioLabel = "Scenario payload";

  root.innerHTML = "";
  root.classList.add("config-inspector");

  const card = document.createElement("section");
  card.className = "config-inspector-card";
  card.setAttribute("aria-label", "Persona configuration");

  const header = document.createElement("div");
  header.className = "config-inspector-header";
  header.innerHTML = `
    <div class="config-inspector-heading">
      <h2 class="config-inspector-title">Configuration</h2>
      <p class="config-inspector-subtitle">${options.title ? `${options.title} · ` : ""}Live values from this demo</p>
    </div>
  `;

  const tablist = document.createElement("div");
  tablist.className = "config-inspector-tabs";
  tablist.setAttribute("role", "tablist");

  const tabLive = document.createElement("button");
  tabLive.type = "button";
  tabLive.className = "config-inspector-tab is-active";
  tabLive.setAttribute("role", "tab");
  tabLive.setAttribute("aria-selected", "true");
  tabLive.dataset.tab = "live";
  tabLive.textContent = "Live config";

  const tabInstall = document.createElement("button");
  tabInstall.type = "button";
  tabInstall.className = "config-inspector-tab";
  tabInstall.setAttribute("role", "tab");
  tabInstall.setAttribute("aria-selected", "false");
  tabInstall.dataset.tab = "install";
  tabInstall.textContent = "Install code";

  const tabScenario = document.createElement("button");
  tabScenario.type = "button";
  tabScenario.className = "config-inspector-tab";
  tabScenario.setAttribute("role", "tab");
  tabScenario.setAttribute("aria-selected", "false");
  tabScenario.dataset.tab = "scenario";
  tabScenario.textContent = "Scenario";
  tabScenario.hidden = true;

  tablist.append(tabLive, tabInstall, tabScenario);

  const toolbar = document.createElement("div");
  toolbar.className = "config-inspector-toolbar";

  const fullToggleLabel = document.createElement("label");
  fullToggleLabel.className = "config-inspector-full-toggle";
  const fullToggle = document.createElement("input");
  fullToggle.type = "checkbox";
  fullToggle.className = "config-inspector-full-checkbox";
  fullToggleLabel.append(fullToggle, document.createTextNode(" Show full config"));

  const formatSelect = document.createElement("select");
  formatSelect.className = "config-inspector-format";
  formatSelect.setAttribute("aria-label", "Install code format");
  for (const f of INSTALL_FORMATS) {
    const opt = document.createElement("option");
    opt.value = f.value;
    opt.textContent = f.label;
    if (f.value === defaultFormat) opt.selected = true;
    formatSelect.appendChild(opt);
  }

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "config-inspector-copy btn";
  copyBtn.textContent = "Copy";

  toolbar.append(fullToggleLabel, formatSelect, copyBtn);

  const modeChip = document.createElement("div");
  modeChip.className = "config-inspector-chips";
  modeChip.hidden = true;

  const pre = document.createElement("pre");
  pre.className = "config-inspector-code";
  const code = document.createElement("code");
  pre.appendChild(code);

  const hint = document.createElement("p");
  hint.className = "config-inspector-hint";
  hint.textContent =
    "Diff vs defaults. Non-serializable hooks show as demo placeholders.";

  card.append(header, tablist, toolbar, modeChip, pre, hint);
  root.appendChild(card);

  const setActiveTab = (tab: TabId): void => {
    activeTab = tab;
    tablist.querySelectorAll<HTMLButtonElement>(".config-inspector-tab").forEach((btn) => {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    fullToggleLabel.hidden = tab !== "live";
    formatSelect.hidden = tab !== "install";
    render();
  };

  const render = (): void => {
    if (lastMode) {
      modeChip.hidden = false;
      modeChip.innerHTML = `<span class="config-inspector-chip">mount: ${lastMode}</span>`;
    } else {
      modeChip.hidden = true;
      modeChip.innerHTML = "";
    }

    if (activeTab === "live") {
      hint.hidden = false;
      const delta = configDelta(lastConfig, showFull, alwaysShowKeys);
      const display =
        Object.keys(delta).length > 0
          ? delta
          : { __note: "No changes from DEFAULT_WIDGET_CONFIG" };
      code.textContent = JSON.stringify(display, null, 2);
      return;
    }

    if (activeTab === "install") {
      hint.hidden = false;
      hint.textContent =
        "Paste-ready snippet. Local demo URLs are replaced with a placeholder.";
      try {
        const snippet = generateCodeSnippet(
          configForInstallSnippet(lastConfig),
          installFormat,
        );
        code.textContent = snippet;
      } catch (err) {
        code.textContent = `// Unable to generate snippet: ${(err as Error).message}`;
      }
      return;
    }

    if (activeTab === "scenario") {
      hint.hidden = false;
      hint.textContent = lastScenarioLabel;
      if (lastScenario === undefined) {
        code.textContent = "// Select a preset or trigger a scenario to see payload JSON.";
      } else {
        const payload = isPlainObject(lastScenario)
          ? sanitizeForDisplay(lastScenario)
          : sanitizeValue(lastScenario);
        code.textContent = JSON.stringify(payload, null, 2);
      }
    }
  };

  tablist.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      ".config-inspector-tab",
    );
    if (!btn?.dataset.tab) return;
    setActiveTab(btn.dataset.tab as TabId);
  });

  fullToggle.addEventListener("change", () => {
    showFull = fullToggle.checked;
    render();
  });

  formatSelect.addEventListener("change", () => {
    installFormat = formatSelect.value as CodeFormat;
    render();
  });

  copyBtn.addEventListener("click", () => {
    void copyText(code.textContent ?? "", copyBtn);
  });

  const update = (patch: DemoConfigUpdate): void => {
    lastConfig = { ...patch.config } as Record<string, unknown>;
    if (patch.mode !== undefined) lastMode = patch.mode;
    if (patch.scenario !== undefined) {
      lastScenario = patch.scenario;
      tabScenario.hidden = false;
    }
    if (patch.scenarioLabel) lastScenarioLabel = patch.scenarioLabel;
    render();
  };

  const setScenario = (payload: unknown, label?: string): void => {
    lastScenario = payload;
    tabScenario.hidden = false;
    if (label) lastScenarioLabel = label;
    if (activeTab !== "scenario") {
      // Keep user on current tab unless they open scenario
    }
    render();
  };

  render();

  return {
    update,
    setScenario,
    root,
    destroy: () => {
      root.innerHTML = "";
      root.classList.remove("config-inspector");
    },
  };
}

/** Call after mount or control change from demos using setupMountMode. */
export function reportDemoConfig(
  inspector: DemoConfigInspector | null | undefined,
  patch: DemoConfigUpdate,
): void {
  inspector?.update(patch);
}
