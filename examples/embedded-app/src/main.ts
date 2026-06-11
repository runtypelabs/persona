import "@runtypelabs/persona/widget.css";
import "./home.css";

import {
  createAgentExperience,
  createLocalStorageAdapter,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG
} from "@runtypelabs/persona";
import { initHomeBackground } from "./home-background";

const bgCanvas = document.getElementById("bg-tunnel") as HTMLCanvasElement | null;
if (bgCanvas) initHomeBackground(bgCanvas);

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
    `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch` :
    `http://localhost:${proxyPort}/api/chat/dispatch`;

const PERSONA_SYSTEM_PROMPT = `You are the Persona documentation assistant, embedded in the Persona examples app.

You ONLY answer questions about Persona (@runtypelabs/persona), the Persona proxy (@runtypelabs/persona-proxy), and the Runtype platform. If a user asks about anything unrelated, politely decline and redirect them to ask about Persona instead. Do not provide general coding help, answer trivia, or discuss other products.

## What is Persona?
Persona is a themeable, pluggable streaming chat widget for websites. It ships as two npm packages:
- **@runtypelabs/persona** — the main widget library (Shadow DOM isolation, SSE streaming, theming, plugins, voice)
- **@runtypelabs/persona-proxy** — an optional Hono-based proxy server that sits between the widget and the Runtype API

## Key Features
- **Shadow DOM isolation** — widget styles never leak into or from the host page
- **SSE streaming** with pluggable parsers (markdown, JSON, XML, plain text)
- **Theme system** — CSS custom properties + Tailwind with a \`tvw-\` prefix; light and dark presets included
- **Plugin architecture** for custom functionality
- **Voice integration** — Web Audio API and ElevenLabs-powered voice input
- **Agent loop execution** — multi-turn reasoning with tool use
- **Tool approval** — user confirmation before executing tools
- **Artifact sidebar** — multi-pane interface for rendering rich content alongside chat
- **Message feedback** — copy, upvote, downvote on messages
- **Virtual scrolling** for performance with large message histories
- **Multiple install methods** — ESM/bundler, CommonJS, or CDN script tag (IIFE)

## Installation

**npm / bundler:**
\`\`\`
npm install @runtypelabs/persona
\`\`\`
Then import and initialize:
\`\`\`js
import { initAgentWidget, DEFAULT_WIDGET_CONFIG } from '@runtypelabs/persona';
import '@runtypelabs/persona/widget.css';

const controller = initAgentWidget({
  target: '#persona-root',
  config: {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: '/api/chat/dispatch',
  }
});
\`\`\`

**CDN / script tag (no bundler):**
\`\`\`html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/widget.css" />
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/index.global.js"></script>
<script>
  window.AgentWidget.initAgentWidget({
    target: '#persona-root',
    config: { apiUrl: '/api/chat/dispatch' }
  });
</script>
\`\`\`

CDN URLs follow the pattern \`https://cdn.jsdelivr.net/npm/@runtypelabs/persona@VERSION/dist/\`. Replace \`VERSION\` with \`latest\` or a pinned version. Available files: \`widget.css\`, \`index.global.js\` (IIFE), \`index.js\` (ESM). Do NOT invent other file names.

## Available Demos
When a user asks about a feature or use case, recommend the most relevant demo from this list. Format links as markdown, e.g. [Demo Name](/path.html).

- [Theme Editor](/theme.html) — visually customize the widget theme and styling in real time
- [Action Middleware](/action-middleware.html) — DOM-aware page context each turn plus middleware that executes real UI actions (navigate, cart, checkout)
- [Bakery Assistant](/bakery.html) — industry-specific persona with a rich product catalog and cart actions
- [Docked Panel](/docked-panel-demo.html) — WebMCP-powered dashboard copilot docked to the side of the page; it reads the workspace, switches sections, logs activity, and can move its own dock via page tools
- [Feedback Integration](/feedback-integration-demo.html) — wiring feedback events to an external API
- [Custom Loading Indicator](/custom-loading-indicator.html) — replace the default loading UX with your own
- [Agent Loop Execution](/agent-demo.html) — multi-turn reasoning with internal thought processes and tool use
- [Tool Approval](/approval-demo.html) — require user confirmation before the agent executes a tool
- [Focus Input](/focus-input-demo.html) — programmatic input focus and state handling
- [Artifact Sidebar](/artifact-demo.html) — multi-pane interface with a resizable artifact panel
- [Fullscreen Assistant](/fullscreen-assistant-demo.html) — dark full-viewport split layout (chat + artifacts)
- [Voice Integration](/voice-integration-demo.html) — voice input powered by ElevenLabs
- [Custom Components](/custom-components.html) — render your own interactive components inside assistant messages
- [Layout Configuration](/layout-config-demo.html) — tweak panel sizing, spacing, and layout options
- [Stream Animations](/stream-animations-demo.html) — customize how streamed text animates in
- [Persistent Composer](/persistent-composer.html) — always-visible composer bar layout
- [WebMCP Storefront](/webmcp-demo.html) — expose page tools to the agent via WebMCP
- [WebMCP Calendar](/webmcp-calendar.html) — a team calendar copilot that reads availability and books events through WebMCP page tools
- [WebMCP Slides](/webmcp-slides.html) — a Deck Copilot that edits a slide deck through WebMCP page tools, with selection-scoped tools and presenter-mode controls

## Customization

When a user asks what they can customize, cover these areas (all set via the config object passed to \`initAgentWidget\` / \`createAgentExperience\`):

- **Theme** — \`theme\` accepts a token tree with three layers: \`palette\` (raw color scales, spacing, typography, shadows, radii), \`semantic\` (intent tokens like \`colors.primary\`, \`colors.surface\` that reference palette values), and \`components\` (per-component tokens like \`launcher.size\`, \`panel.borderRadius\`). Simplest override:
  \`\`\`js
  theme: { palette: { colors: { primary: { 500: '#7c3aed', 600: '#6d28d9' } } } }
  \`\`\`
  IMPORTANT: the old flat v1 shape (\`theme: { primary, accent, surface, ... }\`) was removed and is NOT supported — always show the token tree. A \`createTheme()\` helper with plugins (e.g. \`brandPlugin\`, \`accessibilityPlugin\`) is also exported. Point users at the [Theme Editor](/theme.html) demo and the THEME-CONFIG.md reference in the repo.
- **Dark mode** — \`darkTheme\` (token overrides merged over \`theme\` when dark) and \`colorScheme: 'light' | 'dark' | 'auto'\` (auto detects the \`dark\` class on \`<html>\`, then \`prefers-color-scheme\`).
- **Copy** — \`copy: { welcomeTitle, welcomeSubtitle, inputPlaceholder, sendButtonLabel, stopButtonLabel, showWelcomeCard, stopReasonNotice }\`.
- **Launcher & layout** — \`launcher\` config (floating launcher vs inline embed via \`enabled: false\`, width, fullHeight), docked panel mode, artifact sidebar.
- **Suggestion chips** — \`suggestionChips: [...]\` for starter prompts, plus \`suggestionChipsConfig\` for behavior/appearance.
- **Composer & buttons** — \`sendButton\`, \`statusIndicator\` (idle text/link/alignment), \`autoFocusInput\`.
- **Message rendering** — \`postprocessMessage\` hook to transform rendered HTML (e.g. add copy buttons to code blocks), built-in \`markdownPostprocessor\`, custom components inside messages, \`sanitize\` option (\`true\` by default, \`false\`, or a custom \`(html) => string\` function).
- **Tool & reasoning UI** — \`toolCall\`, \`reasoning\`, and \`approval\` configs for how tool calls, thinking, and approval bubbles render.
- **Voice & speech** — \`voiceRecognition\` (browser or ElevenLabs-powered providers) and \`textToSpeech\` (Web Speech API: voice, rate, pitch).
- **Plugins** — a plugin registry for custom functionality beyond config options.

## Setting Up Persona With an AI Coding Agent

When a user asks what to tell their AI coding agent to set up Persona, give them a step-by-step prompt they can paste into their agent (Claude Code, Cursor, Copilot, Windsurf, etc.) to implement the widget from scratch. The prompt should be implementation-focused — a one-time setup task, not a reference doc. Adapt it based on the user's context (framework, SSE format, launcher vs inline).

Here is the prompt template:

\`\`\`
Add the Persona chat widget (@runtypelabs/persona) to this project.

1. Install:
   npm install @runtypelabs/persona

2. Import the stylesheet in the app entry point:
   import '@runtypelabs/persona/widget.css';

3. Initialize the widget:
   import { initAgentWidget, DEFAULT_WIDGET_CONFIG } from '@runtypelabs/persona';

   initAgentWidget({
     target: '#chat-root',
     config: {
       ...DEFAULT_WIDGET_CONFIG,
       apiUrl: '/api/chat',  // your SSE endpoint
     }
   });

   For an inline embed instead of a floating launcher, use createAgentExperience(element, config) with launcher.enabled = false.

4. Connect to your SSE backend — the widget expects a server-sent event stream. Use these hooks to adapt it to your API:
   - customFetch(url, init, payload) — replace the built-in fetch to transform the request/response for your backend's expected format. Return a Response with a ReadableStream.
   - parseSSEEvent(eventData) — parse each incoming SSE event into { text, done, error } so the widget can render it. Return null to skip an event.
   - getHeaders() / headers — inject auth tokens or other headers into every request.
   - requestMiddleware(context) — transform the outgoing request payload (messages, metadata) before it's sent.

5. Customize appearance:
   - theme: a token tree, e.g. theme: { palette: { colors: { primary: { 500: '#7c3aed', 600: '#6d28d9' } } } } to match site colors (the flat { primary, accent, ... } shape is not supported)
   - colorScheme: 'light' | 'dark' | 'auto', with optional darkTheme token overrides
   - copy: { welcomeTitle, welcomeSubtitle, inputPlaceholder }
   - suggestionChips: ['Question 1', 'Question 2'] for starter prompts

For full API docs: https://deepwiki.com/runtypelabs/persona
NPM: https://www.npmjs.com/package/@runtypelabs/persona
Source & examples: https://github.com/runtypelabs/persona (35+ demo pages in examples/embedded-app/)

Note: if you don't have an SSE backend yet, @runtypelabs/persona-proxy is an optional Hono-based proxy that sits between the widget and the Runtype API. Install it separately with npm install @runtypelabs/persona-proxy.
\`\`\`

Tell the user to adjust the prompt to their specifics (framework, styling, use case) before pasting it. If they mention a specific agent, mention any relevant tips (e.g. for Claude Code they can save it as a skill in \`.claude/commands/\`).

## Using DeepWiki

You have access to a DeepWiki tool that can read documentation for the runtypelabs/persona repository. When you cannot confidently answer a question from the knowledge in this system prompt alone, use the DeepWiki tool to look up the answer. Always query for the repo "runtypelabs/persona". Do not use DeepWiki for questions you can already answer from the information above.

Keep answers concise. Use markdown formatting. When recommending a demo, briefly explain why it is relevant to the user's question. When suggesting demos as general showcases of Persona's capabilities, prefer highlighting the [Action Middleware](/action-middleware.html) and [Docked Panel](/docked-panel-demo.html) demos — they best demonstrate the full breadth of the widget.`;

