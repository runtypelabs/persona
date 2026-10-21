import { registerDemoPageLifecycle } from "./demo-page-lifecycle";
import "@runtypelabs/persona/widget.css";
import "./embedded-host.css";
import { initAgentWidget, createStaticMentionSource, registerIcons, type AgentWidgetConfig } from "@runtypelabs/persona";
import { createDemoHistoryProvider } from "@runtypelabs/persona/internal/demo-history-provider";
import { renderExamplesShell } from "./examples-nav";
import { bindControlsToggle } from "./controls-toggle";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import { createDemoDurableChat } from "./demo-durable-chat";

registerIcons({ "host-concise": [["path", { d: "M4 9h16M4 15h10" }]] });
renderExamplesShell();
bindControlsToggle(document.querySelector<HTMLButtonElement>("#host-controls-toggle")!);
type Handle = ReturnType<typeof initAgentWidget>;
type Name = "research" | "support";
const names: Name[] = ["research", "support"];
const labels: Record<Name, string> = { research: "Research", support: "Support" };
const widgets = new Map<Name, Handle>();
const historyProviders = new Map<Name, ReturnType<typeof createDemoHistoryProvider>>();
const durableChats = new Map<Name, ReturnType<typeof createDemoDurableChat>>();
const executionStates = new Map<string, string>();
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
const conversationSelect = document.querySelector<HTMLSelectElement>("#host-conversation")!;
const busySelect = document.querySelector<HTMLSelectElement>("#host-busy")!;
const loaderSelect = document.querySelector<HTMLSelectElement>("#host-loader")!;
const historyDelaySelect = document.querySelector<HTMLSelectElement>("#host-history-delay")!;
const loaders = new Map<Name, "spinner" | "skeleton">();
const historyDelays = new Map<Name, number>();
const failNextOpen = document.querySelector<HTMLInputElement>("#host-fail-open")!;
const conversationTitles = { brief: "Project brief", notes: "Release notes" } as const;
function syncConversationSelect(name: Name) {
  const id = widgets.get(name)?.getActiveConversationId();
  conversationSelect.value = id?.startsWith(`host-${name}-`) ? id.slice(`host-${name}-`.length) : "";
}
function localHistory(name: Name) {
  const historyNow = Date.now();
  const conversations = Object.entries(conversationTitles).map(([key, title]) => ({
    id: `host-${name}-${key}`,
    title,
    messages: Array.from({ length: 24 }, (_, index) => ({
      id: `host-${name}-${key}-${index}`,
      createdAt: new Date(historyNow - (24 - index) * 60_000).toISOString(),
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: index % 2 === 0
        ? `${title} · question ${Math.floor(index / 2) + 1}: What should we review next?`
        : `${title} · note ${Math.floor(index / 2) + 1}: ${key === "brief" ? "Review the audience, goals, and constraints before choosing the next experiment." : "Review shipped changes, open questions, and follow-up tasks before publishing."} This is local sample history for ${name}.`,
    })),
  }));
  const provider = createDemoHistoryProvider({ conversations, pageSize: 100, latencyMs: historyDelays.get(name) ?? 200 });
  const savedIds = new Map(conversations.map(conversation => [conversation.id, new Set(conversation.messages.map(message => message.id))]));
  // The demo provider is read-only history by default. Persist completed local
  // echo runs here so reopening also shows replies sent during this page visit.
  const saveRun = (widget: Handle) => {
    const id = widget.getActiveConversationId();
    if (!id) return;
    const ids = savedIds.get(id);
    if (!ids) return;
    for (const message of widget.getMessages()) {
      if (message.streaming || message.agentMetadata?.executionId?.startsWith("local-durable-")) continue;
      if (ids.has(message.id)) continue;
      provider.appendMessage(id, { id: message.id, role: message.role, content: message.content, createdAt: message.createdAt, contentParts: message.contentParts });
      ids.add(message.id);
    }
  };
  const saveResult = (run: { conversationId: string; textId: string; text: string }) => {
    const ids = savedIds.get(run.conversationId);
    if (!ids || ids.has(run.textId) || !provider.getConversationIds().includes(run.conversationId)) return;
    provider.appendMessage(run.conversationId, { id: run.textId, role: "assistant", content: run.text });
    ids.add(run.textId);
  };
  return { provider, saveRun, saveResult };
}
const defaults = document.querySelector<HTMLSelectElement>("#host-defaults")!;
const status = document.querySelector<HTMLElement>("#host-status")!;
const log = document.querySelector<HTMLElement>("#host-log")!;
const lines: string[] = [];
const modal = document.querySelector<HTMLDialogElement>("#host-modal")!;
let modalOwner: Name | null = null;
function returnToPage() {
  if (!modalOwner) return;
  const name = modalOwner;
  // Capture transcript geometry while the dialog is still visible. Closing
  // first removes its layout and resets scrollTop before moveTo can snapshot it.
  widgets.get(name)?.moveTo(document.getElementById(name)!, { preserveFocus: false });
  // Skip widget focus restoration while the page is inert; closing the
  // host dialog now restores its opener and makes the page interactive.
  modal.close();
  modalOwner = null;
  record(name, "returned to page · same live widget");
  status.textContent = `${labels[name]} is back in place, with its conversation and draft intact.`;
}
modal.addEventListener("cancel", (event) => { event.preventDefault(); returnToPage(); });
document.getElementById("host-return")!.addEventListener("click", returnToPage);
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
      modes: [{ id: "concise", label: "Concise", shortLabel: "Concise", presentation: "bar", iconName: "host-concise", placeholder: "Ask for a short answer…" }],
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
  returnToPage();
  widgets.forEach(widget => widget.destroy());
  widgets.clear();
  durableChats.forEach(chat => chat.destroy());
  durableChats.clear();
  executionStates.clear();
  document.getElementById("host-executions")!.textContent = "No background tasks.";
  historyProviders.clear();
  for (const name of names) {
    scenarios.set(name, scenarioSelect.value as Scenario);
    if (!layouts.has(name)) layouts.set(name, "stacked");
    contextVisible.set(name, true);
    revision.set(name, 1);
    const history = localHistory(name);
    historyProviders.set(name, history.provider);
    const durable = createDemoDurableChat({ getConversationId: () => widgets.get(name)?.getActiveConversationId() ?? null, onComplete: history.saveResult });
    durableChats.set(name, durable);
    const echo = createDemoEchoFetch({ reply: () => `This reply belongs to ${name}. The other assistant keeps its own messages and component state.` });
    const widget = initAgentWidget({
      target: document.getElementById(name)!,
      config: {
        apiUrl: "/host-local-demo",
        customFetch: (url, init, payload) => {
          const active = widgets.get(name);
          if (!active?.getActiveConversationId()) return echo(url, init, payload);
          history.saveRun(active);
          return durable.customFetch(url, init, payload);
        },
        backgroundConversations: {
          capabilities: { durableExecution: true, readOnlyReplay: true },
          reconnectStream: durable.reconnectStream,
          subscribeStatus: durable.subscribeStatus,
        },
        future: { v5Defaults: defaults.value === "v5" },
        colorScheme: schemes.get(name) ?? "light",
        loadingIndicator: { conversationOpenVariant: loaders.get(name) ?? "spinner" },
        persistState: false,
        features: { history: { enabled: true, provider: history.provider } },
        launcher: { enabled: false },
        layout: { embedded: true, slots: slots(name) },
        welcome: { variant: "none" },
        suggestions: { starters: { items: [] } },
        ...composerScenario(name),
        attachments: { enabled: true, allowedTypes: ["text/plain", "image/png"], maxFiles: 2 },
        messageActions: { enabled: true, showQuote: true, visibility: "always" },
        onLinkClick: ({ url, preventDefault }) => {
          preventDefault();
          status.textContent = `${labels[name]} requested ${url}. Your code handled this link.`;
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
    const syncNavigation = () => { if (target.value === name) syncConversationSelect(name); };
    widget.on("history:conversationOpened", syncNavigation);
    widget.on("history:conversationStarted", syncNavigation);
    widget.on("history:conversationDeleted", syncNavigation);
    widget.on("history:cleared", syncNavigation);
    widget.on("conversation:executionState", (event) => {
      const key = event.conversationId.slice(`host-${name}-`.length) as keyof typeof conversationTitles;
      const title = conversationTitles[key] ?? event.conversationId;
      executionStates.set(`${name}:${event.conversationId}`, `${labels[name]} · ${title}: ${event.status}${event.detached ? " · background" : ""}`);
      document.getElementById("host-executions")!.textContent = [...executionStates.values()].join(" · ");
      record(name, `${title}: ${event.status}${event.detached ? " (background)" : ""}`);
    });
    widget.on("run:finished", (run, context) => {
      history.saveRun(widget);
      record(context.instanceId, `run finished: ${run.outcome}`);
    });
    widget.injectAssistantMessage({ content: `This is the ${name} assistant. [Open workspace](/workspace/${name}) or try the host controls.` });
    widget.injectComponentDirective({ id: "host-card", component: "HostCard", props: { count: 1 } });
    record(widget.instanceId, "ready");
  }
  syncConversationSelect(target.value as Name);
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
  returnToPage();
  modal.dataset.scheme = schemes.get(name) ?? "light";
  document.getElementById("host-modal-title")!.textContent = `${labels[name]} in modal`;
  modal.showModal();
  widget.moveTo("#host-modal-mount");
  modalOwner = name;
  widget.focusInput();
  record(name, "moved to modal · same live widget");
  status.textContent = `${labels[name]} moved to the modal. Press Escape to return.`;
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
conversationSelect.addEventListener("change", async () => {
  const name = target.value as Name;
  const widget = widgets.get(name);
  const key = conversationSelect.value as keyof typeof conversationTitles;
  if (!widget || !(key in conversationTitles)) return;
  if (failNextOpen.checked) {
    historyProviders.get(name)?.failNext("getPage", { code: "unavailable" });
    failNextOpen.checked = false;
  }
  conversationSelect.disabled = true;
  status.textContent = `Opening ${conversationTitles[key]} for ${labels[name]}…`;
  try {
    await widget.openConversation(`host-${name}-${key}`, { busy: busySelect.value === "background" ? "background" : busySelect.value === "stop" ? "stop" : "reject" });
    if (widgets.get(name) !== widget) return;
    record(name, `opened ${conversationTitles[key]} · same widget`);
    status.textContent = `${labels[name]}: ${conversationTitles[key]} opened.`;
  } catch (error) {
    if (widgets.get(name) !== widget) return;
    const busy = error && typeof error === "object" && "code" in error && error.code === "conversation_busy";
    status.textContent = busy
      ? `${labels[name]} is busy. Choose Continue in background to keep a durable task running, or Stop current run, then select the conversation again.`
      : `Could not open ${conversationTitles[key]}. The current conversation is still available.`;
    record(name, busy ? "conversation switch rejected: busy" : "conversation switch failed");
  } finally {
    conversationSelect.disabled = false;
    syncConversationSelect(target.value as Name);
  }
});
loaderSelect.addEventListener("change", () => {
  const name = target.value as Name;
  const variant = loaderSelect.value === "skeleton" ? "skeleton" : "spinner";
  loaders.set(name, variant);
  widgets.get(name)?.update({ loadingIndicator: { conversationOpenVariant: variant } });
});
historyDelaySelect.addEventListener("change", () => {
  const name = target.value as Name;
  const delay = Number(historyDelaySelect.value);
  historyDelays.set(name, delay);
  historyProviders.get(name)?.setLatency(delay);
});
target.addEventListener("change", () => {
  const name = target.value as Name;
  scenarioSelect.value = scenarios.get(name) ?? "reference";
  layoutSelect.value = layouts.get(name) ?? "stacked";
  widthSelect.value = widths.get(name) ?? "full";
  schemeSelect.value = schemes.get(name) ?? "light";
  loaderSelect.value = loaders.get(name) ?? "spinner";
  historyDelaySelect.value = String(historyDelays.get(name) ?? 200);
  syncConversationSelect(name);
});
defaults.addEventListener("change", mount);
registerDemoPageLifecycle({
  suspend: () => durableChats.forEach(chat => chat.pause()),
  resume: () => durableChats.forEach(chat => chat.resume()),
  destroy: () => { widgets.forEach(widget => widget.destroy()); widgets.clear(); durableChats.forEach(chat => chat.destroy()); durableChats.clear(); },
});
mount();
