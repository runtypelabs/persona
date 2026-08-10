import type {
  AgentWidgetPlugin,
  AgentWidgetPluginStorage,
  AgentWidgetSuggestion,
} from "@runtypelabs/persona";
import { injectStyles } from "@runtypelabs/persona/plugin-kit";

/**
 * Blueprint A: home screen (Intercom-lite), built purely on public surface.
 *
 * `renderWelcome` owns the panel's first screen: a greeting header, a "start a
 * conversation" card, starter cards, static content cards, and a link list.
 * Leaving home returns null so the transcript shows; the header action calls
 * `showHome()` to render the stack back over an existing conversation, which
 * works because a plugin element ignores derived visibility and the host
 * overlays the transcript while it is mounted.
 *
 * The composer is hidden while home is shown (Intercom's Home tab has no
 * composer; it belongs to the conversation view). Welcome arbitration owns
 * that decision: `renderComposer` follows the last welcome render, and a
 * disagreement (the composer hook runs first at panel construction) is
 * corrected through `requestRender()` in a microtask, before paint.
 *
 * History composition is optional and additive. Supply recent-conversation
 * rows plus the async `onStartConversation` / `onOpenConversation` /
 * `onShowConversations` callbacks and the stack grows a "Recent conversations"
 * section between the start card and the starters. The plugin owns the pending
 * and error rendering around those callbacks; it never touches a history
 * provider or the internal provider registry, and the host wires the callbacks
 * to public controller methods. With the callbacks absent, every existing
 * behavior is unchanged.
 */

/** Avatar for the greeting header. `url` wins; `text` is the emoji fallback. */
export type HomeScreenAvatar = {
  url?: string;
  alt?: string;
  text?: string;
};

/** Static "news" style card. `prompt` asks the agent, `href` opens a page. */
export type HomeScreenCard = {
  id: string;
  title: string;
  body?: string;
  actionLabel?: string;
  prompt?: string;
  href?: string;
};

export type HomeScreenLink = {
  id: string;
  label: string;
  description?: string;
  href: string;
};

/**
 * One Home teaser row. The host maps a `HistoryConversationSummary` onto this
 * shape; the plugin renders `title` and `preview` verbatim and never derives
 * either locally.
 */
export type HomeScreenRecentConversation = {
  id: string;
  title: string;
  preview?: string | null;
  /** ISO timestamp, rendered as relative time inside a `<time datetime>`. */
  updatedAt: string;
};

/**
 * Teaser load state. `undefined` (the default) means no history composition at
 * all, so the section is omitted and the stack behaves exactly as before.
 */
export type HomeScreenRecentStatus = "ready" | "loading" | "error";

export type HomeScreenOptions = {
  avatar?: HomeScreenAvatar;
  /** Rendered through `ctx.renderStarter`, so the select pipeline still applies. */
  starters?: AgentWidgetSuggestion[];
  cards?: HomeScreenCard[];
  links?: HomeScreenLink[];
  startLabel?: string;
  startHint?: string;
  startersLabel?: string;
  cardsLabel?: string;
  linksLabel?: string;

  // --- history composition (all optional) ----------------------------------

  /** Newest first. At most three rows render, matching the Home teaser spec. */
  recentConversations?: HomeScreenRecentConversation[];
  /** Set it to render the section at all. Default `undefined` (no section). */
  recentStatus?: HomeScreenRecentStatus;
  recentLabel?: string;
  seeAllLabel?: string;
  recentErrorLabel?: string;
  retryLabel?: string;
  startErrorLabel?: string;
  openErrorLabel?: string;
  seeAllErrorLabel?: string;
  /**
   * Awaited. On success the plugin shows the conversation surface; on failure
   * it stays on home, restores focus to the action, and shows an inline error.
   * "Start a conversation" stays enabled even when the teaser failed to load.
   */
  onStartConversation?: () => void | Promise<void>;
  /** Awaited. Same transactional rules as `onStartConversation`. */
  onOpenConversation?: (conversationId: string) => void | Promise<void>;
  /** Awaited. "See all" opens the host's Messages surface; home stays put. */
  onShowConversations?: () => void | Promise<void>;
  /** Retry control for the failed teaser. Omit it to render the message only. */
  onRetryRecent?: () => void | Promise<void>;
  /** Fired after the plugin switches to the conversation surface. */
  onConversationShown?: () => void;
};

