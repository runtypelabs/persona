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
};

export type HomeScreenPlugin = AgentWidgetPlugin & {
  /** Spread into `layout.header.trailingActions`; pair with `onAction`. */
  headerAction: { id: string; icon: string; ariaLabel: string };
  /** Re-show the stack over the transcript. */
  showHome: () => void;
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
      );
      start.addEventListener("click", leaveHome);
      onCleanup(() => start.removeEventListener("click", leaveHome));

      const sections: HTMLElement[] = [greeting, start];

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
