import "@runtypelabs/persona/widget.css";
import "./style-migration.css";
import { initAgentWidget, type AgentWidgetConfig, type AgentWidgetConfigPatch, type AgentWidgetMessage } from "@runtypelabs/persona";
import { mergeWithDefaults } from "../../../packages/widget/src/defaults";
import { applyThemeVariables } from "../../../packages/widget/src/utils/theme";
import { createCloseButton, createClearChatButton } from "../../../packages/widget/src/components/header-parts";
import { createSendButton, createMicButton, applyMicButtonStyle, type MicControlState } from "../../../packages/widget/src/components/composer-parts";
import { createToolBubble } from "../../../packages/widget/src/components/tool-bubble";
import { createApprovalBubble } from "../../../packages/widget/src/components/approval-bubble";
import { buildWelcomeHost, applyWelcomeConfig } from "../../../packages/widget/src/components/welcome";
import { resolveWelcomeConfig } from "../../../packages/widget/src/welcome";
import { renderExamplesShell } from "./examples-nav";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import { legacyOverrides, themeOverrides, migrateOverrides, resetStyleOverrides, welcome, suggestions, type SampleScheme } from "./style-migration-config";

renderExamplesShell("style-migration");
const select = (id: string) => document.querySelector<HTMLSelectElement>(`#${id}`)!;
const scheme = () => select("scheme").value as SampleScheme;
const page = document.querySelector<HTMLElement>(".migration-page")!;
const status = document.querySelector<HTMLElement>("#live-status")!;
let custom = true;
let liveMode: "legacy" | "layered" | "migrated" | "reset" = "legacy";
const tool: AgentWidgetMessage = {
  id: "tool", role: "assistant", content: "", createdAt: new Date(0).toISOString(), variant: "tool",
  toolCall: { id: "lookup", name: "Search project", status: "complete", args: { query: "Release notes" }, result: "Found three matching documents." },
};
const approval: AgentWidgetMessage = {
  id: "approval", role: "assistant", content: "", createdAt: new Date(0).toISOString(), variant: "approval",
  approval: { id: "approve", status: "pending", agentId: "local", executionId: "local", description: "A local approval example.", toolName: "Review required", reason: "Continue with this local demonstration?" },
};

function showCode(target: string, config: AgentWidgetConfigPatch) {
  // JSON would drop own-undefined resets. Preserve them in the displayed JS.
  const encoded = JSON.stringify(config, (_key, value) => value === undefined ? "__PERSONA_UNDEFINED__" : value, 2);
  document.querySelector(`#${target}`)!.textContent = encoded.replace(/"__PERSONA_UNDEFINED__"/g, "undefined");
}
function renderComparisons() {
  const samples = document.querySelector<HTMLDivElement>("#samples")!;
  samples.replaceChildren();
  for (const [kind, title] of [["default", "Unconfigured baseline"], ["legacy", "Legacy · compatibility fixture"], ["theme", "Component theme · equivalent"]]) {
    const override: AgentWidgetConfig = !custom ? {} : kind === "legacy" ? legacyOverrides(scheme()) : kind === "theme" ? { ...themeOverrides(), welcome, suggestions } : {};
    const config = mergeWithDefaults({
      ...override, future: { v5Defaults: select("defaults").value === "v5" }, colorScheme: scheme(),
      sendButton: { ...override.sendButton, useIcon: true }, voiceRecognition: { ...override.voiceRecognition, enabled: true },
    });
    const sample = document.createElement("section");
    sample.className = "migration-sample";
    sample.dataset.variant = kind;
    sample.setAttribute("data-persona-root", "");
    sample.setAttribute("data-persona-defaults", select("defaults").value);
    applyThemeVariables(sample, config);
    const heading = document.createElement("h2");
    heading.textContent = title;
    sample.append(heading);
    const label = (text: string) => { const h = document.createElement("h3"); h.textContent = text; sample.append(h); };
    label("Welcome");
    const welcomeHost = buildWelcomeHost(config, document.createElement("div"));
    applyWelcomeConfig(welcomeHost, resolveWelcomeConfig(config));
    sample.append(welcomeHost.host);
    label("Independent controls");
    const controls = document.createElement("div");
    controls.className = "migration-controls";
    const mic = createMicButton(config);
    controls.append(createCloseButton(config).button, createClearChatButton(config).button, createSendButton(config).button);
    if (mic) {
      applyMicButtonStyle(mic.button, config, select("voice").value as MicControlState);
      controls.append(mic.button);
    } else {
      const note = document.createElement("span");
      note.textContent = "Browser dictation is unavailable here.";
      controls.append(note);
    }
    sample.append(controls);
    label("Tool details");
    const card = createToolBubble(tool, config, new Set([tool.id]));
    card.dataset.demoTool = "";
    sample.append(card);
    label("Approval");
    sample.append(createApprovalBubble(approval, config));
    samples.append(sample);
  }
  showCode("legacy-code", legacyOverrides(scheme()));
  showCode("theme-code", { ...themeOverrides(), welcome, suggestions });
}

