/**
 * Tweet embed — a self-contained Persona embed "plugin" (demo code sample).
 * ---------------------------------------------------------------------------
 * Renders an X/Twitter post inside the transcript with a height-reserving
 * skeleton, then swaps in the real embed once X's widgets.js resolves. Use it
 * as a template for any *async third-party embed* (YouTube, Spotify, CodePen,
 * Figma…): only three things change per provider — the loader script, the
 * "render into this node and tell me when ready" call, and the reserved height.
 *
 * WHY THE COMPONENTS MECHANISM (and not a `renderMessage` plugin)?
 * An X embed is an <iframe> that hydrates *asynchronously*. Persona morphs the
 * transcript with idiomorph on every streamed token. The `renderMessage` plugin
 * hook returns a node that idiomorph clones via `importNode` on each pass —
 * which (a) drops the async-mounted iframe and (b) reloads any iframe it does
 * copy. The `components` directive path is purpose-built for live/interactive
 * content: it stub-and-hydrates the *live* element and marks it
 * `data-preserve-runtime`, so the iframe is injected once and never re-morphed.
 * That is the right primitive for embeds — hence this ships as a `components`
 * entry plus an `inject()` helper, not a `renderMessage` plugin.
 *
 * Usage:
 *   const tweets = createTweetEmbedPlugin();
 *   createAgentExperience(mount, { ...config, components: tweets.components });
 *   tweets.inject(controller, { url: "https://x.com/user/status/123" });
 */

import type {
  AgentWidgetComponentRenderer,
  AgentWidgetController,
} from "@runtypelabs/persona";

export type TweetEmbedOptions = {
  /**
   * Reserved skeleton height (px) before the embed hydrates. X posts measure
   * ~417px at typical widths and grow taller when narrow or when they carry
   * media; 440 is a good text-post default. The box only ever grows to the
   * real height, never shrinks below this.
   * @default 440
   */
  reservedHeightPx?: number;
  /** Component name registered in `config.components`. @default "Tweet" */
  componentName?: string;
  /** How long to wait for hydration before showing the fallback link. @default 8000 */
  timeoutMs?: number;
  /**
   * Embed color scheme passed to X. `"auto"` follows the OS `prefers-color-scheme`.
   * @default "auto"
   */
  theme?: "light" | "dark" | "auto";
};

export type TweetEmbedProps = {
  /** Full post URL, e.g. https://x.com/user/status/123. */
  url: string;
  /** Optional explicit status id; derived from `url` when omitted. */
  tweetId?: string;
};

export type TweetEmbedHandle = {
  /** Spread into the widget config's `components` map. */
  components: Record<string, AgentWidgetComponentRenderer>;
  /** Inject a tweet into the transcript as an assistant component directive. */
  inject: (controller: AgentWidgetController, props: TweetEmbedProps) => void;
};

// ── X widgets.js loader (shared singleton) ──────────────────────────────────

type Twttr = {
  widgets?: {
    createTweet: (
      id: string,
      target: HTMLElement,
      options?: Record<string, unknown>,
    ) => Promise<HTMLElement | undefined>;
  };
};

declare global {
  interface Window {
    twttr?: Twttr;
  }
}

let scriptPromise: Promise<Twttr | undefined> | null = null;
function loadWidgets(): Promise<Twttr | undefined> {
  if (window.twttr?.widgets) return Promise.resolve(window.twttr);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://platform.twitter.com/widgets.js";
    s.async = true;
    s.onload = () => resolve(window.twttr);
    s.onerror = () => resolve(undefined);
    document.head.appendChild(s);
  });
  return scriptPromise;
}

const TWEET_ID_RE = /(?:status(?:es)?\/)(\d+)/;
function deriveId(url: string, explicit?: string): string | null {
  if (explicit) return explicit;
  const m = url.match(TWEET_ID_RE);
  return m ? m[1] : null;
}

// ── Self-injected styles (so the module is drop-in) ─────────────────────────
// The shimmer effect itself reuses the widget's `persona-shimmer-skeleton`
// utility (shipped in widget.css), which any Persona host already loads; these
// styles only handle layout/sizing of the placeholder.

const STYLE_ID = "persona-tweet-embed-styles";
function ensureStyles(reservedHeightPx: number): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.persona-tweet-embed { display:flex; justify-content:center; margin:0.25rem 0; }
/* Reserved height lives on the PERSISTENT card, not just the skeleton, so the
   space survives hydration with no shrink (only-grow). The card is the
   positioning context for the skeleton overlay. */
.persona-tweet-card { position:relative; width:100%; max-width:520px; min-height:${reservedHeightPx}px; }
.persona-tweet-card.is-fallback { min-height:0; }
@media (max-width:520px){ .persona-tweet-card { min-height:${reservedHeightPx + 80}px; } }
/* The real embed renders into this in-flow node (must be attached + on-screen
   so X's IntersectionObserver fires). The skeleton sits ON TOP as an opaque
   absolute overlay and is removed once the embed reports ready — no detached
   render, no node swap, so the embed appears already laid out. */
