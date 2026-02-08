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

const inlineMount = document.getElementById("inline-widget");
if (!inlineMount) {
  throw new Error("Inline widget mount node missing");
}

const inlineController = createAgentExperience(inlineMount, {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    width: "100%",
    enabled: false
  },
  features: {
    showEventStreamToggle: true
  },
  persistState: {
    keyPrefix: "inline-"
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
    welcomeTitle: "Inline Demo",
    welcomeSubtitle:
      "This instance is rendered via createAgentExperience with a neutral theme.",
    inputPlaceholder: "Ask about embedding, styling, or integrations…"
  },
  suggestionChips: [
    "Do you support streaming?",
    "How do I theme the widget?",
    "Show me the proxy setup"
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
          type: 'step_chunk',
          payload: { type: 'step_chunk', text: batch[msg].content, stepType: 'prompt' }
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
            type: 'step_chunk',
            payload: { type: 'step_chunk', text: batch[msg].content.slice(chunkStart, chunkEnd), stepType: 'prompt', messageId: `ast_${msg}` }
          });
        }
        target.__pushEventStreamEvent({
          type: 'step_complete',
          payload: { type: 'step_complete', result: { response: batch[msg].content }, messageId: `ast_${msg}` }
        });
      }

      if (msg % 20 === 0) {
        for (const t of ['reason_start', 'reason_chunk', 'reason_complete', 'tool_start', 'tool_chunk', 'tool_complete']) {
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
