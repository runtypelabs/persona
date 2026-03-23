import "@runtypelabs/persona/widget.css";
import "./index.css";
import "./App.css";

import {
  initAgentWidget,
  createAgentExperience,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG
} from "@runtypelabs/persona";

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL ?
    `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch` :
    `http://localhost:${proxyPort}/api/chat/dispatch`;

const PERSONA_SYSTEM_PROMPT = `You are the Persona documentation assistant, embedded in the Persona examples app.

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
- [Action Middleware](/action-middleware.html) — e-commerce action handling with AI-driven page interactions
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

Keep answers concise. Use markdown formatting. When recommending a demo, briefly explain why it is relevant to the user's question.`;

const inlineMount = document.getElementById("inline-widget");
if (!inlineMount) {
  throw new Error("Inline widget mount node missing");
}

const inlineController = createAgentExperience(inlineMount, {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  agent: {
    name: "Persona Documentation Assistant",
    model: "mercury-2",
    systemPrompt: PERSONA_SYSTEM_PROMPT,
    temperature: 0.5,
  },
  agentOptions: {
    streamResponse: true,
    recordMode: "virtual",
    storeResults: false,
  },
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    width: "100%",
    enabled: false
  },
  features: {
    showEventStreamToggle: true
  },
  persistState: {
    keyPrefix: "persona-assistant-"
  },
  theme: {
    ...DEFAULT_WIDGET_CONFIG.theme,
    primary: "#0f172a",
    accent: "#ea580c",
    surface: "#f8fafc",
    muted: "#64748b"
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Welcome to Persona",
    welcomeSubtitle:
      "I can help you learn about Persona and find the right demo for your use case.",
    inputPlaceholder: "Ask about Persona features, theming, integrations…"
  },
  suggestionChips: [
    "What is Persona and how does it work?",
    "How does streaming work?",
    "How do I add a chat widget to my website?"
  ],
  postprocessMessage: ({ text }) => markdownPostprocessor(text)
});

const launcherController = initAgentWidget({
  target: "#launcher-root",
  useShadowDom: false,
  config: {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    features: {
      showEventStreamToggle: true
    },
    persistState: {
      keyPrefix: "launcher-"
    },
    theme: {
      launcherRadius: ".5rem"
    },
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      iconUrl: "https://dummyimage.com/96x96/111827/ffffff&text=AI",
    },
    suggestionChips: [
      "How do I embed the widget?",
      "Show me the API docs",
      "Schedule a demo"
    ],
    postprocessMessage: ({ text }) => markdownPostprocessor(text)
  }
});

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