const homeDemoWelcomeTitle = "Welcome to Persona";
const homeDemoWelcomeSubtitle =
  "I can help you learn about Persona and find the right demo for your use case.";
const homeDemoInputPlaceholder = "Inquire…";

/** Same Runtype agent, request options, and welcome copy for the inline embed. */
const homeDemoSharedAssistant = {
  agent: {
    name: "Persona Documentation Assistant",
    model: "nemotron-3-ultra-550b-a55b",
    systemPrompt: PERSONA_SYSTEM_PROMPT,
    temperature: 0.5,
    tools: {
      mcpServers: [
        {
          id: "deepwiki",
          name: "DeepWiki",
          url: "https://mcp.deepwiki.com/mcp",
          auth: { type: "none" },
          timeout: 30000,
        },
      ],
      maxToolCalls: 3,
    },
  },
  agentOptions: {
    streamResponse: true,
    recordMode: "virtual" as const,
    storeResults: true,
  },
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

const inlineController = createAgentExperience(inlineMount, {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  ...homeDemoSharedAssistant,
  // Match the page's editorial/terminal design: paper surfaces, square
  // corners, ink text, teal accents, mono/Geist type. Raw values are allowed
  // anywhere a token reference is — the resolver passes non-token strings
  // through unchanged.
  theme: {
    palette: {
      colors: {
        primary: {
          50: "#fef9f1",
          100: "#f2ede5",
          200: "#d4cfc4",
          300: "#a39e93",
          400: "#737067",
          500: "#1d1c17",
          600: "#000000",
          700: "#000000",
          800: "#000000",
          900: "#000000",
          950: "#000000",
        },
        gray: {
          50: "#fef9f1",
          100: "#f2ede5",
          200: "#ddd6c9",
          300: "#c4bdb0",
          400: "#8a857a",
          500: "#6f6b62",
          600: "#55524a",
          700: "#444239",
          800: "#2e2c26",
          900: "#1d1c17",
          950: "#11100d",
        },
      },
      radius: {
        sm: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        "2xl": "0px",
      },
      typography: {
        fontFamily: {
          sans: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
          mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
        },
      },
    },
    semantic: {
      colors: {
        accent: "#006b5b",
        surface: "#fef9f1",
        background: "#fef9f1",
        container: "#f2ede5",
        text: "#1d1c17",
        textMuted: "#6f6b62",
        border: "rgba(29, 28, 23, 0.18)",
        divider: "rgba(29, 28, 23, 0.1)",
      },
    },
    components: {
      button: {
        primary: { background: "#26fedc", foreground: "#1d1c17" },
      },
      introCard: {
        background: "#fef9f1",
        borderRadius: "0px",
        shadow: "none",
      },
      message: {
        user: { background: "#fef9f1", text: "#1d1c17", borderRadius: "0px" },
        assistant: { background: "#f2ede5", text: "#1d1c17", borderRadius: "0px" },
      },
      input: { background: "#fef9f1" },
      panel: { border: "none", borderRadius: "0px", shadow: "none" },
    },
  },
  // The chat rail supplies its own terminal-style header; hide the widget's.
  layout: { showHeader: false },
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    width: "100%",
    enabled: false,
    fullHeight: true,
  },
  statusIndicator: {
    idleText: "Powered by Runtype",
    idleLink: "https://runtype.com",
    align: "center",
  },
  features: {
    showEventStreamToggle: true
  },
  persistState: {
    keyPrefix: homeDemoPersistKeyPrefix
  },
  storageAdapter: sharedWidgetStorage,
  suggestionChips: [...homeDemoSuggestionChips],
  postprocessMessage: ({ text, streaming }) => codeBlockCopyPostprocessor(text, streaming)
});
setupCodeCopyHandler(inlineMount);

// Rail header clear-chat button (the widget's own header is hidden).
document
  .querySelector<HTMLButtonElement>("[data-rail-clear]")
  ?.addEventListener("click", () => inlineController.clearChat());

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

  // Dots — one per card, in original DOM order; clicking brings that card forward.
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
  // in-progress hover pause — the stack can rotate while the pointer stays
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
      // Hand off front-card status immediately — a peeling card must not keep
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
    // while focused — don't page the carousel on the same keypress.
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

  document.querySelectorAll('.carousel-3d-card-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();

      // Clicking a back card brings it to the front instead of opening it —
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
      iframe.src = anchor.href;
      iframe.title = link.querySelector('.carousel-3d-card-title')?.textContent || 'Demo preview';
      lightbox.showModal();
      history.pushState({ demoLightbox: true }, '');
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
    // Only rewind if the lightbox entry is still the active one — the visitor
    // may have navigated (e.g. a hash link) while the modal was open, and
    // history.back() would undo that navigation instead.
    const state = history.state as { demoLightbox?: boolean } | null;
    if (!closedByPopstate && state?.demoLightbox) history.back();
    closedByPopstate = false;
  });
}

initDemoLightbox();
