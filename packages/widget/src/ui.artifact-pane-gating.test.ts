// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetConfig, PersonaArtifactDisplayMode } from "./types";

beforeAll(() => {
  // jsdom does not implement matchMedia; the pane's layout code touches it.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

/**
 * Regression tests for the artifact pane auto-open gating by display mode
 * (docs/artifact-display-modes-spec.md, section 1 notes).
 *
 * The pane's own `update()` unhides its shell whenever records exist, so the
 * gate in `syncArtifactPane` must re-assert `persona-hidden` for artifacts
 * whose resolved mode is "card" or "inline". The original implementation only
 * removed the class in the show branch and never re-added it, so inline-mode
 * artifacts still auto-opened the pane.
 */
describe("artifact pane auto-open gating by display mode", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    try {
      window.localStorage.clear();
    } catch {
      /* jsdom edge cases */
    }
  });

  function mountWithDisplay(display?: PersonaArtifactDisplayMode) {
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const config: AgentWidgetConfig = {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown", "component"],
          ...(display ? { display } : {}),
        },
      },
    };
    const controller = createAgentExperience(mount, config);
    return { mount, controller };
  }

  function paneEl(mount: HTMLElement): HTMLElement {
    const el = mount.querySelector<HTMLElement>(".persona-artifact-pane");
    expect(el).not.toBeNull();
    return el!;
  }

  function upsertSample(controller: ReturnType<typeof createAgentExperience>) {
    controller.upsertArtifact({
      id: "gating-test",
      title: "Gating test",
      artifactType: "markdown",
      content: "# Hello",
    });
  }

  it('auto-opens the pane for "panel" mode (default)', () => {
    const { mount, controller } = mountWithDisplay();
    upsertSample(controller);
    expect(paneEl(mount).classList.contains("persona-hidden")).toBe(false);
    controller.destroy();
  });

  it('keeps the pane hidden for "inline" mode artifacts', () => {
    const { mount, controller } = mountWithDisplay("inline");
    upsertSample(controller);
    expect(paneEl(mount).classList.contains("persona-hidden")).toBe(true);
    controller.destroy();
  });

  it('keeps the pane hidden for "card" mode until an explicit open', () => {
    const { mount, controller } = mountWithDisplay("card");
    upsertSample(controller);
    expect(paneEl(mount).classList.contains("persona-hidden")).toBe(true);

    controller.showArtifacts();
    expect(paneEl(mount).classList.contains("persona-hidden")).toBe(false);
    controller.destroy();
  });

  it("does not open the pane when the card's Download button is clicked", () => {
    // jsdom has no object URLs; the download handler needs both to run fully.
    const urlWithBlob = URL as unknown as {
      createObjectURL?: (b: Blob) => string;
      revokeObjectURL?: (u: string) => void;
    };
    const origCreate = urlWithBlob.createObjectURL;
    const origRevoke = urlWithBlob.revokeObjectURL;
    urlWithBlob.createObjectURL = () => "blob:persona-test";
    urlWithBlob.revokeObjectURL = () => {};
    try {
      const { mount, controller } = mountWithDisplay("card");
      upsertSample(controller);

      // Recreate the reference card the way the default renderer shapes it
      // (data-open-artifact root wrapping a data-download-artifact button),
      // mounted inside a real message element so clicks bubble through the
      // messages-wrapper delegation in ui.ts.
      controller.injectAssistantMessage({ content: "See the artifact below." });
      const msgEl = mount.querySelector("[data-message-id]");
      expect(msgEl).not.toBeNull();
      const card = document.createElement("div");
      card.setAttribute("data-open-artifact", "gating-test");
      const dl = document.createElement("button");
      dl.setAttribute("data-download-artifact", "gating-test");
      card.appendChild(dl);
      msgEl!.appendChild(card);

      // Download must not double as an open: the two delegated listeners sit
      // on the same element, so stopPropagation() alone cannot separate them.
      dl.click();
      expect(paneEl(mount).classList.contains("persona-hidden")).toBe(true);

      // Clicking the card itself still opens the pane.
      card.click();
      expect(paneEl(mount).classList.contains("persona-hidden")).toBe(false);
      controller.destroy();
    } finally {
      urlWithBlob.createObjectURL = origCreate;
      urlWithBlob.revokeObjectURL = origRevoke;
    }
  });
});

