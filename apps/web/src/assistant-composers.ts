import "@runtypelabs/persona/widget.css";
import "./assistant-composers.css";
import { initAgentWidget, registerIcons } from "@runtypelabs/persona";
import { renderExamplesShell } from "./examples-nav";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import { createDemoVoiceProvider } from "./demo-voice-provider";
import { createDemoDictationProvider } from "./demo-dictation-provider";
import { assistantIcons, assistantPresets, createAssistantPreset } from "./assistant-presets";

registerIcons(assistantIcons);
renderExamplesShell();
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let selected = "claude";
let widget: ReturnType<typeof initAgentWidget> | undefined;
let code = "";
let toggleConversation = () => {};
let toggleDictation = () => {};
const notice = (message: string) => { element("lab-status").textContent = message; };
function fillList(id: string, items: string[]) {
  element(id).replaceChildren(...items.map(text => { const li = document.createElement("li"); li.textContent = text; return li; }));
}
function mount() {
  widget?.destroy();
  const preset = assistantPresets.find(p => p.id === selected)!;
  const config = createAssistantPreset(selected, notice);
  const display = element<HTMLSelectElement>("lab-dictation-display").value as "transcript" | "waveform" | "inline";
  config.future = { ...config.future, v5Defaults: element<HTMLSelectElement>("lab-defaults").value === "v5" };
  config.voiceRecognition = {
    ...config.voiceRecognition,
    enabled: true,
    completionBehavior: "review",
    dictation: {
      display,
      waveform: true,
      interimText: { fontStyle: "italic" },
      showSend: element<HTMLInputElement>("lab-dictation-send").checked,
    },
  };
  config.composer = { ...config.composer, actions: config.composer?.actions?.filter(action => action.id !== "dictate") };
  element("lab-stage").style.setProperty("--lab-canvas", preset.canvas);
  element("lab-stage").style.setProperty("--lab-width", element<HTMLSelectElement>("lab-width").value === "narrow" ? "380px" : selected === "gemini" ? "100%" : `${preset.width + 32}px`);
  element("lab-name").textContent = preset.name;
  element("lab-evidence").textContent = preset.evidence;
  element<HTMLAnchorElement>("lab-source").href = preset.source;
  fillList("lab-matches", preset.matches);
  fillList("lab-gaps", preset.gaps);
  for (const button of element("assistant-tabs").querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.preset === selected));
  // Functions are retained as source instead of silently disappearing in JSON.
  const functions: string[] = [];
  const exportConfig = { ...config, plugins: [], composer: { ...config.composer, actions: config.composer?.actions?.filter(action => action.presentation !== "overflow") } };
  code = JSON.stringify(exportConfig, (_key, value: unknown) => {
    if (typeof value !== "function") return value;
    functions.push(value.toString());
    return `__CALLBACK_${functions.length - 1}__`;
  }, 2).replace(/"__CALLBACK_(\d+)__"/g, (_match, index: string) => functions[Number(index)]);
  code = `import { registerIcons } from "@runtypelabs/persona";\nregisterIcons(${JSON.stringify(assistantIcons, null, 2)});\n\n// Demo callback; replace with your host integration.\nconst notice = (message) => console.info(message);\n\nconst config = ${code};\n\n// Copy the showcase helper alongside this example for the local submenu demo.\n// Replace its callbacks with your own integrations.\nconst menuDemo = createAssistantMenuPreset(${JSON.stringify(selected)}, notice);\nconfig.plugins = menuDemo.plugins;\nconfig.composer.actions.push(...menuDemo.actions);`;
  code = `import { createAssistantMenuPreset } from "./assistant-menu-presets";\n${code}`;
  element("lab-config").textContent = code;
  const voiceProvider = createDemoVoiceProvider();
  let muted = false;
  const active = () => voiceProvider.isBargeInActive?.() ?? false;
  const actions = () => {
    const configured = config.composer?.actions?.map(action => action.id === "voice" ? { ...action,
      label: active() ? "End voice conversation" : "Start voice conversation",
      visibility: active() ? "always" as const : action.visibility,
      iconAnimation: muted ? "none" as const : "voice" as const,
      pressed: active(), onSelect: () => toggleConversation(),
    } : action) ?? [];
    if (active()) configured.push({ id: "mute-voice", label: muted ? "Unmute microphone" : "Mute microphone",
      iconName: muted ? "mic-off" : "mic", placement: "end", presentation: "bar", order: 700, pressed: muted,
      onSelect: () => {
        muted = !muted;
        voiceProvider.setMuted(muted);
        refresh();
        notice(muted ? "Microphone muted. Incoming sample speech pauses; an existing reply can finish." : "Voice microphone unmuted. Sample speech continues.");
      },
    });
    return configured;
  };
  const refresh = () => {
    widget?.update({ voiceRecognition: { showButton: selected !== "copilot" && !active() }, composer: { actions: actions() } });
    element<HTMLButtonElement>("lab-dictate").disabled = active();
    element("lab-voice").textContent = active() ? "End voice conversation" : "Simulate voice";
    element("lab-voice").setAttribute("aria-pressed", String(active()));
  };
  toggleDictation = () => {
    if (active()) return;
    if (widget?.getDictationState().phase === "recording") widget.finishDictation();
    else widget?.startDictation();
  };
  toggleConversation = () => {
    widget?.cancelDictation();
    if (active()) { widget?.stopVoiceRecognition(); return; }
    muted = false;
    widget?.startVoiceRecognition();
  };
  widget = initAgentWidget({ target: element("lab-mount"), config: {
    ...config,
    voiceRecognition: {
      ...config.voiceRecognition,
      provider: { type: "custom", custom: () => voiceProvider },
      dictation: { ...config.voiceRecognition.dictation, provider: { type: "custom", custom: createDemoDictationProvider } },
    },
    composer: { ...config.composer, actions: actions() },
    apiUrl: "/assistant-lab-local", customFetch: createDemoEchoFetch({ reply: () => "This is a **local Persona preview**. Your message exercises the real composer and streaming renderer.\n\nTry a longer draft, switch a mode, or narrow the preview to compare how this configuration responds." }),
  } });
  widget.on("voice:status", ({ status }) => {
    if (!active()) muted = false;
    refresh();
    if (status === "listening") notice("Simulated voice conversation · the waveform shows listening. Use the microphone to mute, or the waveform to end. No microphone or audio is used.");
    else if (status === "processing") notice("Simulated processing · transcription has finished. The waveform is now still.");
    else if (status === "speaking") notice("Simulated response · sample reply text is appearing. No audio is played.");
    else if (status === "idle") notice("Voice conversation ended. Try dictation to fill an editable draft instead.");
  });
  widget.on("dictation:state", ({ phase, error }) => {
    const capturing = phase === "recording" || phase === "processing";
    element("lab-dictate").textContent = phase === "recording" ? "Finish dictation" : "Simulate dictation";
    element("lab-dictate").setAttribute("aria-pressed", String(capturing));
    element<HTMLButtonElement>("lab-dictate").disabled = phase === "processing" || active();
    element<HTMLButtonElement>("lab-voice").disabled = capturing;
    if (phase === "recording") notice("Simulated dictation · speak with sample text, then finish to review or cancel to restore your draft. No microphone is used.");
    else if (phase === "processing") notice("Transcribing the sample recording… The final text will be ready to review shortly.");
    else if (phase === "review") notice("Dictation finished. Edit the draft and send it when ready.");
    else if (phase === "error") notice(error ?? "The sample dictation could not finish. Your previous draft is preserved.");
    else if (phase === "idle") notice("Dictation closed. The composer is ready.");
  });
  element("lab-dictate").textContent = "Simulate dictation";
  element("lab-dictate").setAttribute("aria-pressed", "false");
  element<HTMLButtonElement>("lab-voice").disabled = false;
  refresh();
  notice(selected === "copilot" ? "Type to reveal send. Explore / Shop / Play fill local prompts; use the lab controls to simulate dictation or voice." : "Try the microphone for editable dictation, or Simulate voice for a conversation. No microphone or audio is used.");
}
for (const preset of assistantPresets) {
  const button = document.createElement("button");
  button.type = "button"; button.dataset.preset = preset.id; button.textContent = preset.name;
  button.addEventListener("click", () => { selected = preset.id; mount(); });
  element("assistant-tabs").append(button);
}
element("lab-width").addEventListener("change", () => {
  const preset = assistantPresets.find(p => p.id === selected)!;
  element("lab-stage").style.setProperty("--lab-width", element<HTMLSelectElement>("lab-width").value === "narrow" ? "380px" : selected === "gemini" ? "100%" : `${preset.width + 32}px`);
});
element("lab-reset").addEventListener("click", mount);
for (const id of ["lab-dictation-display", "lab-defaults", "lab-dictation-send"]) element(id).addEventListener("change", mount);
element("lab-voice").addEventListener("click", () => toggleConversation());
element("lab-dictate").addEventListener("click", () => toggleDictation());
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