.persona-tweet-holder { width:100%; display:flex; justify-content:center; }
.persona-tweet-skeleton {
  position:absolute; inset:0; border:1px solid var(--border,#e5e7eb);
  border-radius:14px; padding:14px 16px; background:var(--paper,#fff);
  display:flex; flex-direction:column; gap:12px;
}
.persona-tweet-skeleton .sk-head { display:flex; align-items:center; gap:10px; }
/* The shimmer itself comes from the widget's reusable .persona-shimmer-skeleton
   utility (widget.css); these rules only size each placeholder bar. */
.persona-tweet-skeleton .sk-avatar { width:44px; height:44px; border-radius:50%; flex-shrink:0; }
.persona-tweet-skeleton .sk-line { height:11px; }
.persona-tweet-skeleton .sk-media { flex:1; min-height:180px; border-radius:12px; margin-top:2px; }
.persona-tweet-skeleton .sk-foot { color:var(--muted,#6b7280); font-size:0.72rem; margin-top:2px; }
.persona-tweet-fallback {
  min-height:120px; display:flex; align-items:center; justify-content:center; text-align:center;
  border:1px solid var(--border,#e5e7eb); border-radius:14px; padding:16px; font-size:0.85rem;
}
`;
  document.head.appendChild(style);
}

// ── DOM builders ────────────────────────────────────────────────────────────

const el = (tag: string, className?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

function buildSkeleton(): HTMLElement {
  const sk = el("div", "persona-tweet-skeleton");
  sk.setAttribute("role", "status");
  sk.setAttribute("aria-label", "Loading post from X");
  const line = (w: string) => {
    const l = el("div", "sk-line persona-shimmer-skeleton");
    l.style.width = w;
    return l;
  };
  const head = el("div", "sk-head");
  const headLines = el("div");
  headLines.style.cssText = "flex:1;display:flex;flex-direction:column;gap:6px";
  headLines.append(line("45%"), line("28%"));
  head.append(el("div", "sk-avatar persona-shimmer-skeleton"), headLines);
  const body = el("div");
  body.style.cssText = "display:flex;flex-direction:column;gap:8px";
  body.append(line("96%"), line("90%"), line("74%"));
  const foot = el("div", "sk-foot");
  foot.textContent = "Loading post from X…";
  sk.append(head, body, el("div", "sk-media persona-shimmer-skeleton"), foot);
  return sk;
}

function buildFallback(url: string): HTMLElement {
  const fb = el("div", "persona-tweet-fallback");
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = "View this post on X →";
  fb.appendChild(a);
  return fb;
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createTweetEmbedPlugin(options: TweetEmbedOptions = {}): TweetEmbedHandle {
  const reservedHeightPx = options.reservedHeightPx ?? 440;
  const componentName = options.componentName ?? "Tweet";
  const timeoutMs = options.timeoutMs ?? 8000;
  const resolveTheme = (): "light" | "dark" => {
    const t = options.theme ?? "auto";
    if (t === "light" || t === "dark") return t;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const renderer: AgentWidgetComponentRenderer = (props) => {
    ensureStyles(reservedHeightPx);
    const url = typeof props.url === "string" ? props.url : "";
    const id = deriveId(url, typeof props.tweetId === "string" ? props.tweetId : undefined);

    const wrap = el("div", "persona-tweet-embed");
    const card = el("div", "persona-tweet-card");
    wrap.appendChild(card);

    if (!id) {
      card.classList.add("is-fallback");
      card.appendChild(buildFallback(url || "https://x.com"));
      return wrap;
    }

    // In-flow render target + skeleton overlay on top of it. X renders into the
    // *attached, on-screen* holder; the skeleton hides it until ready.
    const holder = el("div", "persona-tweet-holder");
    const skeleton = buildSkeleton();
    card.append(holder, skeleton);

    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      skeleton.remove();
      // Relax the reserved floor for the compact link card so a failed embed
      // doesn't leave a tall empty box.
      card.classList.add("is-fallback");
      holder.replaceChildren(buildFallback(url));
    };
    const timer = setTimeout(fallback, timeoutMs);

    loadWidgets().then((twttr) => {
      const widgets = twttr?.widgets;
      if (!widgets?.createTweet) {
        clearTimeout(timer);
        fallback();
        return;
      }
      // The directive hydrate path attaches this element synchronously during
      // render, so by the time this microtask runs the holder is already in the
      // live DOM — call createTweet directly. (Do NOT defer with rAF: it never
      // fires in a backgrounded tab, which would strand the embed on the
      // fallback.) X needs the target attached + on-screen for its observer.
      widgets
        .createTweet(id, holder, {
          conversation: "none",
          dnt: true,
          align: "center",
          theme: resolveTheme(),
        })
        .then((rendered) => {
          clearTimeout(timer);
          if (settled) return;
          if (rendered) {
            settled = true;
            // Reveal the already-laid-out embed by removing the overlay — no
            // node swap, so nothing jumps (a polished "keep your place").
            skeleton.remove();
          } else {
            fallback();
          }
        })
        .catch(() => {
          clearTimeout(timer);
          fallback();
        });
    });

    return wrap;
  };

  return {
    components: { [componentName]: renderer },
    inject(controller, props) {
      controller.injectComponentDirective({
        component: componentName,
        props: { url: props.url, tweetId: props.tweetId },
        text: "",
        llmContent: `[Embedded post: ${props.url}]`,
      });
    },
  };
}