/**
 * Card custom actions (features.artifacts.cardActions) render on complete
 * reference cards and are wired through the same messages-wrapper delegation as
 * the Download button: looked up by id from fresh config at click time, and
 * explicitly skipped by the card-open listener so a click never opens the pane.
 */
describe("artifact card custom actions (full widget)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    try {
      window.localStorage.clear();
    } catch {
      /* jsdom edge cases */
    }
  });

  type CardActions = NonNullable<
    NonNullable<NonNullable<AgentWidgetConfig["features"]>["artifacts"]>["cardActions"]
  >;

  function configWith(cardActions: CardActions): AgentWidgetConfig {
    return {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown", "component"],
          display: "card",
          cardActions,
        },
      },
    };
  }

  function mountWith(cardActions: CardActions) {
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const controller = createAgentExperience(mount, configWith(cardActions));
    return { mount, controller };
  }

  function paneEl(mount: HTMLElement): HTMLElement {
    const el = mount.querySelector<HTMLElement>(".persona-artifact-pane");
    expect(el).not.toBeNull();
    return el!;
  }

  function upsertSample(controller: ReturnType<typeof createAgentExperience>) {
    controller.upsertArtifact({
      id: "gating-test",
      title: "Gating test",
      artifactType: "markdown",
      content: "# Hello",
    });
  }

  // Fabricate the reference card the way the default renderer shapes it (a
  // data-open-artifact root holding a data-artifact-custom-action button),
  // mounted inside a real message so clicks bubble through the ui.ts delegation.
  function fabricateCard(
    mount: HTMLElement,
    controller: ReturnType<typeof createAgentExperience>,
    actionId: string
  ): HTMLButtonElement {
    controller.injectAssistantMessage({ content: "See the artifact below." });
    const msgEl = mount.querySelector("[data-message-id]");
    expect(msgEl).not.toBeNull();
    const card = document.createElement("div");
    card.setAttribute("data-open-artifact", "gating-test");
    const btn = document.createElement("button");
    btn.setAttribute("data-artifact-custom-action", actionId);
    card.appendChild(btn);
    msgEl!.appendChild(card);
    return btn;
  }

  it("invokes the action onClick with resolved context and does not open the pane", () => {
    const onClick = vi.fn();
    const { mount, controller } = mountWith([
      { id: "save", label: "Save to Drive", icon: "star", onClick },
    ]);
    upsertSample(controller);
    const btn = fabricateCard(mount, controller, "save");

    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    const ctx = onClick.mock.calls[0][0];
    expect(ctx.artifactId).toBe("gating-test");
    // Content resolves from the live session record (upserted markdown).
    expect(ctx.markdown).toBe("# Hello");

    // Card display mode: the delegated action must not open the pane.
    expect(paneEl(mount).classList.contains("persona-hidden")).toBe(true);
    controller.destroy();
  });

  it("looks up the handler by id from fresh config on each click (live update)", () => {
    const oldHandler = vi.fn();
    const newHandler = vi.fn();
    const { mount, controller } = mountWith([
      { id: "save", label: "Save", icon: "star", onClick: oldHandler },
    ]);
    upsertSample(controller);

    const firstBtn = fabricateCard(mount, controller, "save");
    firstBtn.click();
    expect(oldHandler).toHaveBeenCalledTimes(1);
    expect(newHandler).not.toHaveBeenCalled();

    // Swap the action of the same id via a live config update.
    controller.update(
      configWith([{ id: "save", label: "Save", icon: "star", onClick: newHandler }])
    );

    // Re-fabricate a card (the transcript may re-render on update) and click.
    const secondBtn = fabricateCard(mount, controller, "save");
    secondBtn.click();
    expect(oldHandler).toHaveBeenCalledTimes(1);
    expect(newHandler).toHaveBeenCalledTimes(1);
    controller.destroy();
  });
});

/**
 * The expand toggle lives in the artifact pane toolbar (opt-in via
 * layout.showExpandToggle). ui.ts owns the runtime-only expanded state: clicking
 * the toolbar button toggles `persona-artifact-expanded` on the mount root, an
 * onArtifactAction handler can intercept it, and the state resets when the pane
 * is dismissed.
 */