export type HomeScreenPlugin = AgentWidgetPlugin & {
  /** Spread into `layout.header.trailingActions`; pair with `onAction`. */
  headerAction: { id: string; icon: string; ariaLabel: string };
  /** Re-show the stack over the transcript. */
  showHome: () => void;
  /** Leave home and show the conversation surface. */
  showConversation: () => void;
  /** Merge new options and re-render, so option changes are live like config. */
  update: (next: Partial<HomeScreenOptions>) => void;
  isHome: () => boolean;
};

const VIEW_KEY = "view";
const HOME_ACTION_ID = "home";

const HOME_SCREEN_CSS = `
/* Same width cap as Persona's starter group: a wide inline panel gets a
   centered stack instead of stretched full-width rows. */
.persona-home {
  width: 100%;
  max-width: 560px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  text-align: left;
}

.persona-home__greeting {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.persona-home__avatar {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  overflow: hidden;
  font-size: 20px;
  background: color-mix(in srgb, var(--persona-accent, #171717) 12%, transparent);
}

.persona-home__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.persona-home__title {
  margin: 0;
  font-size: 18px;
  font-weight: 640;
  line-height: 1.25;
}

.persona-home__subtitle {
  margin: 2px 0 0;
  color: var(--persona-text-muted, #6b7280);
  font-size: 13px;
  line-height: 1.45;
}

.persona-home__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.persona-home__section-label {
  margin: 0;
  color: var(--persona-text-muted, #6b7280);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.persona-home__start,
.persona-home__card,
.persona-home__link {
  appearance: none;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--persona-border, #e5e7eb) 80%, transparent);
  border-radius: 14px;
  background: var(--persona-surface, #ffffff);
  color: var(--persona-text, #111827);
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.persona-home__start:hover,
.persona-home__card:hover,
.persona-home__link:hover {
  border-color: var(--persona-accent, #171717);
  transform: translateY(-1px);
}

.persona-home__start:focus-visible,
.persona-home__card:focus-visible,
.persona-home__link:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--persona-accent, #171717) 45%, transparent);
  outline-offset: 2px;
}

.persona-home__start {
  border-color: color-mix(in srgb, var(--persona-accent, #171717) 40%, transparent);
  background: color-mix(in srgb, var(--persona-accent, #171717) 7%, var(--persona-surface, #ffffff));
}

.persona-home__copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.persona-home__label {
  font-size: 14px;
  font-weight: 620;
  line-height: 1.3;
}

.persona-home__hint {
  color: var(--persona-text-muted, #6b7280);
  font-size: 12px;
  line-height: 1.4;
}

.persona-home__glyph {
  color: var(--persona-text-muted, #6b7280);
  font-size: 14px;
}

.persona-home__start .persona-home__glyph {
  color: var(--persona-accent, #171717);
}

.persona-home__card {
  grid-template-columns: minmax(0, 1fr);
}

.persona-home__card-action {
  justify-self: start;
  margin-top: 2px;
  color: var(--persona-accent, #171717);
  font-size: 12px;
  font-weight: 620;
}

.persona-home__starters {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.persona-home__links {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.persona-home__link {
  padding: 11px 14px;
}

/* Recent conversations: teaser rows only. No message count, active marker,
   overflow menu, or delete; those live in the full Messages surface. */
.persona-home__recent-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.persona-home__recent-all {
  appearance: none;
  padding: 2px 4px;
  margin: -2px -4px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--persona-accent, #171717);
  font: inherit;
  font-size: 12px;
  font-weight: 620;
  cursor: pointer;
}

.persona-home__recent-all:hover {
  text-decoration: underline;
}

.persona-home__recent-all:focus-visible,
.persona-home__recent:focus-visible,
.persona-home__recent-retry:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--persona-accent, #171717) 45%, transparent);
  outline-offset: 2px;
}

.persona-home__recent {
  appearance: none;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--persona-border, #e5e7eb) 80%, transparent);
  border-radius: 14px;
  background: var(--persona-surface, #ffffff);
  color: var(--persona-text, #111827);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease;
}

.persona-home__recent:hover {
  border-color: var(--persona-accent, #171717);
}

.persona-home__recent[aria-busy="true"],
.persona-home__recent:disabled {
  cursor: default;
  opacity: 0.6;
}

.persona-home__recent-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.persona-home__recent-title {
  font-size: 14px;
  font-weight: 620;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.persona-home__recent-preview {
  color: var(--persona-text-muted, #6b7280);
  font-size: 12px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.persona-home__recent-time {
  color: var(--persona-text-muted, #6b7280);
  font-size: 12px;
  line-height: 1.3;
  white-space: nowrap;
}

/* Shape-matched with a real row so the swap does not reflow the stack. */
.persona-home__recent-skeleton {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--persona-border, #e5e7eb) 55%, transparent);
  border-radius: 14px;
}

.persona-home__recent-skeleton-bar {
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--persona-text-muted, #6b7280) 18%, transparent);
  animation: persona-home-pulse 1400ms ease-in-out infinite;
}

.persona-home__recent-skeleton-bar--title { width: 45%; }
.persona-home__recent-skeleton-bar--preview { width: 80%; }

@keyframes persona-home-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

@media (prefers-reduced-motion: reduce) {
  .persona-home__recent-skeleton-bar { animation: none; }
}

.persona-home__recent-error,
.persona-home__error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--persona-text-muted, #6b7280);
  font-size: 12px;
  line-height: 1.4;
}

.persona-home__recent-retry {
  appearance: none;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--persona-border, #e5e7eb) 80%, transparent);
  border-radius: 999px;
  background: var(--persona-surface, #ffffff);
  color: var(--persona-text, #111827);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.persona-home__recent-retry:hover {
  border-color: var(--persona-accent, #171717);
}
`;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Same motion spec as Persona's starter entrance, so the stack reads as one system. */
const animateEntrance = (sections: readonly HTMLElement[]): void => {
  if (prefersReducedMotion()) return;
  sections.forEach((section, index) => {
    if (typeof section.animate !== "function") return;
    section.animate(
      [
        { opacity: "0", transform: "translateY(4px)" },
        { opacity: "1", transform: "none" },
      ],
      { duration: 250, delay: index * 60, easing: "ease-out", fill: "backwards" },
    );
  });
};

