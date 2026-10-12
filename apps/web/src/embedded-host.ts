import "@runtypelabs/persona/widget.css";
import "./embedded-host.css";
import { initAgentWidget, createStaticMentionSource, type AgentWidgetConfig } from "@runtypelabs/persona";
import { renderExamplesShell } from "./examples-nav";
import { createDemoEchoFetch } from "./demo-echo-fetch";

renderExamplesShell();
type Handle = ReturnType<typeof initAgentWidget>;
type Name = "research" | "support";
const names: Name[] = ["research", "support"];
const widgets = new Map<Name, Handle>();
type Scenario = "reference" | "basic" | "chips" | "inline" | "crowded" | "responsive";
const layouts = new Map<Name, "stacked" | "single-row">();
const layoutSelect = document.querySelector<HTMLSelectElement>("#host-layout")!;
const schemes = new Map<Name, "light" | "dark">();
const schemeSelect = document.querySelector<HTMLSelectElement>("#host-scheme")!;
const widths = new Map<Name, "full" | "narrow">();
const widthSelect = document.querySelector<HTMLSelectElement>("#host-width")!;
const scenarios = new Map<Name, Scenario>();
const scenarioSelect = document.querySelector<HTMLSelectElement>("#host-scenario")!;
const contextVisible = new Map<Name, boolean>();
const revision = new Map<Name, number>();
const target = document.querySelector<HTMLSelectElement>("#host-target")!;
const defaults = document.querySelector<HTMLSelectElement>("#host-defaults")!;
const status = document.querySelector<HTMLElement>("#host-status")!;
const log = document.querySelector<HTMLElement>("#host-log")!;
const lines: string[] = [];
const modal = document.querySelector<HTMLDialogElement>("#host-modal")!;
let modalOwner: Name | null = null;
function returnToSidebar() {
  if (!modalOwner) return;
  const name = modalOwner;
  // Capture transcript geometry while the dialog is still visible. Closing
  // first removes its layout and resets scrollTop before moveTo can snapshot it.
  widgets.get(name)?.moveTo(document.getElementById(name)!, { preserveFocus: false });
  // Skip widget focus restoration while the sidebar is inert; closing the
  // host dialog now restores its opener and makes the sidebar interactive.
  modal.close();
  modalOwner = null;
  record(name, "moved back to sidebar · same live widget");
  status.textContent = `${name} returned to the sidebar with its live conversation and composer state.`;
}
modal.addEventListener("cancel", (event) => { event.preventDefault(); returnToSidebar(); });
document.getElementById("host-return")!.addEventListener("click", returnToSidebar);
function record(instance: string, detail: string) {
  lines.push(`${instance} · ${detail}`);
  if (lines.length > 80) lines.shift();
  log.textContent = lines.join("\n");
  log.scrollTop = log.scrollHeight;
}
function composerScenario(name: Name): Pick<AgentWidgetConfig, "composer" | "contextMentions"> {
  const scenario = scenarios.get(name) ?? "reference";
  const crowded = scenario === "crowded";
  const responsive = scenario === "responsive";
  const reference = scenario === "reference";
  const mentions = responsive || reference || scenario === "chips" || scenario === "inline";
  return {
    composer: {
      placement: "block",
      layout: layouts.get(name) ?? "stacked",
      ...(defaults.value === "v4" ? { layout: "stacked" as const } : {}),
      ...(defaults.value === "v4-single" ? { layout: "single-row" as const } : {}),
      modes: [{ id: "concise", label: "Concise", shortLabel: "Concise", presentation: "bar", iconName: "sparkles", placeholder: "Ask for a short answer…" }],
      actionOverflow: { enabled: reference || responsive, collapseAutoActions: responsive ? "fit" : undefined, includeBuiltIns: reference || responsive ? ["attachments", "mentions"] : [], order: 0 },
      actions: responsive ? [
        { label: "Summarize", iconName: "file-text", prompt: "Summarize the key points." },
        { label: "Compare", iconName: "columns-2", prompt: "Compare the alternatives." },
        { label: "Next steps", iconName: "list-check", prompt: "Suggest practical next steps." },
      ].map(({ label, iconName, prompt }, index) => ({ id: `responsive-${index}`, label, shortLabel: label, iconName, placement: "start" as const, presentation: "auto" as const, order: 300 + index, onSelect: ({ setValue }) => { setValue(prompt); record(name, `${label} draft requested`); } })) : reference ? [{ id: "summary", placement: "start", label: "Summarize this conversation", iconName: "file-text", presentation: "overflow", onSelect: ({ setValue }) => { setValue("Summarize the key points from this conversation."); record(name, "summary draft requested"); } }] : crowded ? ["Explain the selected context in detail", "Compare with the previous answer"].map((label, index) => ({
        id: `host-action-${index}`, label, shortLabel: label, presentation: "bar" as const, placement: "start" as const,
        onSelect: ({ setValue }) => { setValue(label); record(name, `draft action: ${label}`); },
      })) : [],
      models: crowded ? [{ id: "local", label: "Local sample model with a long descriptive name" }] : [],
      selectedModelId: crowded ? "local" : undefined,
    },
    contextMentions: {
      enabled: mentions,
      display: scenario === "inline" ? "inline" : "chip",
      sources: mentions ? [createStaticMentionSource({
        id: "workspace", label: "Sample workspace",
        items: [{ id: "brief", label: "Project brief", description: "Local sample document", iconName: "file-text" }, { id: "notes", label: "Meeting notes with a deliberately long title", iconName: "notebook" }],
        resolve: (item) => ({ llmAppend: `${name} sample context: ${item.label}. Everything resolves locally.` }),
      })] : [],
    },
  };
}
function slots(name: Name): NonNullable<NonNullable<AgentWidgetConfig["layout"]>["slots"]> {
  return { "composer-before-send": () => {
    if (scenarios.get(name) !== "crowded") return null;
    const element = document.createElement("div");
    element.className = "host-composer-slot";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Context note";
    input.setAttribute("aria-label", `${name} context note`);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Pin workspace note";
    let clicks = 0;
    const save = () => { clicks += 1; button.textContent = `Pinned locally ${clicks}`; record(name, "composer slot clicked"); };
    button.addEventListener("click", save);
    element.append(input, button);
    return { element, destroy: () => { button.removeEventListener("click", save); record(name, "composer slot released"); } };
  }, "transcript-top": () => {
    if (!contextVisible.get(name)) return null;
    const element = document.createElement("p");
    element.className = "host-context";
    element.textContent = `${name === "research" ? "Research workspace" : "Support workspace"} · local sample context`;
    return { element, destroy: () => record(name, "context slot released") };
  } };
}
function mount() {
  returnToSidebar();
  widgets.forEach(widget => widget.destroy());
  widgets.clear();
  for (const name of names) {
    scenarios.set(name, scenarioSelect.value as Scenario);
    if (!layouts.has(name)) layouts.set(name, "stacked");
    contextVisible.set(name, true);
    revision.set(name, 1);
    const widget = initAgentWidget({
      target: document.getElementById(name)!,
      config: {
        apiUrl: "/host-local-demo",
        customFetch: createDemoEchoFetch({ reply: () => `This reply belongs to ${name}. The other assistant keeps its own messages and component state.` }),
        future: { v5Defaults: defaults.value === "v5" },
        colorScheme: schemes.get(name) ?? "light",
        persistState: false,
        launcher: { enabled: false },
        layout: { embedded: true, slots: slots(name) },
        welcome: { variant: "none" },
        suggestions: { starters: { items: [] } },
        ...composerScenario(name),
        attachments: { enabled: true, allowedTypes: ["text/plain", "image/png"], maxFiles: 2 },
        messageActions: { enabled: true, showQuote: true, visibility: "always" },
        onLinkClick: ({ url, preventDefault }) => {
          preventDefault();
          status.textContent = `${name} requested ${url}. The host handled this link.`;
          record(name, "link handled by host");
        },
        components: {
          HostCard: (props, context) => {
            const element = document.createElement("section");
            element.className = "host-card";
            element.dataset.owner = name;
            const heading = document.createElement("strong");
            heading.textContent = `${name === "research" ? "Research" : "Support"} card`;
            const value = document.createElement("p");
            const increment = document.createElement("button");
            increment.type = "button";
            increment.textContent = "Increment locally";
            let count = Number(props.count ?? 1);
            const paint = () => { value.textContent = `Revision ${count} · owned by ${name}`; };
            paint();
            increment.addEventListener("click", () => context.updateProps({ count: count + 1 }), { signal: context.signal });
            element.append(heading, value, increment);
            record(name, "card mounted");
            return {
              element,
              update(next) { count = Number(next.count ?? 1); revision.set(name, count); paint(); record(name, "card updated in place"); },
              destroy() { record(name, "card released"); },
            };
          },
        },
      },
    });
    widgets.set(name, widget);
    widget.on("messages:changed", (messages, context) => record(context.instanceId, `${messages.length} messages`));
    widget.on("run:started", (_run, context) => record(context.instanceId, "run started"));
    widget.on("run:finished", (run, context) => record(context.instanceId, `run finished: ${run.outcome}`));
    widget.injectAssistantMessage({ content: `This is the ${name} assistant. [Open workspace](/workspace/${name}) or try the host controls above.` });
    widget.injectComponentDirective({ id: "host-card", component: "HostCard", props: { count: 1 } });
    record(widget.instanceId, "ready");
  }
}
function action(id: string, run: (widget: Handle, name: Name) => void) {
  document.getElementById(id)!.addEventListener("click", () => {
    const name = target.value as Name;
    const widget = widgets.get(name);
    if (widget) run(widget, name);
  });
}
action("host-run", (widget) => { widget.submitMessage("Show me an independent local reply."); });
action("host-move", (widget, name) => {
  returnToSidebar();
  modal.dataset.scheme = schemes.get(name) ?? "light";
  document.getElementById("host-modal-title")!.textContent = `${name === "research" ? "Research" : "Support"} in modal`;
  modal.showModal();
  widget.moveTo("#host-modal-mount");
  modalOwner = name;
  widget.focusInput();
  record(name, "moved to modal · same live widget");
  status.textContent = `${name} moved with its draft, messages, and card state. Return to the sidebar or press Escape.`;
});
action("host-mode", (widget) => {
  widget.setComposerModes(widget.getComposerState().activeModeIds.includes("concise") ? [] : ["concise"]);
});
action("host-card", (widget, name) => {
  revision.set(name, 1);
  widget.injectComponentDirective({ id: "host-card", component: "HostCard", props: { count: 1 } });
});
action("host-update", (widget, name) => {
  const next = (revision.get(name) ?? 1) + 1;
  revision.set(name, next);
  if (!widget.updateComponentProps("host-card", { count: next })) status.textContent = "Add a card first.";
});
action("host-remove", (widget) => { widget.removeComponentMessage("host-card"); });
action("host-clear", (widget) => { widget.clearChat(); });
action("host-slot", (widget, name) => {
  contextVisible.set(name, !contextVisible.get(name));
  widget.update({ layout: { slots: slots(name) } });
});
scenarioSelect.addEventListener("change", () => {
  const name = target.value as Name;
  scenarios.set(name, scenarioSelect.value as Scenario);
  widgets.get(name)?.update({ ...composerScenario(name), layout: { slots: slots(name) } });
  record(name, `composer scenario: ${scenarioSelect.value}`);
});
widthSelect.addEventListener("change", () => {
  const name = target.value as Name;
  const width = widthSelect.value === "narrow" ? "narrow" : "full";
  widths.set(name, width);
  document.getElementById(name)!.closest<HTMLElement>(".host-pane")!.style.maxWidth = width === "narrow" ? "380px" : "none";
  record(name, `host width: ${width}`);
});
layoutSelect.addEventListener("change", () => {
  const name = target.value as Name;
  layouts.set(name, layoutSelect.value === "single-row" ? "single-row" : "stacked");
  widgets.get(name)?.update(composerScenario(name));
  record(name, `composer layout: ${layoutSelect.value}`);
});
schemeSelect.addEventListener("change", () => {
  const name = target.value as Name;
  const colorScheme = schemeSelect.value === "dark" ? "dark" : "light";
  schemes.set(name, colorScheme);
  document.getElementById(name)!.closest<HTMLElement>(".host-pane")!.dataset.scheme = colorScheme;
  widgets.get(name)?.update({ colorScheme });
  record(name, `color scheme: ${colorScheme}`);
});
target.addEventListener("change", () => {
  const name = target.value as Name;
  scenarioSelect.value = scenarios.get(name) ?? "reference";
  layoutSelect.value = layouts.get(name) ?? "stacked";
  widthSelect.value = widths.get(name) ?? "full";
  schemeSelect.value = schemes.get(name) ?? "light";
});
defaults.addEventListener("change", mount);
window.addEventListener("pagehide", () => { widgets.forEach(widget => widget.destroy()); widgets.clear(); });
mount();