const widget = initAgentWidget({
  target: document.querySelector<HTMLElement>("#live-host")!,
  config: {
    ...legacyOverrides(scheme()),
    apiUrl: "/style-migration-local",
    persistState: false,
    customFetch: createDemoEchoFetch({ delayMs: 5, reply: () => "This is a local reply. Update the styles or switch themes: the conversation and draft stay in this widget." }),
    future: { v5Defaults: select("defaults").value === "v5" }, colorScheme: scheme(),
    launcher: { ...legacyOverrides(scheme()).launcher, enabled: false, fullHeight: true, width: "100%", title: "Live migration", subtitle: "Local examples · same widget" },
    copy: { ...legacyOverrides(scheme()).copy, inputPlaceholder: "Type a draft, then migrate the styles…" },
    approval: { ...legacyOverrides(scheme()).approval, onDecision: async () => new Response(null, { status: 204 }) },
    features: {
      ...legacyOverrides(scheme()).features,
      askUserQuestion: { ...legacyOverrides(scheme()).features?.askUserQuestion, layout: "pills" },
      artifacts: { ...legacyOverrides(scheme()).features?.artifacts, enabled: true, display: "collapsed", allowedTypes: ["markdown"] },
      toolCallDisplay: { autoExpand: true, grouped: false },
    },
  },
});
function updateLive(patch: AgentWidgetConfigPatch, message: string) {
  widget.update(patch);
  showCode("live-code", patch);
  status.textContent = message;
}
function applyMode(mode: typeof liveMode) {
  liveMode = mode;
  if (mode === "legacy") {
    updateLive({ ...resetStyleOverrides(), ...legacyOverrides(scheme()) }, "Legacy fixture applied. Explicit aliases control the appearance.");
  } else if (mode === "layered") {
    updateLive({ ...legacyOverrides(scheme()), ...themeOverrides() }, "Theme added behind the legacy fixture. The explicit aliases still win.");
  } else if (mode === "migrated") {
    updateLive(migrateOverrides(), "Migrated in one update: own-undefined resets clear the aliases and expose equivalent component theme values.");
  } else {
    updateLive(resetStyleOverrides(), "Style overrides cleared. The modern welcome and starter content remain; controls, questions and artifact chrome follow the current defaults.");
  }
}

let sequence = 0;
let replayCount = 0;
function inject(message: Partial<AgentWidgetMessage>) {
  widget.injectTestMessage({ type: "message", message: {
    role: "assistant", content: "", ...message,
    // Approval resolution upserts the canonical approval-{id} message. Static
    // comparison timestamps must not move local scene items before the request.
    id: message.approval ? `approval-${message.approval.id}` : message.id ?? `sample-${sequence}`,
    createdAt: new Date(Date.now() - 60000 + sequence * 100).toISOString(), sequence: sequence++,
  } });
}
function replayScene() {
  widget.clearChat();
  widget.clearArtifacts();
  sequence = 0;
  replayCount += 1;
  const scene = select("scene").value;
  if (scene !== "welcome") inject({ role: "user", content: `Show the local ${scene} sample.` });
  if (scene === "tools") {
    inject(tool);
    inject({ ...approval, approval: { ...approval.approval!, id: `approve-${replayCount}` } });
  } else if (scene === "question") {
    inject({ variant: "tool", toolCall: {
      id: "question-local", name: "ask_user_question", status: "complete", args: { questions: [
        { question: "Which appearance would you like to review?", options: [{ label: "Light theme" }, { label: "Dark theme" }, { label: "Narrow layout" }] },
      ] },
    }, agentMetadata: { executionId: "local", awaitingLocalTool: true } });
  } else if (scene === "artifact") {
    const markdown = "# Migration checklist\n\n- Compare equivalent controls and text.\n- Check light and dark.\n- Test at a narrow width.\n- Clear legacy aliases with own `undefined`.\n- Keep callbacks and behavior in config.";
    widget.upsertArtifact({ id: "migration-checklist", title: "Migration checklist", artifactType: "markdown", content: markdown, transcript: false });
    inject({ rawContent: JSON.stringify({ component: "PersonaArtifactCard", props: { artifactId: "migration-checklist", title: "Migration checklist", artifactType: "markdown", status: "complete", markdown } }) });
    widget.selectArtifact("migration-checklist");
    widget.showArtifacts();
  }
  status.textContent = `${select("scene").selectedOptions[0].textContent} loaded. Style, theme and width controls keep this widget mounted. Replay clears only the sample transcript and artifacts.`;
}

for (const [id, mode] of [["live-legacy", "legacy"], ["live-layer", "layered"], ["live-migrate", "migrated"], ["live-reset", "reset"]] as const) {
  document.querySelector(`#${id}`)!.addEventListener("click", () => applyMode(mode));
}
for (const id of ["defaults", "scheme"]) select(id).addEventListener("change", () => {
  renderComparisons();
  const patch: AgentWidgetConfigPatch = { future: { v5Defaults: select("defaults").value === "v5" }, colorScheme: scheme(), ...((liveMode === "legacy" || liveMode === "layered") ? legacyOverrides(scheme()) : {}) };
  updateLive(patch, `${select("defaults").selectedOptions[0].textContent} · ${scheme()} applied to the existing widget. Current style mode: ${liveMode}.`);
});
select("voice").addEventListener("change", renderComparisons);
select("width").addEventListener("change", () => { page.dataset.width = select("width").value; });
select("scene").addEventListener("change", replayScene);
document.querySelector("#replay")!.addEventListener("click", replayScene);
document.querySelector<HTMLButtonElement>("#reset")!.addEventListener("click", event => {
  custom = !custom;
  (event.currentTarget as HTMLButtonElement).textContent = custom ? "Clear comparison styles" : "Restore comparison styles";
  renderComparisons();
});
window.addEventListener("pagehide", () => widget.destroy(), { once: true });
renderComparisons();
showCode("live-code", legacyOverrides(scheme()));
status.textContent = "Legacy fixture mounted. Type a draft, then add theme values, migrate the aliases, or reset the styles.";
