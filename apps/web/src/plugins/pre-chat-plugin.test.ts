// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { createAgentExperience } from "@runtypelabs/persona";
import type {
  AgentWidgetPluginStorage,
  AgentWidgetRenderWelcomeContext,
} from "@runtypelabs/persona";

import {
  createPreChatPlugin,
  type PreChatPlugin,
  type PreChatPluginOptions,
} from "./pre-chat-plugin";

const createMemoryStorage = (): AgentWidgetPluginStorage => {
  const entries = new Map<string, string>();
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
    remove: (key) => {
      entries.delete(key);
    },
  };
};

/** Mirrors the core's arbitration for both hooks over one shared store. */
const createHarness = (
  options: PreChatPluginOptions = {},
  overrides: { plugin?: PreChatPlugin; storage?: AgentWidgetPluginStorage } = {},
) => {
  const plugin = overrides.plugin ?? createPreChatPlugin(options);
  const storage = overrides.storage ?? createMemoryStorage();

  const cleanups: Array<() => void> = [];
  let welcome: HTMLElement | null = null;
  let composer: HTMLElement | null = null;

  const renderWelcome = (): HTMLElement | null => {
    cleanups.splice(0, cleanups.length).forEach((fn) => fn());
    welcome?.remove();
    welcome =
      plugin.renderWelcome?.({
        config: {
          title: "Hello",
          subtitle: "Ask about anything on this page.",
          variant: "card",
          dismiss: "never",
        },
        variant: "card",
        visible: true,
        defaultRenderer: () => document.createElement("div"),
        sendMessage: () => {},
        requestRender: () => {
          renderWelcome();
        },
        renderStarter: () => document.createElement("button"),
        storage,
        onCleanup: (fn) => {
          cleanups.push(fn);
        },
      } satisfies AgentWidgetRenderWelcomeContext) ?? null;
    if (welcome) document.body.appendChild(welcome);
    return welcome;
  };

  const renderComposer = (): HTMLElement | null => {
    composer?.remove();
    composer =
      plugin.renderComposer?.({
        config: { copy: { inputPlaceholder: "Ask a question…" } },
        defaultRenderer: () => document.createElement("div"),
        onSubmit: () => {},
        streaming: false,
        disabled: false,
        openAttachmentPicker: () => {},
        requestRender: () => {
          renderComposer();
        },
        storage,
      }) ?? null;
    if (composer) document.body.appendChild(composer);
    return composer;
  };

  const fill = (name: string, value: string) => {
    const control = welcome?.querySelector<HTMLInputElement>(
      `[name="${name}"]`,
    );
    if (!control) throw new Error(`No field named ${name}`);
    control.value = value;
    control.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const submit = () => {
    (welcome as HTMLFormElement | null)?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  };

  return {
    plugin,
    storage,
    renderWelcome,
    renderComposer,
    fill,
    submit,
    welcome: () => welcome,
    composer: () => composer,
  };
};

describe("createPreChatPlugin", () => {
  it("renders the form and a gated composer while identity is missing", () => {
    const harness = createHarness();

    expect(harness.renderComposer()).not.toBeNull();
    const form = harness.renderWelcome();

    expect(form?.className).toBe("pre-chat");
    expect(
      Array.from(form?.querySelectorAll("[name]") ?? []).map(
        (control) => (control as HTMLInputElement).name,
      ),
    ).toEqual(["name", "email", "topic"]);
    const input = harness
      .composer()
      ?.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]");
    expect(input?.disabled).toBe(true);
  });

  it("keeps the form up and reports errors when required fields are missing", () => {
    const harness = createHarness();
    harness.renderWelcome();
    harness.fill("email", "not-an-email");
    harness.submit();

    expect(harness.welcome()?.className).toBe("pre-chat");
    expect(harness.welcome()?.textContent).toContain("Name is required.");
    expect(harness.welcome()?.textContent).toContain(
      "Enter a valid email address.",
    );
    expect(harness.plugin.getIdentity()).toBeNull();
  });

  it("stores identity and falls through both hooks on submit", () => {
    const harness = createHarness();
    harness.renderComposer();
    harness.renderWelcome();
    harness.fill("name", "Ada Lovelace");
    harness.fill("email", "ada@example.com");
    harness.fill("topic", "Billing");
    harness.submit();

    expect(harness.plugin.getIdentity()).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      topic: "Billing",
    });
    // Both hooks re-ran through their own requestRender and returned null.
    expect(harness.welcome()).toBeNull();
    expect(harness.composer()).toBeNull();
  });

  it("carries the identity on every dispatch through the context provider", async () => {
    const harness = createHarness();
    harness.renderWelcome();
    harness.fill("name", "Ada Lovelace");
    harness.fill("email", "ada@example.com");
    harness.submit();

    expect(
      await harness.plugin.contextProvider({ messages: [], config: {} }),
    ).toEqual({
      visitor: { name: "Ada Lovelace", email: "ada@example.com" },
    });
  });

  it("skips the form for a returning visitor and re-gates after a reset", () => {
    const storage = createMemoryStorage();
    const first = createHarness({}, { storage });
    first.renderWelcome();
    first.fill("name", "Ada Lovelace");
    first.fill("email", "ada@example.com");
    first.submit();

    const returning = createHarness({}, { storage });
    expect(returning.renderComposer()).toBeNull();
    expect(returning.renderWelcome()).toBeNull();

    returning.plugin.reset();
    expect(returning.renderComposer()).not.toBeNull();
    expect(returning.renderWelcome()?.className).toBe("pre-chat");
  });

  it("keeps typed values across a re-render triggered by controller.update()", () => {
    const harness = createHarness();
    harness.renderWelcome();
    harness.fill("name", "Ada Lovelace");

    // Same path a live `welcome` update takes: cleanups run, the element is
    // dropped, arbitration re-runs with a fresh ctx.
    harness.renderWelcome();

    expect(
      harness.welcome()?.querySelector<HTMLInputElement>('[name="name"]')?.value,
    ).toBe("Ada Lovelace");
  });

  it("uses a host-supplied store instead of ctx.storage when one is given", () => {
    const hostStore = createMemoryStorage();
    const ctxStore = createMemoryStorage();
    const harness = createHarness({ storage: hostStore }, { storage: ctxStore });
    harness.renderWelcome();
    harness.fill("name", "Ada Lovelace");
    harness.fill("email", "ada@example.com");
    harness.submit();

    expect(hostStore.get("identity")).toContain("ada@example.com");
    expect(ctxStore.get("identity")).toBeNull();
  });

  it("honors host-declared fields", () => {
    const harness = createHarness({
      fields: [{ name: "email", label: "Email", type: "email", required: true }],
    });
    harness.renderWelcome();

    expect(
      Array.from(harness.welcome()?.querySelectorAll("[name]") ?? []).map(
        (control) => (control as HTMLInputElement).name,
      ),
    ).toEqual(["email"]);

    harness.fill("email", "ada@example.com");
    harness.submit();
    expect(harness.plugin.getIdentity()).toEqual({ email: "ada@example.com" });
  });
});

