import { initAgentWidget, markdownPostprocessor, type AgentWidgetInitHandle } from "@runtypelabs/persona";
import "@runtypelabs/persona/widget.css";
import "../styles.css";
import { tickets } from "../shared/tickets";
import { renderToolRow, renderToolSummary } from "./tool-summary";

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

const icons = {
  inbox: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 13h5l2 3h4l2-3h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
function icon(name: keyof typeof icons) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`; }
function escape(value: string) { return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
function initials(name: string) { return name.split(" ").map(part => part[0]).slice(0, 2).join(""); }

root.innerHTML = `
  <header class="app-header">
    <a class="brand" href="/" aria-label="Relay support home"><span class="brand-symbol">r</span>relay<span class="brand-divider"></span><span class="workspace-name">Acme support</span></a>
    <div class="header-right"><span class="sample-badge">Sample workspace</span><div class="mode-switch" aria-label="Assistant connection mode"><button data-mode="preview" aria-pressed="true">Preview</button><button data-mode="live" aria-pressed="false" disabled title="Configure a provider to enable Live">Live</button></div><span class="team-avatar" aria-label="Support team">AC</span></div>
  </header>
  <div class="app-stage">
    <nav class="navigation-rail" aria-label="Workspace navigation"><button class="rail-button active" id="inbox-home" aria-label="Show all conversations" title="Inbox">${icon("inbox")}</button><a class="rail-button rail-help" href="https://persona-chat.dev" target="_blank" rel="noreferrer" aria-label="About Persona" title="Built with Persona">p</a></nav>
    <div class="dock-boundary">
      <main id="support-workspace" class="support-workspace">
        <aside class="inbox" aria-label="Support conversations">
          <div class="inbox-heading"><div><span class="section-eyebrow">CUSTOMER CARE</span><h1>Inbox <span>${tickets.length}</span></h1></div><span class="inbox-symbol">${icon("inbox")}</span></div>
          <label class="search-box">${icon("search")}<input id="ticket-search" type="search" placeholder="Search conversations" aria-label="Search conversations" autocomplete="off" /></label>
          <div class="inbox-filters" aria-label="Filter conversations"><button data-filter="all" aria-pressed="true">All</button><button data-filter="open" aria-pressed="false">Open</button><button data-filter="waiting" aria-pressed="false">Waiting</button></div>
          <div id="ticket-list" class="ticket-list"></div>
          <div class="inbox-footer"><span class="sample-dot"></span> A small team. A thoughtful response.</div>
        </aside>
        <section id="ticket-detail" class="ticket-detail" aria-label="Selected conversation"></section>
      </main>
    </div>
  </div>`;

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
  const ticket = selected;
  const detail = root.querySelector<HTMLElement>("#ticket-detail")!;
  detail.innerHTML = `
    <header class="ticket-toolbar"><button class="back-to-inbox" id="back-to-inbox" aria-label="Back to inbox">← Inbox</button><span class="ticket-breadcrumb">Inbox ${icon("chevron")} <span>${escape(ticket.id.replace("ticket-", "#"))}</span></span><span class="ticket-status"><i class="status-dot ${ticket.status}"></i>${ticket.status === "open" ? "Open conversation" : "Waiting on customer"}</span></header>
    <div class="ticket-scroll">
      <div class="ticket-title"><div class="ticket-category">${escape(ticket.category)}</div><h2 id="ticket-title-heading" tabindex="-1">${escape(ticket.subject)}</h2><div class="ticket-subtitle"><span>${escape(ticket.customer)}</span><span class="separator-dot">·</span>${escape(ticket.company)}<span class="separator-dot">·</span>${escape(ticket.email)}</div><div class="ticket-tags">${ticket.tags.map(tag => `<span>${escape(tag)}</span>`).join("")}</div></div>
      <div class="conversation-date"><span></span>Customer conversation<span></span></div>
      <div class="customer-thread">${ticket.messages.map(message => `<article class="thread-message ${message.role}"><span class="message-avatar ${message.role === "support" ? "support-avatar" : ""}">${escape(initials(message.author))}</span><div class="message-content"><div class="message-heading"><strong>${escape(message.author)}</strong><span>${message.role === "support" ? "Support team" : "Customer"}</span><time>${escape(message.time)}</time></div><div class="message-body">${escape(message.body).split("\n\n").map(paragraph => `<p>${paragraph.replaceAll("\n", "<br />")}</p>`).join("")}</div></div></article>`).join("")}</div>
      <section class="assistant-invitation"><div class="invitation-symbol">${icon("sparkle")}</div><div><h3>A little context goes a long way.</h3><p>Review the conversation, check the runbook, and find the right next step.</p><button class="ask-assistant" id="ask-assistant">Ask Relay assistant ${icon("arrow")}</button></div></section>
      <section class="service-signals" aria-label="Conversation context"><div class="signal-item">${icon("shield")}<div><span>Customer context</span><strong>${escape(ticket.company)}</strong></div></div><div class="signal-item">${icon("clock")}<div><span>Service signals</span><button id="check-service">Check with assistant ↗</button></div></div></section>
      <p class="draft-only-note">Suggestions and drafts stay here. Nothing is sent to the customer.</p>
    </div>`;
  detail.querySelector("#ask-assistant")!.addEventListener("click", () => { assistant?.open(); });
  detail.querySelector("#check-service")!.addEventListener("click", () => { assistant?.open(); void assistant?.submitMessage("Check the relevant service status and explain what it means for this customer."); });
  detail.querySelector("#back-to-inbox")!.addEventListener("click", () => { root.dataset.mobileView = "inbox"; root.querySelector<HTMLButtonElement>(`[data-ticket="${selected.id}"]`)?.focus(); });
}
function mountAssistant(keepOpen = false) {
  assistant?.destroy();
  conversationId = crypto.randomUUID();
  const ticket = selected;
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
        dock: { side: "right", width: "420px", reveal: "emerge", maxHeight: "calc(100dvh - 68px)" },
        autoExpand: keepOpen,
        mobileFullscreen: true,
        mobileBreakpoint: 1080,
        title: "Relay assistant",
        subtitle: mode === "preview" ? "Preview · Sample support workspace" : "Live · Cloudflare Agents",
        agentIconName: "sparkles",
      },
      welcome: { title: "The right words.\nThe next step.", subtitle: `A second pair of eyes on ${ticket.customer.split(" ")[0]}’s conversation. I can help you understand, investigate, and draft.`, variant: "card" },
      copy: { inputPlaceholder: "Ask about this conversation…" },
      turnActivity: { enabled: true },
      contextProviders: [() => ({ ticketId: selected.id, conversationId })],
      suggestions: { starters: { items: ["Summarize this conversation", "Investigate the issue", "Draft a helpful reply"], variant: "chip", placement: "composer", maxItems: 3 } },
      theme: { semantic: { colors: { accent: "#3864bd", primary: "#252b36", background: "#ffffff", surface: "#ffffff" } } },
      toolCall: { renderCollapsedSummary: renderToolRow, renderGroupedSummary: renderToolSummary, resolveActionTitle: call => ({ read_ticket: "Review customer conversation", search_runbook: "Look up support guidance", check_service_status: "Check relevant service status" })[call.name ?? ""] },
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
    },
  });
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
root.querySelector("#inbox-home")!.addEventListener("click", () => { filter = "all"; query = ""; root.querySelector<HTMLInputElement>("#ticket-search")!.value = ""; root.dataset.mobileView = "inbox"; renderList(); });
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
mountAssistant();
void fetch("/api/config").then(async response => {
  if (!response.ok) throw new Error("Configuration unavailable");
  const config: { liveAvailable?: boolean } = await response.json();
  liveAvailable = config.liveAvailable === true;
  const button = root.querySelector<HTMLButtonElement>('[data-mode="live"]')!;
  button.disabled = !liveAvailable;
  button.title = liveAvailable ? "Use your configured Cloudflare agent" : "Set the server’s provider key to enable Live mode";
}).catch(() => { /* Preview remains available when provider configuration cannot be checked. */ });
window.addEventListener("pagehide", () => assistant?.destroy(), { once: true });
