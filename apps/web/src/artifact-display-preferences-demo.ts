import "@runtypelabs/persona/widget.css";
import "./index.css";
import "./App.css";

import {
  DEFAULT_WIDGET_CONFIG,
  applyFeaturePreferencePatch,
  componentRegistry,
  createAgentExperience,
  createArtifactDisplayPreferencePatch,
  createFeaturePreferenceStore,
  resolveArtifactDisplayPreference,
  type AgentWidgetConfig,
  type AgentWidgetFeatureFlags,
  type AgentWidgetInitHandle,
  type ArtifactDisplayPreferenceTarget,
  type PersonaArtifactDisplayDescriptor,
  type PersonaArtifactDisplayMode,
  type WidgetPreferenceSlice,
} from "@runtypelabs/persona";
import {
  createDemoConfigInspector,
  reportDemoConfig,
} from "./demo-config-inspector";
import { renderDemoScaffold } from "./demo-scaffold";
import { renderInlineMount, squareInlinePanel } from "./mount-mode";

const scaffold = renderDemoScaffold({
  slug: "artifact-display-preferences",
});
const configInspector = createDemoConfigInspector({
  title: "Artifact display preferences",
  root: scaffold.inspectorSlot,
});

componentRegistry.register("DisplayPreferenceChart", (props) => {
  const values = Array.isArray(props.values)
    ? props.values.filter((value): value is number => typeof value === "number")
    : [38, 62, 48, 82];
  const root = document.createElement("div");
  root.style.cssText =
    "display:grid;gap:1rem;padding:1.1rem;color:var(--persona-text,#111827)";

  const heading = document.createElement("div");
  heading.innerHTML =
    '<strong style="display:block;font-size:.95rem">Quarterly activation</strong><span style="font-size:.75rem;color:var(--persona-muted,#64748b)">Registered UI component artifact</span>';

  const bars = document.createElement("div");
  bars.style.cssText =
    "display:flex;align-items:end;gap:.65rem;height:9rem;padding:.75rem;border:1px solid var(--persona-border,#e5e7eb);border-radius:.65rem;background:var(--persona-surface,#fff)";
  values.forEach((value, index) => {
    const column = document.createElement("div");
    column.style.cssText =
      "display:grid;grid-template-rows:1fr auto;align-items:end;gap:.35rem;flex:1;height:100%;text-align:center";
    const bar = document.createElement("div");
    bar.style.cssText = `height:${Math.max(8, Math.min(100, value))}%;border-radius:.35rem .35rem .12rem .12rem;background:var(--persona-primary,#4f46e5)`;
    const label = document.createElement("span");
    label.style.cssText =
      "font-size:.65rem;color:var(--persona-muted,#64748b)";
    label.textContent = `Q${index + 1}`;
    column.append(bar, label);
    bars.appendChild(column);
  });
  root.append(heading, bars);
  return root;
});

type PreferenceRow = {
  label: string;
  detail: string;
  target: ArtifactDisplayPreferenceTarget;
  group: "general" | "exception";
};

const PREFERENCE_ROWS: readonly PreferenceRow[] = [
  {
    label: "Generated files",
    detail:
      "One choice for every file. Setting it overrides file-type exceptions from lower layers.",
    target: { type: "files" },
    group: "general",
  },
  {
    label: "Registered UI components",
    detail: "Charts, forms, cards, and custom UI rendered by the host.",
    target: { type: "kind", kind: "component" },
    group: "general",
  },
  {
    label: "Other artifacts",
    detail: "Plain documents and anything without a narrower rule.",
    target: { type: "default" },
    group: "general",
  },
  {
    label: "HTML files",
    detail: "Configured exception for text/html.",
    target: { type: "mediaType", mediaType: "text/html" },
    group: "exception",
  },
  {
    label: "Images",
    detail: "Wildcard exception for image/*; exact types would win over it.",
    target: { type: "mediaType", mediaType: "image/*" },
    group: "exception",
  },
  {
    label: "CSV files",
    detail: "No exception: follows Generated files.",
    target: { type: "mediaType", mediaType: "text/csv" },
    group: "exception",
  },
];

