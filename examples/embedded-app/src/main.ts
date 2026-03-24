import "@runtypelabs/persona/widget.css";
import "./index.css";
import "./App.css";

import type { DeepPartial, PersonaTheme } from "@runtypelabs/persona";
import {
  initAgentWidget,
  createAgentExperience,
  createLocalStorageAdapter,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG
} from "@runtypelabs/persona";

/** Same key as the widget default — shared with other embedded-app pages that use persisted chat. */
const sharedWidgetStorage = createLocalStorageAdapter("persona-state");

// ---------------------------------------------------------------------------
// Code block copy button postprocessor
// ---------------------------------------------------------------------------
/**
 * Wraps fenced code blocks (<pre>) with a header containing a copy button.
 * Uses text labels instead of SVG icons to survive DOMPurify sanitization.
 */
const codeBlockCopyPostprocessor = (text: string): string => {
  let html = markdownPostprocessor(text);
  // Wrap each <pre>…</pre> with a container + header
  html = html.replace(/<pre><code(?:\s+class="language-(\w+)")?>/g, (_match, lang?: string) => {
    const label = lang ?? "";
    return (
      `<div class="persona-code-block-wrapper">` +
      `<div class="persona-code-block-header">` +
      `<span>${label}</span>` +
      `<button type="button" class="persona-code-copy-btn" title="Copy code">` +
      `<span class="persona-code-copy-label">Copy</span>` +
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

const inlineDemoTheme: DeepPartial<PersonaTheme> = {
  palette: {
    colors: {
      primary: { 500: "#0f172a" },
      accent: { 600: "#ea580c" },
      gray: {
        50: "#f8fafc",
        // 100: "#eaedf1",
        200: "#e4e8ee",
        500: "#64748b"
      }
    }
  },
  semantic: {
    colors: {
      primary: "palette.colors.primary.500",
      accent: "palette.colors.accent.600",
      surface: "palette.colors.gray.50",
      textMuted: "palette.colors.gray.500"
    }
  },
  components: {
    message: {
      assistant: {
        border: "palette.colors.gray.200"
      }
    }
  }
};

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
- [Docked Panel](/docked-panel-demo.html) — alternative layout with the widget docked to the side of the page
- [Message Feedback](/feedback-demo.html) — copy, upvote, and downvote buttons on messages
- [Feedback Integration](/feedback-integration-demo.html) — wiring feedback events to an external API
- [Custom Loading Indicator](/custom-loading-indicator.html) — replace the default loading UX with your own
- [Agent Loop Execution](/agent-demo.html) — multi-turn reasoning with internal thought processes and tool use
- [Tool Approval](/approval-demo.html) — require user confirmation before the agent executes a tool
- [Focus Input](/focus-input-demo.html) — programmatic input focus and state handling
- [Artifact Sidebar](/artifact-demo.html) — multi-pane interface with a resizable artifact panel
- [Fullscreen Assistant](/fullscreen-assistant-demo.html) — dark full-viewport split layout (chat + artifacts)
- [Voice Integration](/voice-integration-demo.html) — voice input powered by ElevenLabs

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
   - theme: { primary, accent, surface, container, muted } to match site colors
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
const homeDemoInputPlaceholder =
  "Ask about Persona features, theming, integrations…";

/** Same Runtype agent, request options, and welcome copy for inline embed and corner launcher. */
const homeDemoSharedAssistant = {
  agent: {
    name: "Persona Documentation Assistant",
    model: "claude-haiku-4-5-20251001",
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
    loopConfig: {
      maxTurns: 3,
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
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    width: "100%",
    enabled: false
  },
  features: {
    showEventStreamToggle: true
  },
  persistState: {
    keyPrefix: homeDemoPersistKeyPrefix
  },
  storageAdapter: sharedWidgetStorage,
  theme: inlineDemoTheme,
  suggestionChips: [...homeDemoSuggestionChips],
  postprocessMessage: ({ text }) => codeBlockCopyPostprocessor(text)
});
setupCodeCopyHandler(inlineMount);

const launcherController = initAgentWidget({
  target: "#launcher-root",
  config: {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    ...homeDemoSharedAssistant,
    features: {
      showEventStreamToggle: true
    },
    persistState: {
      keyPrefix: homeDemoPersistKeyPrefix
    },
    storageAdapter: sharedWidgetStorage,
    theme: {
      components: {
        launcher: {
          borderRadius: ".5rem"
        }
      }
    },
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      title: homeDemoWelcomeTitle,
      subtitle: homeDemoWelcomeSubtitle,
      iconUrl: "https://dummyimage.com/96x96/111827/ffffff&text=AI",
      closeButtonColor: "#6b7280",
      collapsedMaxWidth: "min(380px, calc(100vw - 48px))",
    },
    suggestionChips: [...homeDemoSuggestionChips],
    postprocessMessage: ({ text }) => codeBlockCopyPostprocessor(text)
  }
});
setupCodeCopyHandler(document.getElementById("launcher-root")!);

// ---------------------------------------------------------------------------
// Event Stream Testing
// ---------------------------------------------------------------------------
const esTargetSelect = document.getElementById('event-stream-target') as HTMLSelectElement | null;
const getEsTarget = () => esTargetSelect?.value === 'launcher' ? launcherController : inlineController;

document.getElementById('es-show')?.addEventListener('click', () => getEsTarget().showEventStream());
document.getElementById('es-hide')?.addEventListener('click', () => getEsTarget().hideEventStream());
document.getElementById('es-check')?.addEventListener('click', () => {
  const visible = getEsTarget().isEventStreamVisible();
  const name = esTargetSelect?.value ?? 'inline';
  alert(`${name} event stream visible: ${visible}`);
});

// Window events
document.getElementById('es-win-show-all')?.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('persona:showEventStream'));
});
document.getElementById('es-win-hide-all')?.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('persona:hideEventStream'));
});
document.getElementById('es-win-show-inline')?.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('persona:showEventStream', { detail: { instanceId: 'inline-widget' } }));
});
document.getElementById('es-win-show-launcher')?.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('persona:showEventStream', { detail: { instanceId: 'launcher-root' } }));
});
document.getElementById('es-win-show-wrong')?.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('persona:showEventStream', { detail: { instanceId: 'wrong-id' } }));
  alert('Dispatched with instanceId "wrong-id" — nothing should open.');
});

