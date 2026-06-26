import "@runtypelabs/persona/widget.css";
import "./home.css";
import "./command-palette.css";

import {
  createAgentExperience,
  createLocalStorageAdapter,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG
} from "@runtypelabs/persona";
import {
  createPersonaCommandItems,
  installCommandPalette,
} from "./command-palette";
import { GALLERY_EXAMPLES } from "./examples-nav";
import { STANDALONE_EXAMPLES } from "./standalone-nav";
import { editorialWidgetTheme } from "./editorial-widget-theme";

installCommandPalette({
  trigger: document.querySelector<HTMLElement>("[data-command-palette-trigger]"),
  items: createPersonaCommandItems({
    advancedExamples: GALLERY_EXAMPLES,
    standaloneExamples: STANDALONE_EXAMPLES,
    currentPath: window.location.pathname,
    includeHomeSections: true,
  }),
  title: "Search Persona",
  subtitle: "Jump to pages, demos, examples, and homepage sections.",
  placeholder: "Search Persona...",
});

/** Storage key scoped to this index demo so it does not collide with other demos. */
const sharedWidgetStorage = createLocalStorageAdapter("persona-state-index-demo");

// ---------------------------------------------------------------------------
// Code block copy button postprocessor
// ---------------------------------------------------------------------------
/**
 * Wraps fenced code blocks (<pre>) with a header containing a copy button.
 * While streaming, shows a disabled "Generating…" label instead of "Copy".
 */
const codeBlockCopyPostprocessor = (text: string, streaming: boolean): string => {
  let html = markdownPostprocessor(text);
  // Wrap each <pre>…</pre> with a container + header
  html = html.replace(/<pre><code(?:\s+class="language-(\w+)")?>/g, (_match, lang?: string) => {
    const label = lang ?? "";
    const btnLabel = streaming ? "Generating\u2026" : "Copy";
    const disabledAttr = streaming ? " disabled" : "";
    const extraClass = streaming ? " persona-code-copy-generating" : "";
    return (
      `<div class="persona-code-block-wrapper">` +
      `<div class="persona-code-block-header">` +
      `<span>${label}</span>` +
      `<button type="button" class="persona-code-copy-btn${extraClass}" title="Copy code"${disabledAttr}>` +
      `<span class="persona-code-copy-label">${btnLabel}</span>` +
      `</button>` +
      `</div>` +
      `<pre><code${lang ? ` class="language-${lang}"` : ""}>`
    );
  });
  html = html.replace(/<\/code><\/pre>/g, `</code></pre></div>`);
  return html;
};

/**
 * Delegated click handler for code copy buttons inside shadow DOM.
 * Native click events cross shadow boundaries via composedPath().
 */
const setupCodeCopyHandler = (root: HTMLElement) => {
  root.addEventListener("click", (e) => {
    const path = e.composedPath();
    // Find the copy button in the composed path (works across shadow DOM)
    const btn = path.find(
      (el) => el instanceof HTMLElement && el.classList.contains("persona-code-copy-btn")
    ) as HTMLElement | undefined;
    if (!btn) return;

    // Walk up the composed path to find the wrapper div
    const wrapper = path.find(
      (el) => el instanceof HTMLElement && el.classList.contains("persona-code-block-wrapper")
    ) as HTMLElement | undefined;
    const codeEl = wrapper?.querySelector("pre code");
    if (!codeEl) return;

    navigator.clipboard.writeText(codeEl.textContent ?? "").then(() => {
      const label = btn.querySelector(".persona-code-copy-label");
      if (label) label.textContent = "Copied!";
      btn.classList.add("persona-code-copied");
      setTimeout(() => {
        if (label) label.textContent = "Copy";
        btn.classList.remove("persona-code-copied");
      }, 2000);
    });
  });
};

const homeDemoSuggestionChips = [
  "What is Persona and how does it work?",
  "How does streaming work?",
  "What can I customize?",
  "How do I add a chat widget to my website?",
  "What do I tell my AI coding agent to use this?"
] as const;


const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL ?
    `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-docs` :
    `http://localhost:${proxyPort}/api/chat/dispatch-docs`;

const homeDemoWelcomeTitle = "Welcome to Persona";
const homeDemoWelcomeSubtitle =
  "This is a customized Persona instance that can chat about Persona. It's hooked up to our wiki.  Neat, right?";
