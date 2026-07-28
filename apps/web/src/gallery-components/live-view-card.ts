import type { ComponentRenderer } from "@runtypelabs/persona";

import type { GalleryComponent } from "./types";

/**
 * BrowserLiveViewCard — the human-in-the-loop handoff card for Cloudflare
 * Browser Run.
 *
 * When an agent driving a headless browser hits something only a person can do
 * (a login, a 2FA prompt, a CAPTCHA), it hands control over: the run parks and
 * this card renders in the transcript with the session's Live View embedded in
 * an iframe. The human works directly in that frame and then clicks
 * "I've finished" (or "Something went wrong"), which resolves the paused tool
 * call and lets the agent continue.
 *
 * ## Why this component never re-renders itself
 *
 * The iframe holds a live, single-use browser session. Destroying and
 * recreating it drops the human's work. Two rendering facts in Persona make
 * that easy to trip over, so this renderer is deliberately built to run ONCE:
 *
 *   1. `context.updateProps` is a no-op inside the transcript — the transcript
 *      call site in `ui.ts` renders directives without an `onPropsUpdate`
 *      handler, so calling it silently does nothing.
 *   2. Re-injecting the same directive id only rebuilds when `rawContent`
 *      changes, and a rebuild destroys and recreates this subtree (and with it
 *      the iframe).
 *
 * So instead of re-rendering, the card publishes its own event channel: the
 * host page drives later state changes by dispatching
 * `persona:live-view-handoff:status` on `window`, and the renderer mutates the
 * already-mounted DOM through closure references. The wrapper the widget puts
 * around a component directive carries `data-preserve-runtime="true"`, so
 * idiomorph skips this subtree entirely on subsequent render passes.
 */

/** Handoff lifecycle as the transcript shows it. */
export type LiveViewStatus = "waiting" | "completed" | "failed";

/** `window` event the host page dispatches to move a mounted card's status. */
export const LIVE_VIEW_STATUS_EVENT = "persona:live-view-handoff:status";

/** `window` event the card dispatches when the human resolves the handoff. */
export const LIVE_VIEW_RESOLVE_EVENT = "persona:live-view-handoff:resolve";

export type LiveViewStatusDetail = {
  handoffId: string;
  status: LiveViewStatus;
  /** Replaces the status line's explanatory text. */
  note?: string;
};

export type LiveViewResolveDetail = {
  handoffId: string;
  /** `true` for "I've finished", `false` for "Something went wrong". */
  success: boolean;
  note?: string;
};

/**
 * Last known status per handoff, so a transcript rebuild (a reload, a
 * fingerprint change, a plugin re-render) brings the card back in the state the
 * human left it rather than reopening a finished handoff. In-memory only: Live
 * View URLs are short-lived, so a resolved handoff surviving a page reload
 * would just point at a dead session.
 */
const resolvedStatus = new Map<string, { status: LiveViewStatus; note?: string }>();

/**
 * How long to wait for the iframe's `load` before warning that the Live View
 * may be blocked. Only catches a frame that never loads at all: a frame
 * refused by `frame-ancestors` / `X-Frame-Options` still fires `load` (with a
 * browser error page inside), and cross-origin means we cannot inspect it. The
 * always-visible "Open in a new tab" link is the real fallback.
 */
const LOAD_WARNING_MS = 8000;

const STATUS_COPY: Record<LiveViewStatus, { label: string; note: string; color: string; dot: string }> = {
  waiting: {
    label: "Waiting for you",
    note: "The agent has paused and handed you the browser. Finish the step below, then let it know.",
    color: "#b45309",
    dot: "#f59e0b",
  },
  completed: {
    label: "Handed back",
    note: "Thanks — the agent has picked the session back up.",
    color: "#15803d",
    dot: "#22c55e",
  },
  failed: {
    label: "Reported a problem",
    note: "The agent has been told the step could not be completed.",
    color: "#b91c1c",
    dot: "#ef4444",
  },
};

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" && value.length > 0 ? value : fallback;

const isStatus = (value: unknown): value is LiveViewStatus =>
  value === "waiting" || value === "completed" || value === "failed";

/**
 * `http(s)` only. A component directive is model-authored content, so the URL
 * reaches us as untrusted input; without this an agent could put
 * `javascript:` behind the iframe and the "Open in a new tab" anchor.
 */