describe("artifact pane expand toggle (full widget)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    try {
      window.localStorage.clear();
    } catch {
      /* jsdom edge cases */
    }
  });

  function mount(
    onArtifactAction?: NonNullable<
      NonNullable<AgentWidgetConfig["features"]>["artifacts"]
    >["onArtifactAction"]
  ) {
    const mountEl = document.createElement("div");
    document.body.appendChild(mountEl);
    const config: AgentWidgetConfig = {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown", "component"],
          layout: { showExpandToggle: true },
          ...(onArtifactAction ? { onArtifactAction } : {}),
        },
      },
    };
    const controller = createAgentExperience(mountEl, config);
    return { mount: mountEl, controller };
  }

  function paneEl(mountEl: HTMLElement): HTMLElement {
    const el = mountEl.querySelector<HTMLElement>(".persona-artifact-pane");
    expect(el).not.toBeNull();
    return el!;
  }

  function expandBtn(mountEl: HTMLElement): HTMLButtonElement {
    const el = paneEl(mountEl).querySelector<HTMLButtonElement>(
      ".persona-artifact-expand-btn"
    );
    expect(el).not.toBeNull();
    return el!;
  }

  function upsertSample(controller: ReturnType<typeof createAgentExperience>) {
    controller.upsertArtifact({
      id: "expand-test",
      title: "Expand test",
      artifactType: "markdown",
      content: "# Hello",
    });
  }

  it("toggles persona-artifact-expanded on the mount root when the button is clicked", () => {
    const { mount: mountEl, controller } = mount();
    upsertSample(controller);
    expect(mountEl.classList.contains("persona-artifact-expanded")).toBe(false);

    expandBtn(mountEl).click();
    expect(mountEl.classList.contains("persona-artifact-expanded")).toBe(true);

    expandBtn(mountEl).click();
    expect(mountEl.classList.contains("persona-artifact-expanded")).toBe(false);
    controller.destroy();
  });

  it("does not add the class when onArtifactAction returns true for type 'expand'", () => {
    const { mount: mountEl, controller } = mount((action) =>
      action.type === "expand" ? true : undefined
    );
    upsertSample(controller);

    expandBtn(mountEl).click();
    expect(mountEl.classList.contains("persona-artifact-expanded")).toBe(false);
    controller.destroy();
  });

  it("clears persona-artifact-expanded when the pane is dismissed", () => {
    const { mount: mountEl, controller } = mount();
    upsertSample(controller);

    expandBtn(mountEl).click();
    expect(mountEl.classList.contains("persona-artifact-expanded")).toBe(true);

    // Default toolbar preset's Close control dismisses the pane.
    const close = paneEl(mountEl).querySelector<HTMLButtonElement>(
      '[aria-label="Close artifacts panel"]'
    );
    expect(close).not.toBeNull();
    close!.click();
    expect(mountEl.classList.contains("persona-artifact-expanded")).toBe(false);
    controller.destroy();
  });

  it("reveals the toggle via a live config update and collapses when disabled again", () => {
    const mountEl = document.createElement("div");
    document.body.appendChild(mountEl);
    const base: AgentWidgetConfig = {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        artifacts: { enabled: true, allowedTypes: ["markdown", "component"] },
      },
    };
    const controller = createAgentExperience(mountEl, base);
    upsertSample(controller);
    // The pane is built once at mount, so the button exists but stays hidden
    // until a config carrying showExpandToggle arrives via update().
    expect(expandBtn(mountEl).classList.contains("persona-hidden")).toBe(true);

    controller.update({
      ...base,
      features: {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown", "component"],
          layout: { showExpandToggle: true },
        },
      },
    });
    expect(expandBtn(mountEl).classList.contains("persona-hidden")).toBe(false);

    expandBtn(mountEl).click();
    expect(mountEl.classList.contains("persona-artifact-expanded")).toBe(true);

    // Turning the toggle back off hides the button and collapses the pane.
    controller.update(base);
    expect(mountEl.classList.contains("persona-artifact-expanded")).toBe(false);
    expect(expandBtn(mountEl).classList.contains("persona-hidden")).toBe(true);
    controller.destroy();
  });
});

