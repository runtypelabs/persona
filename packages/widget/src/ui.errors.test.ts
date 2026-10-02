// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { provideApprovalUi } from "./approval-ui-loader";
import * as approvalUi from "./approval-ui-entry";
import type { AgentWidgetConfig, AgentWidgetMessage } from "./types";

let controller: ReturnType<typeof createAgentExperience>;
let mount: HTMLElement;
const messages = (): AgentWidgetMessage[] => [
  { id: "user", role: "user", content: "Explain", createdAt: "2026-01-01", sequence: 1 },
  { id: "partial", role: "assistant", content: "Partial response", createdAt: "2026-01-01", sequence: 2 },
  { id: "failure", role: "assistant", content: "Connection lost", dispatchError: true, createdAt: "2026-01-01", sequence: 3 },
];
function setup(config: Partial<AgentWidgetConfig> = {}) {
  mount = document.createElement("div");
  document.body.appendChild(mount);
  controller = createAgentExperience(mount, {
    apiUrl: "https://example.invalid/chat", launcher: { enabled: false },
    persistState: false, initialMessages: messages(), ...config,
  });
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
beforeEach(() => { provideApprovalUi(approvalUi); window.scrollTo = vi.fn(); });
afterEach(() => { controller?.destroy(); mount?.remove(); vi.restoreAllMocks(); });

describe("dispatch error presentation", () => {
  it("keeps V4 bubbles and enables V5 alert blocks with expandable detail", () => {
    setup();
    expect(mount.querySelector(".persona-error-block")).toBeNull();
    controller.update({ future: { v5Defaults: true } });
    const block = mount.querySelector<HTMLElement>(".persona-error-block")!;
    expect(block.getAttribute("role")).toBe("alert");
    expect(block.textContent).toContain("Something went wrong");
    expect(block.textContent).toContain("Connection lost");
    const details = block.querySelector("details")!;
    details.querySelector("summary")!.click();
    expect(details.open).toBe(true);
    const partial = mount.querySelector("#wrapper-partial")!;
    expect(partial.textContent).toContain("Partial response");
    expect(partial.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("preserves explicit bubble overrides in V5", () => {
    setup({ future: { v5Defaults: true }, errorDisplay: "bubble" });
    expect(mount.querySelector(".persona-error-block")).toBeNull();
    expect(mount.querySelector("#wrapper-failure")?.textContent).toContain("Connection lost");
  });

  it("routes Retry through the stored user turn and removes failed output", async () => {
    const customFetch = vi.fn().mockResolvedValue(new Response('data: {"type":"execution_complete","success":true}\n\n', { headers: { "Content-Type": "text/event-stream" } }));
    setup({ errorDisplay: "block", customFetch });
    mount.querySelector<HTMLButtonElement>(".persona-error-retry")!.click();
    await flush();
    expect(customFetch).toHaveBeenCalledOnce();
    expect(controller.getMessages().some((m) => m.id === "failure" || m.id === "partial")).toBe(false);
    expect(controller.getMessages().filter((m) => m.role === "user").map((m) => m.content)).toEqual(["Explain"]);
  });

  it("preserves postprocessMessage and custom assistant renderers", () => {
    const postprocessMessage = vi.fn(({ text }: { text: string }) => `<em>${text}</em>`);
    setup({ errorDisplay: "block", postprocessMessage, sanitize: true });
    expect(mount.querySelector(".persona-error-detail em")?.textContent).toBe("Connection lost");
    controller.update({ layout: { messages: { renderAssistantMessage: ({ message }) => {
      const element = document.createElement("div"); element.textContent = `Custom: ${message.content}`; return element;
    } } } });
    expect(mount.querySelector(".persona-error-block")).toBeNull();
    expect(mount.querySelector("#wrapper-failure")?.textContent).toBe("Custom: Connection lost");
  });

  it("lets renderMessage plugins replace the block or use its default renderer", () => {
    setup({ errorDisplay: "block", plugins: [{ id: "errors", renderMessage: ({ message, defaultRenderer }) => {
      const element = defaultRenderer();
      if (message.dispatchError) element.setAttribute("data-custom-error", "true");
      return element;
    } }] });
    expect(mount.querySelector('[data-custom-error="true"]')?.getAttribute("role")).toBe("alert");
    controller.update({ errorDisplay: "bubble" });
    expect(mount.querySelector(".persona-error-block")).toBeNull();
  });

  it("supports injected errors and hides Retry without a preceding user turn", () => {
    setup({ initialMessages: [], errorDisplay: "block" });
    controller.injectAssistantMessage({ content: "Offline", dispatchError: true });
    expect(mount.querySelector(".persona-error-block")?.textContent).toContain("Offline");
    expect(mount.querySelector(".persona-error-retry")).toBeNull();
  });
});
