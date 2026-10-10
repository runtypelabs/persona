import "@runtypelabs/persona/widget.css";
import "./assistant-composers.css";
import { initAgentWidget, registerIcons } from "@runtypelabs/persona";
import { renderExamplesShell } from "./examples-nav";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import { assistantIcons, assistantPresets, createAssistantPreset } from "./assistant-presets";

registerIcons(assistantIcons);
renderExamplesShell();
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let selected = "claude";
let widget: ReturnType<typeof initAgentWidget> | undefined;
let code = "";
const notice = (message: string) => { element("lab-status").textContent = message; };
function fillList(id: string, items: string[]) {
  element(id).replaceChildren(...items.map(text => { const li = document.createElement("li"); li.textContent = text; return li; }));
}
function mount() {
  widget?.destroy();
  const preset = assistantPresets.find(p => p.id === selected)!;
  const config = createAssistantPreset(selected, notice);
  element("lab-stage").style.setProperty("--lab-canvas", preset.canvas);
  element("lab-stage").style.setProperty("--lab-width", element<HTMLSelectElement>("lab-width").value === "narrow" ? "380px" : `${preset.width + 32}px`);
  element("lab-name").textContent = preset.name;
  element("lab-evidence").textContent = preset.evidence;
  element<HTMLAnchorElement>("lab-source").href = preset.source;
  fillList("lab-matches", preset.matches);
  fillList("lab-gaps", preset.gaps);
  for (const button of element("assistant-tabs").querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.preset === selected));
  // Functions are retained as source instead of silently disappearing in JSON.
  const functions: string[] = [];
  code = JSON.stringify(config, (_key, value: unknown) => {
    if (typeof value !== "function") return value;
    functions.push(value.toString());
    return `__CALLBACK_${functions.length - 1}__`;
  }, 2).replace(/"__CALLBACK_(\d+)__"/g, (_match, index: string) => functions[Number(index)]);
  code = `import { registerIcons } from "@runtypelabs/persona";\nregisterIcons(${JSON.stringify(assistantIcons, null, 2)});\n\n// Demo callback; replace with your host integration.\nconst notice = (message) => console.info(message);\n\nconst config = ${code};`;
  element("lab-config").textContent = code;
  widget = initAgentWidget({ target: element("lab-mount"), config: { ...config, apiUrl: "/assistant-lab-local", customFetch: createDemoEchoFetch({ reply: () => "This is a **local Persona preview**. Your message exercises the real composer and streaming renderer.\n\nTry a longer draft, switch a mode, or narrow the preview to compare how this configuration responds." }) } });
  notice("Type a message to try the local streaming reply. Voice controls are demonstrations.");
}
for (const preset of assistantPresets) {
  const button = document.createElement("button");
  button.type = "button"; button.dataset.preset = preset.id; button.textContent = preset.name;
  button.addEventListener("click", () => { selected = preset.id; mount(); });
  element("assistant-tabs").append(button);
}
element("lab-width").addEventListener("change", () => {
  const preset = assistantPresets.find(p => p.id === selected)!;
  element("lab-stage").style.setProperty("--lab-width", element<HTMLSelectElement>("lab-width").value === "narrow" ? "380px" : `${preset.width + 32}px`);
});
element("lab-reset").addEventListener("click", mount);
element("lab-conversation").addEventListener("click", () => {
  mount();
  widget!.injectUserMessage({ content: "Help me plan a small project." });
  widget!.injectAssistantMessage({ content: "Start with a clear outcome, then break the work into three steps:\n\n1. Define what success looks like.\n2. Build the smallest useful version.\n3. Test it with someone who will use it.\n\nWhich part would you like to explore?" });
});
element("lab-copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(code); notice("Configuration copied, including demo callbacks. Supply your own transport when integrating."); }
  catch { notice("Clipboard is unavailable. Select and copy the configuration below."); }
});
window.addEventListener("pagehide", () => widget?.destroy());
mount();