const homeDemoInputPlaceholder = "Ask away...";

/** Shared welcome copy for the inline embed. */
const homeDemoSharedAssistant = {
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: homeDemoWelcomeTitle,
    welcomeSubtitle: homeDemoWelcomeSubtitle,
    inputPlaceholder: homeDemoInputPlaceholder,
  },
};

/** One prefix for both widgets so sessionStorage open/voice prefs are not split. */
const homeDemoPersistKeyPrefix = "persona-home-demo-";

const inlineMount = document.getElementById("inline-widget");
if (!inlineMount) {
  throw new Error("Inline widget mount node missing");
}

// Shared widget config for both mount modes; mountWidget() merges in the
// per-mode launcher/layout bits below.
const sharedWidgetConfig: NonNullable<
  Parameters<typeof createAgentExperience>[1]
> = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  ...homeDemoSharedAssistant,
  // Match the page's editorial/terminal design: paper surfaces, square
  // corners, ink text, teal accents, mono/Geist type. Shared so embedded
  // widgets on demo pages read identically to this rail.
  theme: editorialWidgetTheme,
  statusIndicator: {
    idleText: "Powered by Runtype",
    idleLink: "https://runtype.com",
    align: "center",
  },
  features: {
    showEventStreamToggle: true,
    // ChatGPT-style: pin the sent message near the top and let the reply stream
    // into the space below (opt-in; the library default is still "follow").
    scrollBehavior: { mode: "anchor-top" }
  },
  // Read aloud uses Runtype-hosted TTS (provider: 'runtype'): the button
  // streams audio from Runtype's per-agent `/speak` endpoint. This demo talks
  // to a proxy with no clientToken/agentId, so `browserFallback` transparently
  // speaks with the OS voice today and auto-upgrades to the Runtype voice once a
  // real clientToken + agentId (and the endpoint) are wired in. `enabled: false`
  // keeps auto-speak off — only the per-message button uses the engine.
  textToSpeech: {
    enabled: false,
    provider: "runtype",
    browserFallback: true,
  },
  messageActions: {
    ...DEFAULT_WIDGET_CONFIG.messageActions,
    showReadAloud: true,
  },
  persistState: {
    keyPrefix: homeDemoPersistKeyPrefix
  },
  storageAdapter: sharedWidgetStorage,
  suggestionChips: [...homeDemoSuggestionChips],
  postprocessMessage: ({ text, streaming }) => codeBlockCopyPostprocessor(text, streaming)
};

// On small screens the docked rail takes over the page (a tall, full-width
// panel below the content), so swap it for the widget's floating launcher. We
// re-mount whenever the viewport crosses the breakpoint; chat history survives
// the swap via the shared persistState keyPrefix + storage adapter.
const chatRailEl = document.querySelector<HTMLElement>(".chat-rail");
const mobileQuery = window.matchMedia("(max-width: 760px)");

let inlineController: ReturnType<typeof createAgentExperience> | null = null;
let launcherRoot: HTMLElement | null = null;

function mountWidget(mobile: boolean) {
  // Tear down the previous instance and any mode-specific DOM first.
  inlineController?.destroy();
  inlineController = null;
  if (launcherRoot) {
    launcherRoot.remove();
    launcherRoot = null;
  }

  let mount: HTMLElement;
  if (mobile) {
    if (chatRailEl) chatRailEl.style.display = "none";
    // Strip leftover widget markers from the embedded mount we're not using, so
    // the launcher is the only [data-persona-root] on the page.
    inlineMount.replaceChildren();
    inlineMount.removeAttribute("data-persona-root");
    inlineMount.removeAttribute("data-persona-instance");
    launcherRoot = document.createElement("div");
    launcherRoot.id = "home-launcher-root";
    document.body.appendChild(launcherRoot);
    mount = launcherRoot;
  } else {
    if (chatRailEl) chatRailEl.style.display = "";
    inlineMount.replaceChildren();
    mount = inlineMount;
  }

  inlineController = createAgentExperience(mount, {
    ...sharedWidgetConfig,
    // Desktop embeds into the page's chat rail (which supplies its own
    // terminal-style header). Mobile shows a floating launcher with the
    // widget's own header instead.
    ...(mobile
      ? {
          launcher: {
            ...DEFAULT_WIDGET_CONFIG.launcher,
            enabled: true,
            position: "bottom-right" as const,
            width: "min(440px, 95vw)",
            title: "Persona in action",
            subtitle: "Ask the docs agent anything",
            callToActionIconColor: "#006b5b",
            callToActionIconBackgroundColor: "transparent",
            iconUrl: "/persona-js-icon.svg",
            agentIconName: "",
          },
        }
      : {
          layout: { showHeader: false },
          launcher: {
            ...DEFAULT_WIDGET_CONFIG.launcher,
            width: "100%",
            enabled: false,
            fullHeight: true,
          },
        }),
  });
}

