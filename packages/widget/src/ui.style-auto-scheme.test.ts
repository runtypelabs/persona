// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { provideApprovalUi } from "./approval-ui-loader";
import { provideArtifactsUi } from "./artifacts-ui-loader";
import * as approvalUi from "./approval-ui-entry";
import * as artifactsUi from "./artifacts-ui-entry";

provideApprovalUi(approvalUi);
provideArtifactsUi(artifactsUi);
const controllers: ReturnType<typeof createAgentExperience>[] = [];
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.destroy());
  document.documentElement.classList.remove("dark", "unrelated");
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const createController = () => {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const controller = createAgentExperience(mount, {
    launcher: { enabled: false }, apiUrl: "/api/chat", colorScheme: "auto", future: { v5Defaults: true },
    features: { artifacts: { enabled: true, allowedTypes: ["markdown"] } },
    darkTheme: { components: {
      toolBubble: { header: { padding: "10px 16px" }, content: { padding: "12px 16px" } },
      approval: { requested: { background: "red", titleColor: "green" } },
      artifact: { pane: { padding: "20px", border: "1px solid green" }, split: { outerRadius: "16px" } },
    } },
  });
  controllers.push(controller);
  controller.injectTestMessage({ type: "message", message: { id: "auto-tool", role: "assistant", content: "", createdAt: "2026-10-13", variant: "tool", toolCall: { id: "tool", name: "lookup", status: "complete", args: { q: "example" }, result: "Found" } } });
  controller.injectTestMessage({ type: "message", message: { id: "auto-approval", role: "assistant", content: "", createdAt: "2026-10-13", variant: "approval", approval: { id: "approval", agentId: "agent", executionId: "execution", status: "pending", toolName: "lookup", description: "Lookup", parameters: { q: "example" } } } });
  controller.upsertArtifact({ id: "artifact", title: "Notes", artifactType: "markdown", content: "# Notes" });
  return { controller, mount };
};

describe("optional style hooks follow active color scheme", () => {
  it("activates dark-only tool, approval, and artifact styles on auto switch and restores light styling", async () => {
    const { mount } = createController();
    const tool = () => mount.querySelector<HTMLElement>("#bubble-auto-tool > button")!;
    const approval = () => mount.querySelector<HTMLElement>("#bubble-auto-approval")!;
    const pane = mount.querySelector<HTMLElement>(".persona-artifact-pane")!;
    expect(tool().classList.contains("persona-theme-padding")).toBe(false);
    expect(approval().style.background).toBe("");
    expect(mount.classList.contains("persona-artifact-border-full")).toBe(false);
    document.documentElement.classList.add("dark");
    await vi.waitFor(() => expect(tool().classList.contains("persona-theme-padding")).toBe(true));
    expect(tool().style.getPropertyValue("--persona-theme-padding")).toBe("var(--persona-components-toolBubble-header-padding)");
    expect(approval().style.background).toBe("var(--persona-components-approval-requested-background)");
    expect(mount.classList.contains("persona-artifact-border-full")).toBe(true);
    expect(mount.style.getPropertyValue("--persona-artifact-pane-padding")).toBe("var(--persona-components-artifact-pane-padding)");
    expect(mount.querySelector(".persona-artifact-pane")).toBe(pane);
    document.documentElement.classList.remove("dark");
    await vi.waitFor(() => expect(tool().classList.contains("persona-theme-padding")).toBe(false));
    expect(approval().style.background).toBe("");
    expect(mount.classList.contains("persona-artifact-border-full")).toBe(false);
    expect(mount.style.getPropertyValue("--persona-artifact-pane-padding")).toBe("");
  });

  it("rebuilds optional hooks when theme inputs change and clears them on theme reset", () => {
    const { controller, mount } = createController();
    controller.update({ theme: { components: { toolBubble: { header: { padding: "8px" } }, approval: { requested: { background: "blue" } } } } });
    expect(mount.querySelector<HTMLElement>("#bubble-auto-tool > button")!.classList.contains("persona-theme-padding")).toBe(true);
    expect(mount.querySelector<HTMLElement>("#bubble-auto-approval")!.style.background).toBe("var(--persona-components-approval-requested-background)");
    controller.update({ theme: undefined });
    expect(mount.querySelector<HTMLElement>("#bubble-auto-tool > button")!.classList.contains("persona-theme-padding")).toBe(false);
    expect(mount.querySelector<HTMLElement>("#bubble-auto-approval")!.style.background).toBe("");
  });
});
