import { initAgentWidget, markdownPostprocessor, type AgentWidgetInitHandle } from "@runtypelabs/persona";
import "@runtypelabs/persona/widget.css";
import "../styles.css";
import { tickets } from "../shared/tickets";
import { renderToolRow } from "./tool-summary";
import { mountCustomerTranscript } from "./customer-transcript";

const root = document.querySelector<HTMLDivElement>("#app")!;
type Mode = "preview" | "live";
type Filter = "all" | "open" | "waiting";
let selected = tickets[0];
let mode: Mode = "preview";
let filter: Filter = "all";
let query = "";
let liveAvailable = false;
let conversationId = crypto.randomUUID();
let assistant: AgentWidgetInitHandle | undefined;
let stopAssistantListeners = () => {};
let customerTranscript: ReturnType<typeof mountCustomerTranscript> | undefined;
const assistantPreferenceKey = "relay:assistant-open";

function initiallyOpenAssistant() {
  if (!window.matchMedia("(min-width: 1280px)").matches) return false;
  try { return localStorage.getItem(assistantPreferenceKey) !== "false"; }
  catch { return true; }
}
function syncAssistantButton(open: boolean) {
  root.querySelector("#ask-assistant")?.setAttribute("aria-expanded", String(open));
}
function rememberAssistant(open: boolean) {
  syncAssistantButton(open);
  try { localStorage.setItem(assistantPreferenceKey, String(open)); }
  catch { /* The assistant still works when browser storage is unavailable. */ }
}