mountWidget(mobileQuery.matches);
mobileQuery.addEventListener("change", (e) => mountWidget(e.matches));

// Code-block copy works in either mode: bind once to <body> (both the embedded
// mount and the floating launcher live inside it) so re-mounting never
// double-binds the handler.
setupCodeCopyHandler(document.body);

// Rail header clear-chat button (only visible in the desktop embedded rail);
// bound once and always targets the current controller.
document
  .querySelector<HTMLButtonElement>("[data-rail-clear]")
  ?.addEventListener("click", () => inlineController?.clearChat());

// ---------------------------------------------------------------------------
// Hero 3D Carousel
// ---------------------------------------------------------------------------

function initHeroCarousel() {
  const scene = document.querySelector('.carousel-3d-scene') as HTMLElement | null;
  if (!scene) return;

  const cards = Array.from(scene.querySelectorAll('.carousel-3d-card')) as HTMLElement[];
  if (!cards.length) return;

  const VISIBLE = 5;
  const CYCLE_MS = 4000;
  const stack = [...cards];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = false;
  let cycling = false;
  let inView = true;

  const container = scene.closest('.carousel-3d') as HTMLElement | null;
  const dotsMount = container?.querySelector('[data-carousel-dots]') as HTMLElement | null;
  const status = container?.querySelector('[data-carousel-status]') as HTMLElement | null;
  const cardTitle = (card: HTMLElement) =>
    card.querySelector('.carousel-3d-card-title')?.textContent?.trim() || 'Demo';

  // Defer offscreen card iframes until the page has finished loading so the
  // front card (and the rest of the page) wins the bandwidth race.
  function hydrateDeferredIframes() {
    scene!.querySelectorAll('iframe[data-src]').forEach((el) => {
      const frame = el as HTMLIFrameElement;
      frame.src = frame.dataset.src!;
      frame.removeAttribute('data-src');
    });
  }
  if (document.readyState === 'complete') {
    hydrateDeferredIframes();
  } else {
    window.addEventListener('load', () => setTimeout(hydrateDeferredIframes, 250), { once: true });
  }

  function applyStyle(card: HTMLElement, i: number) {
    const p = Math.min(i, VISIBLE);
    card.style.transform = `translateX(${p * 16}px) translateY(${p * 4}px) rotate(${p * 0.8}deg)`;
    card.style.opacity = i >= VISIBLE ? '0' : i >= 4 ? '0.5' : i >= 3 ? '0.7' : '1';
    card.style.zIndex = i >= VISIBLE ? '0' : String(cards.length - i);
    // Only the front card participates in the tab order; back cards act as
    // bring-to-front controls for pointer users.
    const link = card.querySelector('.carousel-3d-card-link') as HTMLAnchorElement | null;
    if (link) link.tabIndex = i === 0 ? 0 : -1;
    card.classList.toggle('is-front', i === 0);
  }

  // Dots: one per card, in original DOM order; clicking brings that card forward.
  const dots: HTMLButtonElement[] = [];
  if (dotsMount) {
    cards.forEach((card) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel-3d-dot';
      dot.setAttribute('aria-label', `Show ${cardTitle(card)} demo`);
      dot.addEventListener('click', () => {
        goToCard(stack.indexOf(card));
        resetAutoAdvance();
      });
      dotsMount.appendChild(dot);
      dots.push(dot);
    });
  }

  function syncUi() {
    const front = stack[0];
    const frontIdx = cards.indexOf(front);
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === frontIdx);
      if (i === frontIdx) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    if (status) status.textContent = `${cardTitle(front)} demo, ${frontIdx + 1} of ${cards.length}`;
  }

  function applyAll() {
    stack.forEach((card, i) => applyStyle(card, i));
    syncUi();
  }

  // Start (or restart) the front card's approach animation, honoring an
  // in-progress hover pause: the stack can rotate while the pointer stays
  // over the carousel, and the new front card must come up already paused.
  function startApproach() {
    stack[0].classList.add('is-approaching');
    stack[0].style.animationPlayState = paused ? 'paused' : 'running';
  }

  applyAll();
  if (!reducedMotion) startApproach();

  if (container && !reducedMotion) {
    container.addEventListener('mouseenter', () => {
      paused = true;
      stack[0].style.animationPlayState = 'paused';
    });
    container.addEventListener('mouseleave', () => {
      paused = false;
      stack[0].style.animationPlayState = 'running';
    });
    // Don't burn cycles animating a carousel the visitor has scrolled past.
    const visibility = new IntersectionObserver((entries) => {
      inView = entries[0]?.isIntersecting ?? true;
    });
    visibility.observe(container);
  }

  function finishCycle() {
    cycling = false;
    if (!pendingTarget) return;
    const queued = pendingTarget;
    pendingTarget = null;
    const pos = stack.indexOf(queued);
    if (pos > 0) goToCard(pos);
  }

  function settleAfter(ms: number, fn: () => void) {
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(fn);
      });
    }, ms);
  }

  // Bring the card currently at stack position `targetPos` to the front. The
  // cards in front of it peel away together; the rest slide up the stack.
  // Requests that land mid-transition are queued (the click's default was
  // already prevented, so dropping them would swallow the click entirely).
  let pendingTarget: HTMLElement | null = null;
  function goToCard(targetPos: number) {
    if (targetPos <= 0 || targetPos >= stack.length) return;
    if (cycling) {
      pendingTarget = stack[targetPos];
      return;
    }

    if (reducedMotion) {
      stack.push(...stack.splice(0, targetPos));
      applyAll();
      return;
    }

    cycling = true;
    const peeled = stack.slice(0, targetPos);

    peeled.forEach((card, i) => {
      card.classList.remove('is-approaching');
      // Hand off front-card status immediately: a peeling card must not keep
      // the is-front affordance or sit in the tab order for the 700ms flight.
      card.classList.remove('is-front');
      const link = card.querySelector('.carousel-3d-card-link') as HTMLAnchorElement | null;
      if (link) link.tabIndex = -1;
      const computed = getComputedStyle(card).transform;
      card.style.transform = computed;
      void card.offsetWidth;
      card.style.transition = `transform 0.6s var(--ease-smooth), opacity 0.6s var(--ease-smooth)`;
      card.style.transform = 'translateX(-60px) translateY(-30px) rotate(-2deg) scale(0.96)';
      card.style.opacity = '0';
      card.style.zIndex = String(cards.length + peeled.length - i);
    });

    stack.push(...stack.splice(0, targetPos));
    for (let i = 0; i < stack.length; i++) {
      if (peeled.includes(stack[i])) continue;
      stack[i].style.transition = '';
      applyStyle(stack[i], i);
    }

    settleAfter(700, () => {
      peeled.forEach((card) => {
        card.style.transition = 'none';
        card.style.animationPlayState = '';
        applyStyle(card, stack.indexOf(card));
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          peeled.forEach((card) => {
            card.style.transition = '';
          });
          startApproach();
          finishCycle();
        });
      });
    });
    syncUi();
  }

  function cycleForward() {
    if (cycling && pendingTarget) return;
    goToCard(1);
  }

  function cycleBackward() {
    if (cycling) return;

    if (reducedMotion) {
      stack.unshift(stack.pop()!);
      applyAll();
      return;
    }

    cycling = true;
    stack[0].classList.remove('is-approaching');

    const incoming = stack.pop()!;
    stack.unshift(incoming);

    incoming.style.transition = 'none';
    incoming.style.transform = 'translateX(80px) translateY(20px) rotate(3deg)';
    incoming.style.opacity = '0';
    incoming.style.zIndex = String(cards.length + 1);
    void incoming.offsetWidth;

    incoming.style.transition = `transform 0.6s var(--ease-smooth), opacity 0.6s var(--ease-smooth)`;
    applyStyle(incoming, 0);

    for (let i = 1; i < stack.length; i++) {
      stack[i].style.transition = '';
      applyStyle(stack[i], i);
    }

    settleAfter(700, () => {
      startApproach();
      finishCycle();
    });
    syncUi();
  }

  let autoId: ReturnType<typeof setInterval> | undefined;
  function resetAutoAdvance() {
    if (reducedMotion) return;
    clearInterval(autoId);
    autoId = setInterval(() => {
      if (!paused && !cycling && inView && !document.hidden) cycleForward();
    }, CYCLE_MS);
  }
  resetAutoAdvance();

  container?.querySelector('[data-carousel-prev]')?.addEventListener('click', () => {
    cycleBackward();
    resetAutoAdvance();
  });
  container?.querySelector('[data-carousel-next]')?.addEventListener('click', () => {
    cycleForward();
    resetAutoAdvance();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;

    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
    // Roving-tabindex widgets (e.g. the Quick Start tabs) own the arrow keys
    // while focused: don't page the carousel on the same keypress.
    if (target?.closest('[role="tablist"], [role="tab"]')) return;

    const lightbox = document.getElementById('demo-lightbox') as HTMLDialogElement;
    if (lightbox?.open) return;

    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;

    if (e.key === 'ArrowRight') {
      cycleForward();
    } else {
      cycleBackward();
    }
    resetAutoAdvance();
  });

  // Expose stack order so the lightbox can tell front cards from back cards.
  (window as Window & { __heroCarouselStack?: HTMLElement[] }).__heroCarouselStack = stack;
  (window as Window & { __heroCarouselGoTo?: (pos: number) => void }).__heroCarouselGoTo = (pos) => {
    goToCard(pos);
    resetAutoAdvance();
  };
}