const buildAvatar = (avatar: HomeScreenAvatar | undefined): HTMLElement => {
  const holder = el("span", "persona-home__avatar");
  if (avatar?.url) {
    const image = document.createElement("img");
    image.src = avatar.url;
    image.alt = avatar.alt ?? "";
    holder.appendChild(image);
    return holder;
  }
  holder.textContent = avatar?.text ?? "👋";
  holder.setAttribute("aria-hidden", "true");
  return holder;
};

const buildRow = (
  tag: "button" | "a",
  className: string,
  label: string,
  hint: string | undefined,
  glyph: string,
): HTMLElement => {
  const row = el(tag, className);
  if (tag === "button") (row as HTMLButtonElement).type = "button";
  const copy = el("span", "persona-home__copy");
  copy.appendChild(el("span", "persona-home__label", label));
  if (hint) copy.appendChild(el("span", "persona-home__hint", hint));
  const arrow = el("span", "persona-home__glyph", glyph);
  arrow.setAttribute("aria-hidden", "true");
  row.append(copy, arrow);
  return row;
};

/** The Home teaser shows at most three rows; "See all" owns the rest. */
const MAX_RECENT_ROWS = 3;

/** Whole-row button: title, preview, relative time. Nothing else by contract. */
const buildRecentRow = (
  conversation: HomeScreenRecentConversation,
): HTMLButtonElement => {
  const row = el("button", "persona-home__recent");
  row.type = "button";
  row.dataset.conversationId = conversation.id;
  const copy = el("span", "persona-home__recent-copy");
  copy.appendChild(
    el("span", "persona-home__recent-title", conversation.title),
  );
  if (conversation.preview) {
    copy.appendChild(
      el("span", "persona-home__recent-preview", conversation.preview),
    );
  }
  const time = el(
    "time",
    "persona-home__recent-time",
    relativeTime(conversation.updatedAt),
  );
  time.setAttribute("datetime", conversation.updatedAt);
  row.append(copy, time);
  return row;
};