// Event listeners with log output
const esLogEl = document.getElementById('es-log');
const esLogPre = document.getElementById('es-log-pre');
document.getElementById('es-listen')?.addEventListener('click', () => {
  if (esLogEl) esLogEl.style.display = 'block';
  const log = (msg: string) => {
    if (esLogPre) {
      esLogPre.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
      esLogPre.parentElement!.scrollTop = esLogPre.parentElement!.scrollHeight;
    }
    console.log(`[EventStream] ${msg}`);
  };
  inlineController.on('eventStream:opened', (e) => log(`inline opened (ts: ${e.timestamp})`));
  inlineController.on('eventStream:closed', (e) => log(`inline closed (ts: ${e.timestamp})`));
  launcherController.on('eventStream:opened', (e) => log(`launcher opened (ts: ${e.timestamp})`));
  launcherController.on('eventStream:closed', (e) => log(`launcher closed (ts: ${e.timestamp})`));
  log('Listeners registered for both widgets');
});

// ---------------------------------------------------------------------------
// Existing controls
// ---------------------------------------------------------------------------
const openButton = document.getElementById('open-chat')
const toggleButton = document.getElementById('toggle-chat')
const loadMessagesButton = document.getElementById('load-messages')
const targetWidgetSelect = document.getElementById('target-widget') as HTMLSelectElement | null

if (openButton) {
  openButton.addEventListener('click', () => launcherController.open())
}
if (toggleButton) {
  toggleButton.addEventListener('click', () => launcherController.toggle())
}
if (loadMessagesButton) {
  loadMessagesButton.addEventListener('click', () => {
    const messageCount = 1000;
    const chunksPerMessage = 5;
    const isLauncher = targetWidgetSelect?.value === 'launcher';
    const target = isLauncher ? launcherController : inlineController;
    const baseTime = Date.now() - messageCount * 1000;

    if (isLauncher) {
      launcherController.open();
    }

    // Build all messages up front, then inject in a single batch (one sort + one render)
    const batch: Array<{ role: 'user' | 'assistant'; content: string; createdAt: string }> = [];

    for (let msg = 0; msg < messageCount; msg++) {
      const msgNum = msg + 1;
      const isUser = msg % 2 === 0;
      const timestamp = new Date(baseTime + msg * 1000).toISOString();

      if (isUser) {
        const content = `Test question #${Math.ceil(msgNum / 2)}: What is ${Math.ceil(msgNum / 2) * 7}?`;
        batch.push({ role: 'user', content, createdAt: timestamp });
      } else {
        const fullText = `The answer to question #${Math.ceil(msgNum / 2)} is **${Math.ceil(msgNum / 2) * 7}**. Here's some extra text to make the message more realistic and test rendering with longer content.`;
        batch.push({ role: 'assistant', content: fullText, createdAt: timestamp });
      }
    }

    // Single batch insert: one sort, one DOM render
    target.injectMessageBatch(batch);

    // Push SSE events for the event stream inspector
    for (let msg = 0; msg < messageCount; msg++) {
      const msgNum = msg + 1;
      const isUser = msg % 2 === 0;

      if (isUser) {
        target.__pushEventStreamEvent({
          type: 'step_delta',
          payload: { type: 'step_delta', text: batch[msg].content, stepType: 'prompt' }
        });
        target.__pushEventStreamEvent({
          type: 'step_complete',
          payload: { type: 'step_complete', result: { response: batch[msg].content } }
        });
      } else {
        for (let chunk = 0; chunk < chunksPerMessage; chunk++) {
          const chunkStart = Math.floor((chunk / chunksPerMessage) * batch[msg].content.length);
          const chunkEnd = Math.floor(((chunk + 1) / chunksPerMessage) * batch[msg].content.length);
          target.__pushEventStreamEvent({
            type: 'step_delta',
            payload: { type: 'step_delta', text: batch[msg].content.slice(chunkStart, chunkEnd), stepType: 'prompt', messageId: `ast_${msg}` }
          });
        }
        target.__pushEventStreamEvent({
          type: 'step_complete',
          payload: { type: 'step_complete', result: { response: batch[msg].content }, messageId: `ast_${msg}` }
        });
      }

      if (msg % 20 === 0) {
        for (const t of ['reason_start', 'reason_delta', 'reason_complete', 'tool_start', 'tool_delta', 'tool_complete']) {
          target.__pushEventStreamEvent({
            type: t,
            payload: { type: t, text: `Simulated ${t} for msg #${msgNum}`, toolName: t.startsWith('tool') ? 'web_search' : undefined }
          });
        }
      }
    }

    target.__pushEventStreamEvent({
      type: 'flow_complete',
      payload: { type: 'flow_complete', messageCount }
    });

    const targetName = targetWidgetSelect?.value === 'launcher' ? 'launcher' : 'inline';
    console.log(`[Demo] Batch injected ${messageCount} messages + events into ${targetName} widget`);
    loadMessagesButton.textContent = `Loaded into ${targetName}!`;
    setTimeout(() => { loadMessagesButton.textContent = 'Load 1000 Messages'; }, 2000);
  });
}