// Blueprint acceptance: the gate and the unlock run against the real hooks,
// including the core's composer rebuild.
describe("createPreChatPlugin against a live widget", () => {
  it("gates the composer, then unlocks it and the welcome surface on submit", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const plugin = createPreChatPlugin();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      persistState: false,
      plugins: [plugin],
      contextProviders: [plugin.contextProvider],
      launcher: { enabled: false },
    });
    controller.open();

    const form = mount.querySelector<HTMLFormElement>(".pre-chat");
    expect(form).not.toBeNull();
    expect(
      mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")
        ?.disabled,
    ).toBe(true);

    const setValue = (name: string, value: string) => {
      const control = form?.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (!control) throw new Error(`No field named ${name}`);
      control.value = value;
      control.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setValue("name", "Ada Lovelace");
    setValue("email", "ada@example.com");
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(mount.querySelector(".pre-chat")).toBeNull();
    expect(mount.querySelector(".pre-chat-gate")).toBeNull();
    expect(
      mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")
        ?.disabled,
    ).toBe(false);
    // No transcript injection: identity travels only as request context, so
    // the transcript stays empty and the welcome surface remains a welcome.
    expect(controller.getMessages()).toHaveLength(0);
    // The default welcome card owns the host again.
    expect(mount.querySelector("[data-persona-welcome]")?.textContent).toContain(
      "Hello",
    );

    controller.destroy();
    document.body.innerHTML = "";
  });
});
