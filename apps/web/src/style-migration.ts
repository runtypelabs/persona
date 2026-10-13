import "@runtypelabs/persona/widget.css";
import type { AgentWidgetConfig, AgentWidgetMessage } from "@runtypelabs/persona";
import { mergeWithDefaults } from "../../../packages/widget/src/defaults";
import { applyThemeVariables } from "../../../packages/widget/src/utils/theme";
import { createCloseButton, createClearChatButton } from "../../../packages/widget/src/components/header-parts";
import { createSendButton, createMicButton, applyMicButtonStyle, type MicControlState } from "../../../packages/widget/src/components/composer-parts";
import { createToolBubble } from "../../../packages/widget/src/components/tool-bubble";
import { createApprovalBubble } from "../../../packages/widget/src/components/approval-bubble";

const select = (id: string) => document.querySelector<HTMLSelectElement>(`#${id}`)!;
let custom = true;
const control = { size: "36px", background: "#e9eefc", foreground: "#3049a1", borderRadius: "10px" };
const theme: AgentWidgetConfig["theme"] = { components: {
  header: { close: control, clear: { ...control, background: "#e3f3ec", foreground: "#216347" } },
  composer: { send: { size: "36px", iconSize: "18px", background: "#3049a1", foreground: "#ffffff" } },
  voice: { control: { size: "28px", iconSize: "28px", foreground: "#795832", background: "#fff1dd" }, recording: { indicator: "#9c2736", background: "#ffe4e7" }, processing: { icon: "#3049a1", background: "#e9eefc" }, speaking: { icon: "#216347", background: "#e3f3ec" } },
  toolBubble: { background: "#f1f5ff", borderColor: "#c5d2f0", borderRadius: "14px", header: { foreground: "#3049a1", padding: "10px 16px" }, content: { foreground: "#24305a", padding: "12px 16px" }, codeBlock: { background: "#e8edfa", foreground: "#24305a", borderColor: "#c5d2f0" } },
  approval: { requested: { background: "#fffbef", border: "#dccfa8", titleColor: "#684d18", descriptionColor: "#725f3a", reasonColor: "#725f3a" }, approve: { background: "#216347", foreground: "#ffffff" } },
} };
const legacy: AgentWidgetConfig = {
  launcher: { closeButtonSize: "36px", closeButtonBackgroundColor: "#e9eefc", closeButtonColor: "#3049a1", closeButtonBorderRadius: "10px", clearChat: { size: "36px", backgroundColor: "#e3f3ec", iconColor: "#216347", borderRadius: "10px" } },
  sendButton: { size: "36px", backgroundColor: "#3049a1", textColor: "#ffffff" },
  voiceRecognition: { iconSize: "28px", iconColor: "#795832", backgroundColor: "#fff1dd", recordingIconColor: "#9c2736", recordingBackgroundColor: "#ffe4e7", processingIconColor: "#3049a1", processingBackgroundColor: "#e9eefc", speakingIconColor: "#216347", speakingBackgroundColor: "#e3f3ec" },
  toolCall: { backgroundColor: "#f1f5ff", borderColor: "#c5d2f0", borderRadius: "14px", headerTextColor: "#3049a1", headerPaddingX: "16px", headerPaddingY: "10px", contentTextColor: "#24305a", contentPaddingX: "16px", contentPaddingY: "12px", codeBlockBackgroundColor: "#e8edfa", codeBlockTextColor: "#24305a", codeBlockBorderColor: "#c5d2f0" },
  approval: { backgroundColor: "#fffbef", borderColor: "#dccfa8", titleColor: "#684d18", descriptionColor: "#725f3a", approveButtonColor: "#216347", approveButtonTextColor: "#ffffff" },
};
const tool: AgentWidgetMessage = { id: "tool", role: "assistant", content: "", createdAt: new Date(0).toISOString(), variant: "tool", toolCall: { id: "lookup", name: "Search project", status: "complete", args: { query: "Release notes" }, result: "Found three matching documents." } };
const approval: AgentWidgetMessage = { id: "approval", role: "assistant", content: "", createdAt: new Date(0).toISOString(), variant: "approval", approval: { id: "approve", status: "pending", agentId: "local", executionId: "local", description: "A local approval example.", toolName: "Review required", reason: "Continue with this local demonstration?" } };
function render() {
  const samples = document.querySelector<HTMLDivElement>("#samples")!;
  samples.replaceChildren();
  for (const [kind, title] of [["default", "Unconfigured baseline"], ["legacy", "Legacy styles"], ["theme", "Component theme"]]) {
    const override = !custom ? {} : kind === "legacy" ? legacy : kind === "theme" ? { theme } : {};
    const config = mergeWithDefaults({ ...override, future: { v5Defaults: select("defaults").value === "v5" }, colorScheme: select("scheme").value.toLowerCase() as "light" | "dark", sendButton: { ...override.sendButton, useIcon: true }, voiceRecognition: { ...override.voiceRecognition, enabled: true } });
    const sample = document.createElement("section"); sample.className = "sample"; sample.dataset.variant = kind; sample.setAttribute("data-persona-root", ""); sample.setAttribute("data-persona-defaults", select("defaults").value);
    applyThemeVariables(sample, config);
    const heading = document.createElement("h2"); heading.textContent = title; sample.append(heading);
    const label = (text: string) => { const h = document.createElement("h3"); h.textContent = text; sample.append(h); };
    label("Independent controls");
    const controls = document.createElement("div"); controls.className = "controls";
    const mic = createMicButton(config)!;
    applyMicButtonStyle(mic.button, config, select("voice").value.toLowerCase() as MicControlState);
    controls.append(createCloseButton(config).button, createClearChatButton(config).button, createSendButton(config).button, mic.button); sample.append(controls);
    label("Tool details"); const card = createToolBubble(tool, config, new Set([tool.id])); card.dataset.demoTool = ""; sample.append(card);
    label("Approval"); sample.append(createApprovalBubble(approval, config));
    samples.append(sample);
  }
}
for (const id of ["defaults", "scheme", "voice"]) select(id).addEventListener("change", render);
document.querySelector<HTMLButtonElement>("#reset")!.addEventListener("click", event => { custom = !custom; (event.currentTarget as HTMLButtonElement).textContent = custom ? "Clear custom styles" : "Restore custom styles"; render(); });
render();