const RELATIVE_UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/** Localized relative time. Empty string for a value that will not parse. */
const relativeTime = (iso: string): string => {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diff = then - Date.now();
  const absolute = Math.abs(diff);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (absolute >= ms) return format.format(Math.round(diff / ms), unit);
  }
  return format.format(0, "second");
};

/**
 * Await a host callback with the plugin's own busy/error rendering. Failure
 * re-enables the control, returns focus to it, and leaves the surface alone.
 */
const runAction = (
  control: HTMLButtonElement,
  action: () => void | Promise<void>,
  onSuccess: () => void,
  onFailure: () => void,
): void => {
  if (control.disabled) return;
  control.disabled = true;
  control.setAttribute("aria-busy", "true");
  void Promise.resolve()
    .then(action)
    .then(onSuccess)
    .catch(() => {
      control.disabled = false;
      control.removeAttribute("aria-busy");
      control.focus();
      onFailure();
    });
};

/** One-line status with an optional retry, reused by every failed callback. */
const buildErrorNote = (
  className: string,
  message: string,
  retry?: { label: string; onRetry: () => void },
): HTMLElement => {
  const note = el("p", className);
  note.setAttribute("role", "status");
  note.appendChild(document.createTextNode(message));
  if (retry) {
    const button = el("button", "persona-home__recent-retry", retry.label);
    (button as HTMLButtonElement).type = "button";
    button.addEventListener("click", retry.onRetry);
    note.appendChild(button);
  }
  return note;
};

/**
 * Recent conversations section, or null when there is nothing to show:
 * no history composition at all, or a confirmed empty result.
 */
const buildRecentSection = (
  options: HomeScreenOptions,
  showConversation: () => void,
): HTMLElement | null => {
  const status = options.recentStatus;
  if (!status) return null;
  const rows = (options.recentConversations ?? []).slice(0, MAX_RECENT_ROWS);
  // A confirmed empty result omits the whole section, heading included.
  if (status === "ready" && rows.length === 0) return null;

  const section = el("section", "persona-home__section");
  const header = el("div", "persona-home__recent-header");
  header.appendChild(
    el(
      "p",
      "persona-home__section-label",
      options.recentLabel ?? "Recent conversations",
    ),
  );
  const onShowAll = options.onShowConversations;
  if (onShowAll && status !== "error") {
    const seeAll = el(
      "button",
      "persona-home__recent-all",
      options.seeAllLabel ?? "See all",
    );
    seeAll.type = "button";
    seeAll.addEventListener("click", () =>
      runAction(
        seeAll,
        onShowAll,
        () => {
          // Messages replaces the panel body; home stays the return surface.
          seeAll.disabled = false;
          seeAll.removeAttribute("aria-busy");
        },
        () => {
          section.querySelector(".persona-home__error")?.remove();
          section.appendChild(
            buildErrorNote(
              "persona-home__error",
              options.seeAllErrorLabel ?? "Couldn't open messages. Try again.",
            ),
          );
        },
      ),
    );
    header.appendChild(seeAll);
  }
  section.appendChild(header);

  if (status === "loading") {
    const list = el("div", "persona-home__starters");
    list.setAttribute("role", "status");
    list.setAttribute("aria-label", "Loading recent conversations");
    [0, 1].forEach(() => {
      const skeleton = el("div", "persona-home__recent-skeleton");
      skeleton.setAttribute("aria-hidden", "true");
      skeleton.append(
        el(
          "span",
          "persona-home__recent-skeleton-bar persona-home__recent-skeleton-bar--title",
        ),
        el(
          "span",
          "persona-home__recent-skeleton-bar persona-home__recent-skeleton-bar--preview",
        ),
      );
      list.appendChild(skeleton);
    });
    section.appendChild(list);
    return section;
  }

  if (status === "error") {
    const retry = options.onRetryRecent;
    section.appendChild(
      buildErrorNote(
        "persona-home__recent-error",
        options.recentErrorLabel ?? "Couldn't load recent conversations",
        retry
          ? { label: options.retryLabel ?? "Retry", onRetry: () => void retry() }
          : undefined,
      ),
    );
    return section;
  }

  const list = el("div", "persona-home__starters");
  const onOpen = options.onOpenConversation;
  rows.forEach((conversation) => {
    const row = buildRecentRow(conversation);
    row.addEventListener("click", () => {
      if (!onOpen) {
        showConversation();
        return;
      }
      runAction(
        row,
        () => onOpen(conversation.id),
        showConversation,
        () => {
          list.querySelector(".persona-home__error")?.remove();
          row.after(
            buildErrorNote(
              "persona-home__error",
              options.openErrorLabel ??
                "Couldn't open that conversation. Try again.",
            ),
          );
        },
      );
    });
    list.appendChild(row);
  });
  section.appendChild(list);
  return section;
};

