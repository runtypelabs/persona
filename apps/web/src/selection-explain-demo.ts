import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";

import {
  initAgentWidget,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
} from "@runtypelabs/persona";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import {
  createDemoConfigInspector,
  reportDemoConfig,
} from "./demo-config-inspector";
import {
  createSelectionExplainPlugin,
  type SelectionExplainAction,
} from "./plugins/selection-explain-plugin";

renderDemoScaffold({ slug: "selection-explain-demo" });

const configInspector = createDemoConfigInspector({
  title: "Select-to-Explain",
  root: "[data-config-inspector]",
});

const ARTICLE_TITLE = "Field Notes: How Espresso Extraction Works";

// --- Keyless echo backend -------------------------------------------------------
// The selection arrives ahead of the prompt as the composer quote's delimited
// block. Parse it back out so the echo can prove the wire format end-to-end:
//
//   ```quoted-text source=<label>
//   <selection>
//   ```
//
//   <prompt or typed question>
const QUOTE_BLOCK = /^```quoted-text(?: source=([^\n]*))?\n([\s\S]*?)\n```\s*/;

const echoFetch = createDemoEchoFetch({
  chunkSize: 6,
  delayMs: 22,
  reply: (userText) => {
    const match = QUOTE_BLOCK.exec(userText);
    if (!match) {
      return [
        `You sent “${userText}”.`,
        "",
        "Try highlighting a sentence in the article instead. The toolbar quotes your selection with `controller.setQuote()`, and it arrives here as a `quoted-text` block ahead of your message.",
      ].join("\n");
    }

    const [, sourceLabel, quoted] = match;
    const question = userText.slice(match[0].length).trim();
    const snippet = quoted.length > 140 ? `${quoted.slice(0, 140).trimEnd()}…` : quoted;

    return [
      `> ${snippet}`,
      "",
      `I received your selection${sourceLabel ? ` from **${sourceLabel}**` : ""} as a \`quoted-text\` block, followed by: “${question}”.`,
      "",
      "This demo streams a canned echo instead of a live model. The payload is real, though. The selection and your prompt arrive as one user turn, ready for the model to answer.",
    ].join("\n");
  },
});

// --- Widget --------------------------------------------------------------------

const config: AgentWidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: "https://noop.test/chat",
  customFetch: echoFetch,
  persistState: false,
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    enabled: true,
    width: "min(420px, 95vw)",
    title: "Reading Assistant",
    subtitle: "Highlight anything to ask about it",
    agentIconText: "📖",
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Select-to-Explain",
    welcomeSubtitle:
      "Highlight a passage in the article and choose “Explain this”. This echo backend replies with what it received.",
    inputPlaceholder: "Or just type a question…",
  },
  postprocessMessage: ({ text }) => markdownPostprocessor(text),
};

const controller = initAgentWidget({
  target: "#launcher-root",
  useShadowDom: false,
  config,
});

reportDemoConfig(configInspector, { config, mode: "launcher" });

// --- Selection toolbar ----------------------------------------------------------

const logList = document.getElementById("selection-log");

const logAction = (action: SelectionExplainAction, text: string): void => {
  console.log(`[SelectionExplain] ${action.id}: "${text}"`);
  if (!logList) return;
  const item = document.createElement("li");
  const preview = text.length > 60 ? `${text.slice(0, 60).trimEnd()}…` : text;
  item.innerHTML = `<strong>${action.label}</strong> · ${preview.replace(/</g, "&lt;")} <span>(${text.length} chars)</span>`;
  logList.prepend(item);
  while (logList.children.length > 5) logList.lastElementChild?.remove();
  logList.closest(".selection-log-wrap")?.removeAttribute("data-empty");
};

// Direct `initAgentWidget()` returns the controller, so pass it here. A
// script-tag install omits it: the toolbar attaches itself on
// `persona:chat-ready`.
createSelectionExplainPlugin({
  container: ".article-pane",
  controller,
  sourceLabel: ARTICLE_TITLE,
  onAction: logAction,
});

// --- Copy buttons on the notes code blocks --------------------------------------

async function copyCode(text: string, button: HTMLButtonElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  button.textContent = "Copied";
  window.setTimeout(() => {
    button.textContent = "Copy";
  }, 2000);
}

for (const block of document.querySelectorAll<HTMLElement>(".notes .code-block")) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "code-copy-btn";
  button.textContent = "Copy";
  button.setAttribute("aria-label", "Copy code");
  block.appendChild(button);
}

// The examples shell normalizes each `.code-block` by rewriting its innerHTML
// after this module runs, which strips element listeners (the button survives
// only as markup). Delegate from the document and read the code at click time
// so the buttons keep working regardless of that rewrite.
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest(".code-copy-btn");
  if (!(button instanceof HTMLButtonElement)) return;
  const block = button.closest(".code-block");
  if (!block) return;
  const clone = block.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".code-copy-btn").forEach((el) => el.remove());
  void copyCode((clone.textContent ?? "").trim(), button);
});