/**
 * Inline chrome delegation (display: "inline"). The inline block carries
 * data-artifact-inline; its custom-action buttons resolve from
 * features.artifacts.inlineActions (not cardActions), and its Expand button
 * opens the pane through the same open path as a card click, interceptable via
 * onArtifactAction({ type: "open" }).
 */
describe("inline artifact chrome delegation (full widget)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    try {
      window.localStorage.clear();
    } catch {
      /* jsdom edge cases */
    }
  });

  type Artifacts = NonNullable<
    NonNullable<AgentWidgetConfig["features"]>["artifacts"]
  >;

  function mountInline(artifacts: Partial<Artifacts>) {
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const config: AgentWidgetConfig = {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown", "component"],
          display: "inline",
          ...artifacts,
        },
      },
    };
    const controller = createAgentExperience(mount, config);
    return { mount, controller };
  }

  function paneEl(mount: HTMLElement): HTMLElement {
    const el = mount.querySelector<HTMLElement>(".persona-artifact-pane");
    expect(el).not.toBeNull();
    return el!;
  }

  function upsertSample(controller: ReturnType<typeof createAgentExperience>) {
    controller.upsertArtifact({
      id: "inline-test",
      title: "Inline test",
      artifactType: "markdown",
      content: "# Hello",
    });
  }

  // Fabricate an inline block the way the default renderer shapes it: a
  // data-artifact-inline root holding a delegated button, mounted inside a real
  // message so clicks bubble through the ui.ts delegation.
  function fabricateInline(
    mount: HTMLElement,
    controller: ReturnType<typeof createAgentExperience>,
    attr: string,
    value: string
  ): HTMLButtonElement {
    controller.injectAssistantMessage({ content: "See the artifact above." });
    const msgEl = mount.querySelector("[data-message-id]");
    expect(msgEl).not.toBeNull();
    const block = document.createElement("div");
    block.setAttribute("data-artifact-inline", "inline-test");
    const btn = document.createElement("button");
    btn.setAttribute(attr, value);
    block.appendChild(btn);
    msgEl!.appendChild(block);
    return btn;
  }

  it("resolves a custom action from inlineActions (not cardActions) with content", () => {
    const inlineHandler = vi.fn();
    const cardHandler = vi.fn();
    const { mount, controller } = mountInline({
      inlineActions: [
        { id: "log", label: "Log", icon: "star", onClick: inlineHandler },
      ],
      cardActions: [
        { id: "log", label: "Log", icon: "star", onClick: cardHandler },
      ],
    });
    upsertSample(controller);
    const btn = fabricateInline(mount, controller, "data-artifact-custom-action", "log");

    btn.click();
    // The inline-surface list wins over cardActions for the same id.
    expect(inlineHandler).toHaveBeenCalledTimes(1);
    expect(cardHandler).not.toHaveBeenCalled();
    const ctx = inlineHandler.mock.calls[0][0];
    expect(ctx.artifactId).toBe("inline-test");
    expect(ctx.markdown).toBe("# Hello");
    controller.destroy();
  });

  it("opens the pane when the Expand button is clicked", () => {
    const { mount, controller } = mountInline({});
    upsertSample(controller);
    // Inline mode keeps the pane closed until an explicit open.
    expect(paneEl(mount).classList.contains("persona-hidden")).toBe(true);

    const btn = fabricateInline(
      mount,
      controller,
      "data-expand-artifact-inline",
      "inline-test"
    );
    btn.click();
    expect(paneEl(mount).classList.contains("persona-hidden")).toBe(false);
    controller.destroy();
  });

  it("does not open the pane when onArtifactAction intercepts the open", () => {
    const { mount, controller } = mountInline({
      onArtifactAction: (action) =>
        action.type === "open" ? true : undefined,
    });
    upsertSample(controller);
    const btn = fabricateInline(
      mount,
      controller,
      "data-expand-artifact-inline",
      "inline-test"
    );
    btn.click();
    expect(paneEl(mount).classList.contains("persona-hidden")).toBe(true);
    controller.destroy();
  });
});
