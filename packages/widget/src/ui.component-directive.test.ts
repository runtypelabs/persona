// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { componentRegistry, type ComponentRenderer } from "./components/registry";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const directiveMessage = (
  controller: ReturnType<typeof createAgentExperience>,
  {
    id,
    rawContent,
    content = "",
    createdAt = "2026-04-28T00:00:00.000Z",
  }: {
    id: string;
    rawContent: string;
    content?: string;
    createdAt?: string;
  }
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "assistant",
      content,
      rawContent,
      createdAt,
      streaming: false,
    },
  });
};

describe("component directive bubble: listener preservation across morphs", () => {
  beforeEach(() => {
    // The component registry is a singleton; clear it between tests so each
    // test starts from a clean slate.
    componentRegistry.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    componentRegistry.clear();
    vi.restoreAllMocks();
  });

  it("keeps the renderer's submit listener alive after subsequent transcript updates", () => {
    const submitSpy = vi.fn();

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      parserType: "json",
      enableComponentStreaming: true,
      components: {
        TestForm: ((props) => {
          const root = document.createElement("div");
          root.setAttribute("data-test-id", "test-form");
          const form = document.createElement("form");
          form.setAttribute("data-test-id", "test-form-el");
          form.addEventListener("submit", (event) => {
            event.preventDefault();
            submitSpy(String(props.label ?? ""));
          });
          const button = document.createElement("button");
          button.type = "submit";
          button.setAttribute("data-test-id", "test-form-submit");
          button.textContent = "Submit";
          form.appendChild(button);
          root.appendChild(form);
          return root;
        }) satisfies ComponentRenderer,
      },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    directiveMessage(controller, {
      id: "msg-1",
      rawContent: JSON.stringify({ component: "TestForm", props: { label: "alpha" } }),
    });

    const formBefore = mount.querySelector<HTMLFormElement>('[data-test-id="test-form-el"]');
    expect(formBefore).not.toBeNull();

    // Force another render pass: this is what triggered the bug pre-fix:
    // Idiomorph would replace the form via innerHTML serialization, dropping
    // the addEventListener-attached submit handler.
    controller.injectTestMessage({
      type: "message",
      message: {
        id: "msg-2",
        role: "user",
        content: "follow-up",
        createdAt: "2026-04-28T00:00:01.000Z",
        streaming: false,
      },
    });

    // The form node should be the SAME instance: preserved by the live
    // wrapper's `data-preserve-runtime` and the post-morph hydrate skipping
    // when fingerprint is unchanged.
    const formAfter = mount.querySelector<HTMLFormElement>('[data-test-id="test-form-el"]');
    expect(formAfter).toBe(formBefore);

    const submitBtn = mount.querySelector<HTMLButtonElement>('[data-test-id="test-form-submit"]');
    expect(submitBtn).not.toBeNull();
    submitBtn!.click();

    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).toHaveBeenCalledWith("alpha");

    controller.destroy();
  });

  it("rebuilds and re-hydrates the bubble when the directive props change", () => {
    const calls: string[] = [];

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      parserType: "json",
      enableComponentStreaming: true,
      components: {
        TestBadge: ((props) => {
          const el = document.createElement("div");
          el.setAttribute("data-test-id", "test-badge");
          el.textContent = String(props.label ?? "");
          calls.push(String(props.label ?? ""));
          return el;
        }) satisfies ComponentRenderer,
      },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    directiveMessage(controller, {
      id: "badge-1",
      rawContent: JSON.stringify({ component: "TestBadge", props: { label: "first" } }),
    });
    expect(mount.querySelector('[data-test-id="test-badge"]')?.textContent).toBe("first");

    // Same id, new props: fingerprint changes, so renderer should be invoked
    // again and the new element hydrated into the live wrapper.
    directiveMessage(controller, {
      id: "badge-1",
      rawContent: JSON.stringify({ component: "TestBadge", props: { label: "second" } }),
    });
    expect(mount.querySelector('[data-test-id="test-badge"]')?.textContent).toBe("second");
    expect(calls).toEqual(["first", "second"]);

    controller.destroy();
  });

  it("falls back to the standard render path when the directive component is not registered", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      parserType: "json",
      enableComponentStreaming: true,
      components: {},
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    directiveMessage(controller, {
      id: "missing-1",
      rawContent: JSON.stringify({ component: "NotRegistered", props: {} }),
      content: "fallback text",
    });

    // No directive stub left in the DOM.
    expect(mount.querySelector('[data-component-directive-stub="true"]')).toBeNull();
    // Standard bubble renders the message text.
    expect(mount.textContent).toContain("fallback text");

    controller.destroy();
  });
});