const MODE_LABELS: Record<PersonaArtifactDisplayMode, string> = {
  collapsed: "Collapsed card",
  panel: "Side panel",
  inline: "In conversation",
};

const organizationPreferences: WidgetPreferenceSlice = {
  artifacts: {
    display: {
      default: "collapsed",
    },
  },
};

const surfacePreferences: WidgetPreferenceSlice = {
  artifacts: {
    display: {
      files: {
        default: "panel",
        byMediaType: {
          "text/html": "inline",
        },
      },
      byKind: {
        component: "inline",
      },
    },
    filePreview: { enabled: true },
  },
};

const baseFeatures: AgentWidgetFeatureFlags = {
  ...DEFAULT_WIDGET_CONFIG.features,
  artifacts: {
    ...DEFAULT_WIDGET_CONFIG.features?.artifacts,
    enabled: true,
    allowedTypes: ["markdown", "component"],
    layout: {
      ...DEFAULT_WIDGET_CONFIG.features?.artifacts?.layout,
      paneWidth: "42%",
      paneMaxWidth: "34rem",
      resizable: true,
    },
    filePreview: {
      ...DEFAULT_WIDGET_CONFIG.features?.artifacts?.filePreview,
      enabled: true,
    },
  },
};

let handle: AgentWidgetInitHandle;

// The store owns the parse → patch → merge → apply loop. Persist
// `preferences` from onChange and feed `features` to the widget.
const store = createFeaturePreferenceStore({
  base: baseFeatures,
  layers: [
    { id: "organization", preferences: organizationPreferences },
    { id: "surface", preferences: surfacePreferences },
  ],
  capabilities: { artifacts: true, tools: false, reasoning: false },
  onChange: ({ features, preferences }) => {
    handle.update({ features });
    syncControls();
    reportDemoConfig(configInspector, {
      config: { ...baseConfig, features },
      mode: "inline",
      scenario: {
        organizationPreferences,
        surfacePreferences,
        userPreferences: preferences,
      },
      scenarioLabel: "Preference layers",
    });
  },
});

const baseConfig: AgentWidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: "https://noop.test/dispatch",
  launcher: { enabled: false, width: "100%" },
  persistState: false,
  statusIndicator: { visible: false },
  suggestionChips: [],
  features: store.getFeatures(),
};

const stageMount = renderInlineMount(scaffold.stage);
stageMount.style.height = "100%";
handle = createAgentExperience(
  stageMount,
  squareInlinePanel(baseConfig),
) as AgentWidgetInitHandle;

const controlsRoot = document.getElementById("artifact-preference-controls");
const exceptionsRoot = document.getElementById(
  "artifact-preference-exceptions",
);
const controlRows = new Map<
  PreferenceRow,
  { select: HTMLSelectElement; source: HTMLElement }
>();

const artifactForTarget = (
  target: ArtifactDisplayPreferenceTarget,
): PersonaArtifactDisplayDescriptor => {
  switch (target.type) {
    case "kind":
      return { artifactType: target.kind };
    case "files":
      return {
        artifactType: "markdown",
        file: { path: "example.txt", mimeType: "text/plain" },
      };
    case "mediaType":
      return {
        artifactType: "markdown",
        file: {
          path: "example",
          mimeType: target.mediaType.replace("*", "svg+xml"),
        },
      };
    case "default":
      return { artifactType: "markdown" };
  }
};

/** Resolution preview for "what happens if this row is reset". */
const resolveAfterReset = (row: PreferenceRow) => {
  const resetPreferences = applyFeaturePreferencePatch(
    store.getPreferences(),
    createArtifactDisplayPreferencePatch(row.target, null),
  );
  return resolveArtifactDisplayPreference(
    baseFeatures.artifacts,
    [
      { id: "organization", preferences: organizationPreferences },
      { id: "surface", preferences: surfacePreferences },
      { id: "user", preferences: resetPreferences },
    ],
    artifactForTarget(row.target),
  );
};