export const createHomeScreenPlugin = (
  initialOptions: HomeScreenOptions = {},
): HomeScreenPlugin => {
  let options: HomeScreenOptions = { ...initialOptions };
  let requestRender: (() => void) | null = null;
  let composerRequestRender: (() => void) | null = null;
  // `ctx.storage` is the only view state: a second flag would desync from it.
  let viewStorage: AgentWidgetPluginStorage | null = null;
  // Welcome arbitration's last decision (null until it has run once). The
  // composer hook follows this rather than re-deriving it: only the welcome
  // ctx carries `visible`, which decides the restored-conversation case.
  let homeShown: boolean | null = null;
  // What the composer hook last rendered (true = hidden footer).
  let composerHidden: boolean | null = null;

  const isHome = () => viewStorage?.get(VIEW_KEY) !== "chat";

  // The composer hook runs before the first welcome render at panel
  // construction, so it can guess wrong for restored conversations. Both
  // arbitrations run in the same synchronous construction pass, so a
  // microtask correction lands before paint.
  const syncComposer = () => {
    queueMicrotask(() => {
      if (composerHidden === null || homeShown === null) return;
      if (composerHidden !== homeShown) composerRequestRender?.();
    });
  };

  const showHome = () => {
    viewStorage?.set(VIEW_KEY, "home");
    requestRender?.();
  };

  const leaveHome = () => {
    viewStorage?.set(VIEW_KEY, "chat");
    requestRender?.();
  };

  // Explicit navigation to the conversation surface. Starter/card selections
  // keep using `leaveHome`: their send owns the focus, not this hook.
  const showConversation = () => {
    leaveHome();
    options.onConversationShown?.();
  };

  return {
    id: "demo-home-screen",
    // Runs last, so a hook that cancels the selection keeps the user on home.
    priority: -10,
    headerAction: {
      id: HOME_ACTION_ID,
      icon: "house",
      ariaLabel: "Back to home",
    },
    showHome,
    showConversation,
    isHome,
    update: (next) => {
      options = { ...options, ...next };
      requestRender?.();
    },
    onSuggestionSelect: ({ surface }) => {
      if (surface !== "starter" || !isHome()) return;
      // Re-rendering mid-dispatch would drop the element being clicked, and the
      // send happens after this hook returns.
      queueMicrotask(leaveHome);
    },
    // No composer on home, matching Intercom: the composer belongs to the
    // conversation view. Returns a hidden footer while home is shown and
    // falls through to the default composer otherwise; `syncComposer()`
    // rebuilds it whenever welcome arbitration flips the view.
    renderComposer: ({ storage, requestRender: request }) => {
      composerRequestRender = request;
      if (!viewStorage) viewStorage = storage;
      const hide = homeShown ?? isHome();
      composerHidden = hide;
      if (!hide) return null;
      const footer = document.createElement("div");
      footer.className = "persona-widget-footer";
      footer.style.display = "none";
      footer.setAttribute("data-persona-home-composer-hidden", "");
      return footer;
    },
    renderWelcome: ({
      config,
      visible,
      sendMessage,
      renderStarter,
      requestRender: request,
      storage,
      onCleanup,
    }) => {
      requestRender = request;
      viewStorage = storage;
      const view = storage.get(VIEW_KEY);
      // Restored history opens on the transcript: home never covers a
      // conversation it did not start. `showHome()` overrides by writing "home".
      if (view === "chat" || (view === null && !visible)) {
        homeShown = false;
        syncComposer();
        return null;
      }
      homeShown = true;
      syncComposer();

      const root = el("div", "persona-home");
      injectStyles(root, "persona-home-screen-plugin", HOME_SCREEN_CSS);

      const greeting = el("header", "persona-home__greeting");
      const heading = document.createElement("div");
      heading.appendChild(el("h2", "persona-home__title", config.title));
      if (config.subtitle) {
        heading.appendChild(
          el("p", "persona-home__subtitle", config.subtitle),
        );
      }
      greeting.append(buildAvatar(options.avatar), heading);

      const start = buildRow(
        "button",
        "persona-home__start",
        options.startLabel ?? "Start a conversation",
        options.startHint ?? "We usually reply in a few minutes",
        "→",
      ) as HTMLButtonElement;
      // A teaser that failed to load never blocks starting a conversation.
      const startSection = el("section", "persona-home__section");
      startSection.appendChild(start);
      const onStart = options.onStartConversation;
      // The re-enabled, refocused start card is the retry affordance, so the
      // error note is a status line rather than a competing button.
      const handleStart = onStart
        ? () =>
            runAction(start, onStart, showConversation, () => {
              startSection.querySelector(".persona-home__error")?.remove();
              startSection.appendChild(
                buildErrorNote(
                  "persona-home__error",
                  options.startErrorLabel ??
                    "Couldn't start a conversation. Try again.",
                ),
              );
            })
        : leaveHome;
      start.addEventListener("click", handleStart);
      onCleanup(() => start.removeEventListener("click", handleStart));

      const sections: HTMLElement[] = [greeting, startSection];

      // Recent conversations sit directly below the start card and before the
      // starter/card/link sections.
      const recentSection = buildRecentSection(options, showConversation);
      if (recentSection) sections.push(recentSection);

      const starters = options.starters ?? [];
      if (starters.length) {
        const section = el("section", "persona-home__section");
        section.appendChild(
          el(
            "p",
            "persona-home__section-label",
            options.startersLabel ?? "Popular questions",
          ),
        );
        const list = el("div", "persona-home__starters");
        // Through `ctx.renderStarter`, so selection hooks, cancelable events,
        // and send/fill semantics all still apply.
        starters.forEach((starter) => list.appendChild(renderStarter(starter)));
        section.appendChild(list);
        sections.push(section);
      }

      const cards = options.cards ?? [];
      if (cards.length) {
        const section = el("section", "persona-home__section");
        section.appendChild(
          el(
            "p",
            "persona-home__section-label",
            options.cardsLabel ?? "What is new",
          ),
        );
        cards.forEach((card) => {
          const isLink = !!card.href;
          const node = el(isLink ? "a" : "button", "persona-home__card");
          if (isLink) {
            const anchor = node as HTMLAnchorElement;
            anchor.href = card.href!;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
          } else {
            (node as HTMLButtonElement).type = "button";
          }
          const copy = el("span", "persona-home__copy");
          copy.appendChild(el("span", "persona-home__label", card.title));
          if (card.body) {
            copy.appendChild(el("span", "persona-home__hint", card.body));
          }
          node.appendChild(copy);
          if (card.actionLabel) {
            node.appendChild(
              el(
                "span",
                "persona-home__card-action",
                `${card.actionLabel} →`,
              ),
            );
          }
          if (!isLink && card.prompt) {
            const ask = () => {
              sendMessage(card.prompt!);
              leaveHome();
            };
            node.addEventListener("click", ask);
            onCleanup(() => node.removeEventListener("click", ask));
          }
          node.dataset.cardId = card.id;
          section.appendChild(node);
        });
        sections.push(section);
      }

      const links = options.links ?? [];
      if (links.length) {
        const section = el("section", "persona-home__section");
        section.appendChild(
          el(
            "p",
            "persona-home__section-label",
            options.linksLabel ?? "Helpful links",
          ),
        );
        const list = el("ul", "persona-home__links");
        links.forEach((link) => {
          const item = document.createElement("li");
          const anchor = buildRow(
            "a",
            "persona-home__link",
            link.label,
            link.description,
            "↗",
          ) as HTMLAnchorElement;
          anchor.href = link.href;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.dataset.linkId = link.id;
          item.appendChild(anchor);
          list.appendChild(item);
        });
        section.appendChild(list);
        sections.push(section);
      }

      root.append(...sections);
      animateEntrance(sections);
      return root;
    },
  };
};
