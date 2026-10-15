// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import type { AgentWidgetConfig, AttachmentPreviewRenderContext } from "./types";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
const setup = (config: AgentWidgetConfig = {}) => {
  window.scrollTo = vi.fn();
  const mount = document.createElement("div");
  document.body.append(mount);
  const controller = createAgentExperience(mount, { apiUrl: "https://example.com/chat", launcher: { enabled: false }, persistState: false, attachments: { enabled: true, adapter: { add: async () => ({ type: "text", text: "uploaded" }) } }, ...config });
  controllers.push(controller);
  return { mount, controller };
};
const addFile = async (mount: HTMLElement) => {
  const input = mount.querySelector<HTMLInputElement>("[data-persona-composer-attachment-input]")!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["draft"], "draft.txt", { type: "text/plain" })] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => expect(mount.querySelector("[data-attachment-id]")).not.toBeNull());
};
afterEach(() => { controllers.splice(0).forEach(controller => controller.destroy()); document.body.innerHTML = ""; window.localStorage.clear(); vi.restoreAllMocks(); });

describe("attachment preview hooks", () => {
  it("honors plugin priority and null fallback and replaces managed previews on plugin changes", async () => {
    const order: string[] = [];
    const cleanup = vi.fn();
    const update = vi.fn();
    let context: AttachmentPreviewRenderContext | undefined;
    const { mount, controller } = setup({ plugins: [
      { id: "last", priority: -1, renderAttachmentPreview: () => { order.push("last"); return document.createElement("div"); } },
      { id: "first", priority: 10, renderAttachmentPreview: () => { order.push("first"); return null; } },
      { id: "custom", renderAttachmentPreview: next => { order.push("custom"); context = next; return { element: document.createElement("article"), update, destroy: cleanup }; } },
    ] });
    await addFile(mount);
    expect(order).toEqual(["first", "custom"]);
    expect(context?.instanceId).toBe(controller.instanceId);
    await vi.waitFor(() => expect(update.mock.calls.at(-1)?.[0].state.status).toBe("ready"));
    controller.update({ plugins: [] });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(mount.querySelector(".persona-attachment-file")).not.toBeNull();
    controller.update({ attachments: { preview: { file: { name: "basename", layout: "horizontal" } } } });
    expect(mount.querySelector(".persona-attachment-file-name")?.textContent).toBe("draft");
  });

  it("keeps attachment layout opt-in and updates its row gate with quote state", async () => {
    const { mount, controller } = setup({ composer: { layout: "single-row", attachmentLayout: "single-row" } });
    await addFile(mount);
    const footer = mount.querySelector<HTMLElement>(".persona-widget-footer")!;
    expect(footer.dataset.personaAttachmentLayout).toBe("single-row");
    expect(footer.hasAttribute("data-persona-attachment-row-compact")).toBe(true);
    expect(footer.hasAttribute("data-persona-composer-expanded")).toBe(true);
    controller.setQuote({ text: "quoted passage" });
    expect(footer.hasAttribute("data-persona-attachment-row-compact")).toBe(false);
    controller.clearQuote();
    expect(footer.hasAttribute("data-persona-attachment-row-compact")).toBe(true);
    controller.update({ composer: { attachmentLayout: undefined } });
    expect(footer.hasAttribute("data-persona-attachment-layout")).toBe(false);
  });
});