const syncControls = (): void => {
  PREFERENCE_ROWS.forEach((row) => {
    const controls = controlRows.get(row);
    if (!controls) return;
    const explicit = store.getArtifactDisplay(row.target);
    const resetResolution = resolveAfterReset(row);
    const resetLabel =
      row.target.type === "mediaType" &&
      resetResolution.matchedBy.type !== "mediaType"
        ? `Follow files · ${MODE_LABELS[resetResolution.mode]}`
        : `Use default · ${MODE_LABELS[resetResolution.mode]}`;
    controls.select.options[0].textContent = resetLabel;
    controls.select.value = explicit ?? "";
    controls.source.dataset.source = explicit ? "user" : "inherited";
    controls.source.textContent = explicit ? "Customized" : "";
  });
};

PREFERENCE_ROWS.forEach((row) => {
  const wrapper = document.createElement("label");
  wrapper.className = "preference-row";

  const copy = document.createElement("span");
  copy.className = "preference-copy";
  const label = document.createElement("span");
  label.className = "preference-label";
  label.textContent = row.label;
  const detail = document.createElement("span");
  detail.className = "preference-detail";
  detail.textContent = row.detail;
  const source = document.createElement("span");
  source.className = "preference-source";
  copy.append(label, detail, source);

  const select = document.createElement("select");
  select.className = "preference-select";
  select.setAttribute("aria-label", `${row.label} display mode`);
  select.innerHTML = `
    <option value="">Use default</option>
    <option value="collapsed">Collapsed card</option>
    <option value="panel">Side panel</option>
    <option value="inline">In conversation</option>
  `;
  select.addEventListener("change", () => {
    const mode =
      select.value === ""
        ? null
        : (select.value as PersonaArtifactDisplayMode);
    store.setArtifactDisplay(row.target, mode);
  });

  wrapper.append(copy, select);
  (row.group === "exception" ? exceptionsRoot : controlsRoot)?.appendChild(
    wrapper,
  );
  controlRows.set(row, { select, source });
});

document
  .getElementById("preference-reset")
  ?.addEventListener("click", () => {
    store.reset();
  });

document
  .getElementById("preference-all-inline")
  ?.addEventListener("click", () => {
    PREFERENCE_ROWS.forEach((row) => {
      store.setArtifactDisplay(row.target, "inline");
    });
  });

handle.upsertArtifact({
  id: "qa-chart",
  artifactType: "component",
  title: "Quarterly activation",
  component: "DisplayPreferenceChart",
  props: { values: [38, 62, 48, 82] },
});

handle.upsertArtifact({
  id: "qa-readme",
  artifactType: "markdown",
  title: "README",
  content:
    "# Artifact display QA\n\nThis plain document inherits the organization-level **collapsed** default.",
});

handle.upsertArtifact({
  id: "qa-html-app",
  artifactType: "markdown",
  title: "preview/app.html",
  content: `<!doctype html>
<html>
  <body style="margin:0;font-family:system-ui;background:#eef2ff;color:#1e1b4b">
    <main style="display:grid;place-items:center;min-height:260px;padding:24px;text-align:center">
      <div>
        <div style="font-size:42px">✓</div>
        <h1 style="margin:8px 0">HTML application</h1>
        <p style="margin:0;opacity:.72">A visible HTML exception overrides the generated-file default.</p>
      </div>
    </main>
  </body>
</html>`,
  file: { path: "preview/app.html", mimeType: "text/html; charset=utf-8" },
});

handle.upsertArtifact({
  id: "qa-logo",
  artifactType: "markdown",
  title: "assets/logo.svg",
  content:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="52" fill="#4f46e5"/><text x="60" y="72" font-family="system-ui" font-size="40" fill="#fff" text-anchor="middle">P</text></svg>',
  file: { path: "assets/logo.svg", mimeType: "image/svg+xml" },
});

handle.upsertArtifact({
  id: "qa-csv-data",
  artifactType: "markdown",
  title: "exports/revenue.csv",
  content: "region,revenue\nNorth,128000\nSouth,94000\nWest,156000",
  file: { path: "exports/revenue.csv", mimeType: "text/csv" },
});

syncControls();
reportDemoConfig(configInspector, {
  config: { ...baseConfig, features: store.getFeatures() },
  mode: "inline",
  scenario: {
    organizationPreferences,
    surfacePreferences,
    userPreferences: store.getPreferences(),
  },
  scenarioLabel: "Preference layers",
});