const safeUrl = (value: unknown): string | null => {
  const raw = asString(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw, window.location.href);
    const scheme = parsed.protocol.toLowerCase();
    return scheme === "http:" || scheme === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
};

export const BrowserLiveViewCard: ComponentRenderer = (props) => {
  const handoffId = asString(props.handoffId, "live-view");
  const url = safeUrl(props.url);
  const instructions = asString(
    props.instructions,
    "Complete the step in the browser session below.",
  );
  const restored = resolvedStatus.get(handoffId);
  let status: LiveViewStatus = restored?.status ?? (isStatus(props.status) ? props.status : "waiting");
  let statusNote = restored?.note;

  const card = document.createElement("div");
  card.className = "live-view-card";
  card.setAttribute("data-live-view-handoff", handoffId);
  card.style.cssText = `
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    background: white;
    overflow: hidden;
    width: 100%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  `;

  // -- Header: status dot + label, and the always-available escape hatch. -----
  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #f0f0f0;
    background: #fafafa;
  `;

  const dot = document.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  dot.style.cssText = `
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  `;

  const statusLabel = document.createElement("strong");
  statusLabel.style.cssText = "font-size: 0.85rem; letter-spacing: 0.01em;";

  const spacer = document.createElement("span");
  spacer.style.cssText = "flex: 1;";

  const openLink = document.createElement("a");
  openLink.href = url ?? "#";
  openLink.target = "_blank";
  openLink.rel = "noopener noreferrer";
  openLink.textContent = "Open in a new tab";
  openLink.style.cssText = `
    font-size: 0.78rem;
    color: #2563eb;
    text-decoration: none;
  `;
  if (!url) openLink.style.display = "none";

  header.append(dot, statusLabel, spacer, openLink);

  // -- Body: what the human is being asked to do, plus the live session. -----
  const body = document.createElement("div");
  body.style.cssText = "padding: 0.85rem 1rem 0;";

  const instructionsEl = document.createElement("p");
  instructionsEl.textContent = instructions;
  instructionsEl.style.cssText = `
    margin: 0 0 0.35rem 0;
    font-size: 0.9rem;
    line-height: 1.45;
    color: #333;
  `;

  const statusNoteEl = document.createElement("p");
  statusNoteEl.style.cssText = `
    margin: 0 0 0.75rem 0;
    font-size: 0.8rem;
    line-height: 1.4;
    color: #666;
  `;

  body.append(instructionsEl, statusNoteEl);

  const frameShell = document.createElement("div");
  frameShell.style.cssText = `
    position: relative;
    border: 1px solid #e6e6e6;
    border-radius: 8px;
    overflow: hidden;
    background: #f6f6f6;
    aspect-ratio: 16 / 10;
  `;

  let iframe: HTMLIFrameElement | null = null;
  const loadWarning = document.createElement("p");
  loadWarning.hidden = true;
  loadWarning.style.cssText = `
    margin: 0.6rem 0 0 0;
    padding: 0.55rem 0.7rem;
    border-radius: 6px;
    background: #fef3c7;
    color: #92400e;
    font-size: 0.78rem;
    line-height: 1.4;
  `;
  loadWarning.textContent =
    "The live session is taking a while to appear. Some sites refuse to be embedded — use “Open in a new tab” above to work in the session directly.";

  if (url) {
    iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.title = "Live browser session";
    // Scripts and same-origin are what make the remote session usable at all;
    // forms and popups cover the login flows this card exists for.
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
    iframe.setAttribute("allow", "clipboard-read; clipboard-write; fullscreen");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.style.cssText = "display: block; width: 100%; height: 100%; border: 0;";

    const warnTimer = window.setTimeout(() => {
      loadWarning.hidden = false;
    }, LOAD_WARNING_MS);
    iframe.addEventListener("load", () => {
      window.clearTimeout(warnTimer);
    });
    frameShell.appendChild(iframe);
  } else {
    const missing = document.createElement("p");
    missing.textContent = "No live view URL was provided for this handoff.";
    missing.style.cssText = `
      margin: 0;
      padding: 2rem 1rem;
      text-align: center;
      color: #888;
      font-size: 0.85rem;
    `;
    frameShell.appendChild(missing);
  }

  body.append(frameShell, loadWarning);

  const expiryNote = document.createElement("p");
  expiryNote.textContent = "Live view links are short-lived (about 5 minutes) and expire once the handoff ends.";
  expiryNote.style.cssText = `
    margin: 0.55rem 0 0 0;
    font-size: 0.72rem;
    color: #999;
  `;
  body.appendChild(expiryNote);

  // -- Actions: the two ways a human ends a handoff. -------------------------
  const actions = document.createElement("div");
  actions.style.cssText = `
    display: flex;
    gap: 0.5rem;
    padding: 0.85rem 1rem 1rem;
  `;

  const doneButton = document.createElement("button");
  doneButton.type = "button";
  doneButton.textContent = "I've finished";
  doneButton.style.cssText = `
    background: #2563eb;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
  `;

  const failButton = document.createElement("button");
  failButton.type = "button";
  failButton.textContent = "Something went wrong";
  failButton.style.cssText = `
    background: white;
    color: #444;
    border: 1px solid #d4d4d4;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  `;

  actions.append(doneButton, failButton);
  card.append(header, body, actions);

  /**
   * The only place the card's visual state changes after mount. Everything it
   * touches is a closure reference into the tree built above, so nothing is
   * destroyed and the iframe keeps its session.
   */
  const paint = (): void => {
    const copy = STATUS_COPY[status];
    dot.style.background = copy.dot;
    statusLabel.textContent = copy.label;
    statusLabel.style.color = copy.color;
    statusNoteEl.textContent = statusNote ?? copy.note;

    const settled = status !== "waiting";
    doneButton.disabled = settled;
    failButton.disabled = settled;
    actions.style.display = settled ? "none" : "flex";
    if (settled) {
      // Keep the frame visible (the human may want to read the end state) but
      // stop advertising it as an active session.
      frameShell.style.opacity = "0.55";
      frameShell.style.pointerEvents = "none";
      loadWarning.hidden = true;
    }
  };

  const settle = (success: boolean, note?: string): void => {
    if (status !== "waiting") return;
    status = success ? "completed" : "failed";
    statusNote = note;
    resolvedStatus.set(handoffId, { status, note });
    paint();
    window.dispatchEvent(
      new CustomEvent<LiveViewResolveDetail>(LIVE_VIEW_RESOLVE_EVENT, {
        detail: { handoffId, success, ...(note ? { note } : {}) },
      }),
    );
  };

  doneButton.addEventListener("click", () => settle(true));
  failButton.addEventListener("click", () =>
    settle(false, "The user reported that the step could not be completed."),
  );

  // Host-page channel for status the card cannot know itself: the tool call
  // timing out, the run being cancelled, or a server-side completion.
  const onStatus = (event: Event): void => {
    const detail = (event as CustomEvent<LiveViewStatusDetail>).detail;
    if (!detail || detail.handoffId !== handoffId) return;
    // A rebuild leaves the previous card detached with its listener still
    // bound. Drop it rather than mutating DOM nobody can see.
    if (!card.isConnected) {
      window.removeEventListener(LIVE_VIEW_STATUS_EVENT, onStatus);
      return;
    }
    if (!isStatus(detail.status)) return;
    status = detail.status;
    statusNote = detail.note;
    if (status !== "waiting") resolvedStatus.set(handoffId, { status, note: statusNote });
    paint();
  };
  window.addEventListener(LIVE_VIEW_STATUS_EVENT, onStatus);

  paint();
  return card;
};

const liveViewCard: GalleryComponent = {
  name: "BrowserLiveViewCard",
  label: "Browser live view handoff",
  renderer: BrowserLiveViewCard,
  // `bubbleChrome: false` — the card draws its own border and surface, so the
  // standard message bubble would double-box it. `index.ts` forwards this to
  // `componentRegistry.register(name, renderer, options)`.
  registrationOptions: { bubbleChrome: false },
  sample: {
    text: "",
    props: {
      url: "https://example.com",
      handoffId: "gallery-preview",
      instructions:
        "Sign in to the account, then choose “I've finished” so I can carry on with the checkout.",
      status: "waiting",
    },
  },
};

export default liveViewCard;
