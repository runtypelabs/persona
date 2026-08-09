// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { loadContextMentions } from "./context-mentions-loader";
import type { AgentWidgetContextMentionSource } from "./types";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const makeController = (config: Record<string, unknown> = {}) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const docsSource: AgentWidgetContextMentionSource = {
  id: "docs",
  label: "Docs",
  search: () => [{ id: "a", label: "A" }],
  resolve: () => ({ llmAppend: "A" }),
};

const mentionButtons = (mount: HTMLElement) =>
  mount.querySelectorAll(".persona-mention-button");

describe("live contextMentions updates", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => {
      try {
        controller.destroy();
      } catch {
        /* already destroyed */
      }
    });
    mounts.splice(0).forEach((mount) => mount.remove());
  });

  it("mounts the mention affordance when contextMentions is enabled by update()", () => {
    const { mount, controller } = makeController();
    expect(mentionButtons(mount)).toHaveLength(0);

    controller.update({
      contextMentions: { enabled: true, sources: [docsSource] },
    });

    expect(mentionButtons(mount)).toHaveLength(1);
  });

  it("removes the mention affordance when contextMentions is disabled by update()", () => {
    const { mount, controller } = makeController({
      contextMentions: { enabled: true, sources: [docsSource] },
    });
    expect(mentionButtons(mount)).toHaveLength(1);

    controller.update({ contextMentions: { enabled: false } });

    expect(mentionButtons(mount)).toHaveLength(0);
  });

  it("re-mounts the affordances when a trigger channel is added by update()", () => {
    const { mount, controller } = makeController({
      contextMentions: { enabled: true, sources: [docsSource] },
    });
    expect(mentionButtons(mount)).toHaveLength(1);

    controller.update({
      contextMentions: {
        triggers: [
          {
            trigger: "/",
            triggerPosition: "line-start",
            showButton: true,
            sources: [
              {
                id: "cmd",
                label: "Commands",
                search: () => [],
                resolve: () => ({}),
              } satisfies AgentWidgetContextMentionSource,
            ],
          },
        ],
      },
    });

    expect(mentionButtons(mount)).toHaveLength(2);
  });

  // The menu is portaled outside the composer footer, so a mouse selection
  // produces neither a footer click nor a keyup. Only the `input` event that
  // strips the `@query` reaches the composer.
  it("publishes mentionRefs after a mouse selection, with no keyup", async () => {
    const { mount, controller } = makeController({
      contextMentions: { enabled: true, sources: [docsSource] },
    });

    const textarea = mount.querySelector<HTMLTextAreaElement>(
      "[data-persona-composer-input]"
    )!;
    textarea.value = "@";
    textarea.selectionStart = textarea.selectionEnd = 1;
    textarea.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: "@" })
    );

    await loadContextMentions().catch(() => {});
    for (let i = 0; i < 8; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0));
    }

    const option = document.querySelector<HTMLElement>(".persona-mention-option");
    expect(option).not.toBeNull();
    option!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    option!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    for (let i = 0; i < 8; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0));
    }

    expect(controller.getComposerState().mentionRefs).toEqual([
      expect.objectContaining({ sourceId: "docs", itemId: "a", label: "A" }),
    ]);
  });

  it("keeps the composer intact when the patch never mentions contextMentions", () => {
    const { mount, controller } = makeController({
      contextMentions: { enabled: true, sources: [docsSource] },
    });
    const textarea = mount.querySelector("[data-persona-composer-input]");

    controller.update({ composer: { submitKey: "mod-enter" } });

    // No rebuild: the same input element survives an unrelated patch.
    expect(mount.querySelector("[data-persona-composer-input]")).toBe(textarea);
    expect(mentionButtons(mount)).toHaveLength(1);
  });
});