initHeroCarousel();

// ---------------------------------------------------------------------------
// Demo Lightbox
// ---------------------------------------------------------------------------

function initDemoLightbox() {
  const lightbox = document.getElementById('demo-lightbox') as HTMLDialogElement | null;
  if (!lightbox) return;

  const iframe = lightbox.querySelector('.demo-lightbox-iframe') as HTMLIFrameElement;
  let closedByPopstate = false;

  const openLightbox = (href: string, title: string) => {
    iframe.src = href;
    iframe.title = title || 'Demo preview';
    lightbox.showModal();
    history.pushState({ demoLightbox: true }, '');
  };

  document.querySelectorAll('.carousel-3d-card-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();

      // Clicking a back card brings it to the front instead of opening it:
      // its visible edge reads as a "next card" affordance, not a link.
      const card = link.closest('.carousel-3d-card') as HTMLElement | null;
      const win = window as Window & {
        __heroCarouselStack?: HTMLElement[];
        __heroCarouselGoTo?: (pos: number) => void;
      };
      if (card && win.__heroCarouselStack && win.__heroCarouselGoTo) {
        const pos = win.__heroCarouselStack.indexOf(card);
        if (pos > 0) {
          win.__heroCarouselGoTo(pos);
          return;
        }
      }

      const anchor = link as HTMLAnchorElement;
      openLightbox(anchor.href, link.querySelector('.carousel-3d-card-title')?.textContent || 'Demo preview');
    });
  });

  // Layout-mode "Open demo" buttons reuse the same modal instead of navigating
  // away. The href stays a real link, so it still works without JS.
  document.querySelectorAll<HTMLAnchorElement>('[data-demo-lightbox]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openLightbox(link.href, link.dataset.demoTitle || link.textContent?.trim() || 'Demo preview');
    });
  });

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) lightbox.close();
  });

  lightbox.querySelector('.demo-lightbox-close')?.addEventListener('click', () => lightbox.close());

  window.addEventListener('popstate', () => {
    if (lightbox.open) {
      closedByPopstate = true;
      lightbox.close();
    }
  });

  lightbox.addEventListener('close', () => {
    iframe.src = '';
    // Only rewind if the lightbox entry is still the active one: the visitor
    // may have navigated (e.g. a hash link) while the modal was open, and
    // history.back() would undo that navigation instead.
    const state = history.state as { demoLightbox?: boolean } | null;
    if (!closedByPopstate && state?.demoLightbox) history.back();
    closedByPopstate = false;
  });
}

initDemoLightbox();