const icons = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>',
};
function icon(name: keyof typeof icons) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`; }
function escape(value: string) { return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
function initials(name: string) { return name.split(" ").map(part => part[0]).slice(0, 2).join(""); }

root.innerHTML = `
  <header class="app-header">
    <a class="brand" href="/" aria-label="Relay support home"><span class="brand-symbol">r</span>relay</a>
    <div class="header-right"><span class="sample-badge">Sample data</span><div class="mode-switch" aria-label="Assistant connection mode"><button data-mode="preview" aria-pressed="true">Preview</button><button data-mode="live" aria-pressed="false" disabled title="Configure a provider to enable Live">Live</button></div></div>
  </header>
  <div class="app-stage">
    <div class="dock-boundary">
      <main id="support-workspace" class="support-workspace">
        <aside class="inbox" aria-label="Support conversations">
          <div class="inbox-heading"><h1>Inbox <span>${tickets.length}</span></h1></div>
          <label class="search-box">${icon("search")}<input id="ticket-search" type="search" placeholder="Search conversations" aria-label="Search conversations" autocomplete="off" /></label>
          <div class="inbox-filters" aria-label="Filter conversations"><button data-filter="all" aria-pressed="true">All</button><button data-filter="open" aria-pressed="false">Open</button><button data-filter="waiting" aria-pressed="false">Waiting</button></div>
          <div id="ticket-list" class="ticket-list"></div>
        </aside>
        <section id="ticket-detail" class="ticket-detail" aria-label="Selected conversation"></section>
      </main>
    </div>
  </div>
  <footer class="app-footer">
    <div class="persona-attribution">
      Agent UI built with <a href="https://github.com/runtypelabs/persona" target="_blank" rel="noreferrer"><img class="persona-attribution-icon" src="/persona-js-icon.svg" width="14" height="14" alt="" />persona.js</a>, an open-source project by <a href="https://runtype.com" target="_blank" rel="noreferrer"><img class="runtype-wordmark" src="/runtype-logo.svg" width="56" height="12" alt="Runtype" /></a>.
    </div>
  </footer>`;

function matchingTickets() {
  const normalized = query.toLowerCase();
  return tickets.filter(ticket => (filter === "all" || ticket.status === filter) && `${ticket.subject} ${ticket.customer} ${ticket.company} ${ticket.id}`.toLowerCase().includes(normalized));
}
function renderList() {
  const list = root.querySelector<HTMLDivElement>("#ticket-list")!;
  const matches = matchingTickets();
  list.innerHTML = matches.length ? matches.map(ticket => `<button class="ticket-row" data-ticket="${escape(ticket.id)}" aria-current="${ticket.id === selected.id ? "true" : "false"}"><div class="ticket-row-top"><span class="customer-avatar ${ticket.priority === "high" ? "warm" : ""}">${escape(initials(ticket.customer))}</span><span class="ticket-customer">${escape(ticket.customer)}<small>${escape(ticket.company)}</small></span><span class="ticket-time">${escape(ticket.updatedAt)}</span></div><div class="ticket-subject">${escape(ticket.subject)}</div><p>${escape(ticket.messages.at(-1)?.body ?? "")}</p><div class="ticket-row-footer"><span class="status-pill ${ticket.status}"><i></i>${ticket.status === "open" ? "Open" : "Waiting"}</span><span>${escape(ticket.id.replace("ticket-", "#"))}</span>${ticket.priority === "high" ? '<span class="priority-pill">High priority</span>' : ""}</div></button>`).join("") : '<div class="empty-inbox">No conversations found.<span>Try a different name or filter.</span></div>';
  list.querySelectorAll<HTMLButtonElement>("[data-ticket]").forEach(button => button.addEventListener("click", () => selectTicket(button.dataset.ticket!)));
  root.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.filter === filter)));
}
function renderDetail() {
  customerTranscript?.destroy();
  const ticket = selected;
  const detail = root.querySelector<HTMLElement>("#ticket-detail")!;
  detail.innerHTML = `
    <header class="ticket-toolbar"><button class="back-to-inbox" id="back-to-inbox" aria-label="Back to inbox">← Inbox</button><span class="ticket-breadcrumb">Inbox ${icon("chevron")} <span>${escape(ticket.id.replace("ticket-", "#"))}</span></span><div class="ticket-actions"><button class="ask-assistant" id="ask-assistant" aria-expanded="${assistant?.getState().open ?? false}">${icon("panel")}Assistant</button></div></header>
    <div class="ticket-scroll">
      <div class="ticket-title"><h2 id="ticket-title-heading" tabindex="-1">${escape(ticket.subject)}</h2><div class="ticket-subtitle"><span>${escape(ticket.customer)}</span><span class="separator-dot">·</span>${escape(ticket.company)}<span class="separator-dot">·</span>${escape(ticket.email)}</div><div class="ticket-tags"><span class="ticket-status"><i class="status-dot ${ticket.status}" aria-hidden="true"></i>${ticket.status === "open" ? "Open" : "Waiting"}</span>${ticket.tags.map(tag => `<span>${escape(tag)}</span>`).join("")}</div></div>


      <p class="draft-only-note">Suggestions and drafts stay here. Nothing is sent to the customer.</p>
    </div>`;
  const host = detail.querySelector<HTMLElement>(".ticket-scroll")!;
  const title = host.querySelector<HTMLElement>(".ticket-title")!;
  const note = host.querySelector<HTMLElement>(".draft-only-note")!;
  title.remove();
  note.remove();
  customerTranscript = mountCustomerTranscript(host, ticket, title, note);
  detail.querySelector("#ask-assistant")!.addEventListener("click", () => { assistant?.toggle(); });
  detail.querySelector("#back-to-inbox")!.addEventListener("click", () => { root.dataset.mobileView = "inbox"; root.querySelector<HTMLButtonElement>(`[data-ticket="${selected.id}"]`)?.focus(); });
}
function mountAssistant(keepOpen = false) {
  stopAssistantListeners();
  assistant?.destroy();
  conversationId = crypto.randomUUID();
  assistant = initAgentWidget({
    target: "#support-workspace",
    config: {
      future: { v5Defaults: true },
      persistState: false,
      colorScheme: "light",
      apiUrl: `/api/dispatch?mode=${mode}`,
      launcher: {
        enabled: true,
        mountMode: "docked",
        dock: { side: "right", width: "380px", reveal: "emerge", maxHeight: "100%" },
        autoExpand: keepOpen,
        mobileFullscreen: true,
        mobileBreakpoint: 1080,
        title: "Relay assistant",
        subtitle: mode === "preview" ? "Preview · Sample support workspace" : "Live · Cloudflare Agents",
        agentIconName: "sparkles",
      },
      welcome: { title: "Ask about this conversation", subtitle: "", variant: "card", layout: "top", align: "start" },
      copy: { inputPlaceholder: "Ask about this conversation…" },
      turnActivity: { enabled: true },
      contextProviders: [() => ({ ticketId: selected.id, conversationId })],
      suggestions: { starters: { items: ["Summarize this conversation", "Investigate the issue", "Draft a helpful reply"], variant: "chip", placement: "welcome", maxItems: 3 } },
      theme: { components: { introCard: { padding: "0", title: { fontSize: "18px", lineHeight: "24px" } } }, semantic: { colors: { accent: "#3864bd", primary: "#252b36", background: "#ffffff", surface: "#ffffff" } } },
      toolCall: { renderCollapsedSummary: renderToolRow, resolveActionTitle: call => ({ read_ticket: "Review customer conversation", search_runbook: "Look up support guidance", check_service_status: "Check relevant service status" })[call.name ?? ""] },
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
    },
  });
  syncAssistantButton(assistant.getState().open);
  const stopOpen = assistant.on("widget:opened", () => rememberAssistant(true));
  const stopClose = assistant.on("widget:closed", () => rememberAssistant(false));
  stopAssistantListeners = () => { stopOpen(); stopClose(); };
  let hadMessages = false;
  assistant.on("messages:changed", messages => {
    if (hadMessages && !messages.length) conversationId = crypto.randomUUID();
    hadMessages = messages.length > 0;
  });
}
function selectTicket(id: string) {
  const next = tickets.find(ticket => ticket.id === id);
  if (!next) return;
  if (next.id !== selected.id) {
    const keepOpen = assistant?.getState().open ?? false;
    selected = next;
    renderDetail();
    mountAssistant(keepOpen);
  }
  root.dataset.mobileView = "detail";
  renderList();
  if (window.matchMedia("(max-width: 780px)").matches) {
    root.querySelector<HTMLElement>("#ticket-title-heading")?.focus();
  }
}
root.querySelector<HTMLInputElement>("#ticket-search")!.addEventListener("input", event => { query = (event.target as HTMLInputElement).value; renderList(); });
root.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(button => button.addEventListener("click", () => { filter = button.dataset.filter as Filter; renderList(); }));
root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(button => button.addEventListener("click", () => {
  const next = button.dataset.mode as Mode;
  if (next === mode || (next === "live" && !liveAvailable)) return;
  const keepOpen = assistant?.getState().open ?? false;
  mode = next;
  root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(item => item.setAttribute("aria-pressed", String(item.dataset.mode === mode)));
  mountAssistant(keepOpen);
}));
root.dataset.mobileView = "inbox";
renderList();
renderDetail();
mountAssistant(initiallyOpenAssistant());
void fetch("/api/config").then(async response => {
  if (!response.ok) throw new Error("Configuration unavailable");
  const config: { liveAvailable?: boolean } = await response.json();
  liveAvailable = config.liveAvailable === true;
  const button = root.querySelector<HTMLButtonElement>('[data-mode="live"]')!;
  button.disabled = !liveAvailable;
  button.title = liveAvailable ? "Use your configured Cloudflare agent" : "Set the server’s provider key to enable Live mode";
}).catch(() => { /* Preview remains available when provider configuration cannot be checked. */ });
window.addEventListener("pagehide", () => { stopAssistantListeners(); assistant?.destroy(); customerTranscript?.destroy(); }, { once: true });
