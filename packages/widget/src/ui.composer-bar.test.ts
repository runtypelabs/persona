// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

describe("createAgentExperience composer-bar mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    // The widget's default localStorage adapter persists chat history
    // across createAgentExperience calls. Clear it so each test starts
    // with an empty session.
    try {
      window.localStorage.clear();
    } catch {
      /* jsdom edge cases */
    }
  });

  it("starts collapsed with pill geometry: bottom-centered, configured width on pillRoot", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "composer-bar",
        composerBar: { collapsedMaxWidth: "640px", bottomOffset: "20px" },
      },
    });

    const wrapper = mount.querySelector<HTMLElement>(".persona-widget-wrapper[data-persona-composer-bar]");
    const pillRoot = mount.querySelector<HTMLElement>(".persona-widget-pill-root");
    expect(wrapper).not.toBeNull();
    expect(pillRoot).not.toBeNull();
    expect(wrapper!.dataset.state).toBe("collapsed");
    expect(wrapper!.dataset.expandedSize).toBe("anchored");
    // pillRoot mirrors state attributes so peek/pill rules can cascade.
    expect(pillRoot!.dataset.state).toBe("collapsed");
    expect(pillRoot!.dataset.expandedSize).toBe("anchored");
    // Pill geometry now lives on pillRoot (a viewport-fixed sibling of
    // wrapper); horizontal positioning is provided by CSS, ui.ts writes
    // bottom + (optional) collapsed width.
    expect(pillRoot!.style.bottom).toBe("20px");
    expect(pillRoot!.style.width).toBe("640px");

    controller.destroy();
  });

  it("leaves collapsed width empty when no collapsedMaxWidth is configured (CSS responsive defaults take over)", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "composer-bar",
        composerBar: { bottomOffset: "16px" },
      },
    });

    const wrapper = mount.querySelector<HTMLElement>(".persona-widget-wrapper[data-persona-composer-bar]");
    const pillRoot = mount.querySelector<HTMLElement>(".persona-widget-pill-root");
    expect(wrapper).not.toBeNull();
    expect(pillRoot).not.toBeNull();
    expect(wrapper!.dataset.state).toBe("collapsed");
    // No collapsedMaxWidth → leave inline width empty so the CSS media
    // queries on .persona-widget-pill-root provide the responsive default.
    expect(pillRoot!.style.width).toBe("");
    expect(pillRoot!.style.bottom).toBe("16px");

    controller.destroy();
  });

  it("clears collapsed-only inline styles when expanding to anchored", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "composer-bar",
        composerBar: {
          expandedSize: "anchored",
          expandedMaxWidth: "900px",
          expandedTopOffset: "10vh",
          collapsedMaxWidth: "720px",
          bottomOffset: "16px",
        },
      },
    });

    controller.open();

    const wrapper = mount.querySelector<HTMLElement>(".persona-widget-wrapper[data-persona-composer-bar]");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.dataset.state).toBe("expanded");
    // Anchored uses both top + bottom so the column is bounded by the
    // viewport. Bottom edge clears the pill-area (pill + peek live in the
    // pillRoot below) so the wrapper's chrome doesn't overlap them.
    expect(wrapper!.style.bottom).toBe(
      "calc(16px + var(--persona-pill-area-height, 80px))"
    );
    expect(wrapper!.style.top).toBe("10vh");
    expect(wrapper!.style.left).toBe("50%");
    expect(wrapper!.style.transform).toBe("translateX(-50%)");
    expect(wrapper!.style.width).toBe("900px");
    expect(wrapper!.style.maxWidth).toBe("calc(100vw - 32px)");
    // Critical regression check: the previous implementation set
    // `width: calc(100% - 32px)` inline in createWrapper and never
    // cleared it. Make sure it's gone after expanding.
    expect(wrapper!.style.width).not.toContain("100%");

    controller.destroy();
  });

  it("clears all inline geometry when expanding to fullscreen so CSS rule wins", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "composer-bar",
        composerBar: { expandedSize: "fullscreen" },
      },
    });

    controller.open();

    const wrapper = mount.querySelector<HTMLElement>("[data-persona-composer-bar]");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.dataset.state).toBe("expanded");
    expect(wrapper!.dataset.expandedSize).toBe("fullscreen");
    // Fullscreen lets the CSS rule (`inset: 0; transform: none; ...`) own
    // the geometry, so all the per-state inline styles must be cleared.
    expect(wrapper!.style.left).toBe("");
    expect(wrapper!.style.right).toBe("");
    expect(wrapper!.style.top).toBe("");
    expect(wrapper!.style.bottom).toBe("");
    expect(wrapper!.style.transform).toBe("");
    expect(wrapper!.style.width).toBe("");
    expect(wrapper!.style.maxWidth).toBe("");
    expect(wrapper!.style.height).toBe("");

    controller.destroy();
  });

  it("centers the modal expanded variant via translate(-50%, -50%)", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "composer-bar",
        composerBar: {
          expandedSize: "modal",
          modalMaxWidth: "640px",
          modalMaxHeight: "70vh",
        },
      },
    });

    controller.open();

    const wrapper = mount.querySelector<HTMLElement>("[data-persona-composer-bar]");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.style.top).toBe("50%");
    expect(wrapper!.style.left).toBe("50%");
    expect(wrapper!.style.transform).toBe("translate(-50%, -50%)");
    expect(wrapper!.style.width).toBe("640px");
    expect(wrapper!.style.maxWidth).toBe("calc(100vw - 32px)");
    expect(wrapper!.style.maxHeight).toBe("70vh");

    controller.destroy();
  });

  it("returns to collapsed pill geometry on close, with no stale expanded inline styles", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "composer-bar",
        composerBar: { expandedSize: "modal", modalMaxHeight: "60vh" },
      },
    });

    controller.open();
    controller.close();

    const wrapper = mount.querySelector<HTMLElement>(".persona-widget-wrapper[data-persona-composer-bar]");
    const pillRoot = mount.querySelector<HTMLElement>(".persona-widget-pill-root");
    expect(wrapper).not.toBeNull();
    expect(pillRoot).not.toBeNull();
    expect(wrapper!.dataset.state).toBe("collapsed");
    expect(pillRoot!.dataset.state).toBe("collapsed");
    // Modal's expanded geometry on the wrapper must be cleared on close:    // the wrapper has no visible chrome in collapsed state since the
    // container is hidden via CSS and the pill lives in pillRoot.
    expect(wrapper!.style.transform).toBe("");
    expect(wrapper!.style.top).toBe("");
    expect(wrapper!.style.maxHeight).toBe("");
    expect(wrapper!.style.height).toBe("");
    // Pill geometry on pillRoot is reapplied per state: bottom uses the
    // configured offset (default 16px).
    expect(pillRoot!.style.bottom).toBe("16px");

    controller.destroy();
  });

  it("does NOT cap the pill composer form with contentMaxWidth: the pill matches the wrapper's responsive width", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "composer-bar",
        composerBar: { contentMaxWidth: "600px" },
      },
    });

    const composerForm = mount.querySelector<HTMLElement>("[data-persona-composer-form]");
    expect(composerForm).not.toBeNull();
    // The pill is the composer in composer-bar mode and must fill the
    // wrapper (which carries the responsive 50/70/90vw width). Capping
    // the form at contentMaxWidth + auto-margins would shrink it to
    // content width inside a wider wrapper.
    expect(composerForm!.style.maxWidth).toBe("");
    expect(composerForm!.style.marginLeft).toBe("");
    expect(composerForm!.style.marginRight).toBe("");

    controller.destroy();
  });

  it("renders the purpose-built pill composer (not the column-stacked full composer)", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    const composerForm = mount.querySelector<HTMLElement>("[data-persona-composer-form]");
    expect(composerForm).not.toBeNull();
    // Pill marker class present.
    expect(composerForm!.classList.contains("persona-pill-composer")).toBe(true);
    // Full-composer column-stack utility classes are NOT present in pill mode.
    expect(composerForm!.classList.contains("persona-flex-col")).toBe(false);
    expect(composerForm!.classList.contains("persona-rounded-2xl")).toBe(false);

    controller.destroy();
  });

  it("renders a minimal close + clear-chat pair (no full header strip) in composer-bar mode", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "composer-bar",
        title: "Should Not Render",
        subtitle: "Should Not Render Either",
      },
    });

    // Header placeholder exists for downstream toggles but renders nothing.
    const headerPlaceholder = mount.querySelector<HTMLElement>(".persona-widget-header");
    expect(headerPlaceholder).not.toBeNull();
    expect(headerPlaceholder!.style.display).toBe("none");
    expect(headerPlaceholder!.textContent).toBe("");

    // Close button exists and is absolutely positioned in the corner.
    const closeButton = mount.querySelector<HTMLButtonElement>(
      "[aria-label='Close chat'], [aria-label='Minimize']"
    );
    expect(closeButton).not.toBeNull();
    const closeWrapper = closeButton!.parentElement!;
    expect(closeWrapper.classList.contains("persona-composer-bar-close")).toBe(true);
    expect(closeWrapper.style.position).toBe("absolute");
    expect(closeWrapper.style.top).toBe("8px");
    expect(closeWrapper.style.right).toBe("8px");

    // Clear-chat button renders by default (launcher.clearChat.enabled defaults
    // to true), positioned immediately left of the × close.
    const clearChat = mount.querySelector<HTMLButtonElement>(
      "[aria-label='Clear chat'], [aria-label='Start over']"
    );
    expect(clearChat).not.toBeNull();
    const clearWrapper = clearChat!.parentElement!;
    expect(clearWrapper.classList.contains("persona-composer-bar-clear-chat")).toBe(true);
    expect(clearWrapper.style.position).toBe("absolute");
    expect(clearWrapper.style.top).toBe("8px");
    expect(clearWrapper.style.right).toBe("32px");
    // Composer-bar override sizes the clear button to match the smaller close.
    expect(clearChat!.style.height).toBe("16px");
    expect(clearChat!.style.width).toBe("16px");

    controller.destroy();
  });

  it("hides the clear-chat button when launcher.clearChat.enabled is false", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "composer-bar",
        clearChat: { enabled: false },
      },
    });

    const clearChat = mount.querySelector<HTMLButtonElement>(
      "[aria-label='Clear chat'], [aria-label='Start over']"
    );
    expect(clearChat).toBeNull();

    // Close button is still present.
    const closeButton = mount.querySelector<HTMLButtonElement>(
      "[aria-label='Close chat'], [aria-label='Minimize']"
    );
    expect(closeButton).not.toBeNull();

    controller.destroy();
  });

  it("clicking the clear-chat button clears messages and artifacts", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
      features: { artifacts: { enabled: true } },
    });

    controller.injectAssistantMessage({ content: "hello there" });
    controller.injectUserMessage({ content: "ping" });
    controller.upsertArtifact({
      artifactType: "markdown",
      title: "Generated analysis",
      content: "# Revenue trend",
    });
    expect(controller.getMessages().length).toBeGreaterThan(0);
    expect(controller.getArtifacts()).toHaveLength(1);

    const clearChat = mount.querySelector<HTMLButtonElement>(
      "[aria-label='Clear chat'], [aria-label='Start over']"
    );
    expect(clearChat).not.toBeNull();
    clearChat!.click();

    expect(controller.getMessages().length).toBe(0);
    expect(controller.getArtifacts()).toHaveLength(0);

    controller.destroy();
  });

  it("honors launcher.clearChat.tooltipText override (e.g. 'Start over')", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "composer-bar",
        clearChat: { tooltipText: "Start over" },
      },
    });

    const clearChat = mount.querySelector<HTMLButtonElement>(
      "[aria-label='Start over']"
    );
    expect(clearChat).not.toBeNull();

    controller.destroy();
  });

  it("places the pill (footer) inside pillRoot: a viewport-fixed sibling of the wrapper, not inside the panel", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    const wrapper = mount.querySelector<HTMLElement>(".persona-widget-wrapper[data-persona-composer-bar]");
    const pillRoot = mount.querySelector<HTMLElement>(".persona-widget-pill-root");
    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    const container = mount.querySelector<HTMLElement>(".persona-widget-container");
    const composerForm = mount.querySelector<HTMLFormElement>(
      "[data-persona-composer-form]"
    );
    expect(wrapper).not.toBeNull();
    expect(pillRoot).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(container).not.toBeNull();
    expect(composerForm).not.toBeNull();

    // pillRoot is mounted as a sibling of the wrapper inside `mount`, so it
    // never inherits the wrapper's geometry transitions (critical for modal
    // mode where the wrapper has `transform: translate(-50%, -50%)`).
    expect(pillRoot!.parentElement).toBe(mount);
    expect(wrapper!.parentElement).toBe(mount);
    expect(wrapper!.contains(pillRoot!)).toBe(false);

    // Footer in pill mode = the form's parent (`.persona-widget-footer--pill`).
    // It now lives inside pillRoot, NOT inside the panel/container.
    const footer = composerForm!.closest(".persona-widget-footer--pill") as HTMLElement | null;
    expect(footer).not.toBeNull();
    expect(footer!.parentElement).toBe(pillRoot);
    expect(panel!.contains(footer!)).toBe(false);
    expect(container!.contains(footer!)).toBe(false);

    controller.destroy();
  });

  it("keeps the pill composer mounted when artifacts enable the split layout", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
      features: { artifacts: { enabled: true } },
    });

    const pillRoot = mount.querySelector<HTMLElement>(".persona-widget-pill-root");
    const composerInput = pillRoot?.querySelector<HTMLTextAreaElement>(
      "[data-persona-composer-input]"
    );
    expect(pillRoot).not.toBeNull();
    expect(composerInput).not.toBeNull();
    expect(composerInput!.placeholder).toBeTruthy();

    controller.open();
    expect(pillRoot!.dataset.state).toBe("expanded");
    expect(composerInput!.isConnected).toBe(true);

    controller.destroy();
  });

  it("renders configured suggestion chips in the composer-bar footer", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
      suggestionChips: ["Revenue trend", "Channel mix"],
    });

    const pillRoot = mount.querySelector<HTMLElement>(".persona-widget-pill-root");
    const suggestions = pillRoot?.querySelector<HTMLElement>(
      "[data-persona-composer-suggestions]"
    );
    expect(suggestions?.querySelectorAll("button")).toHaveLength(2);

    controller.open();
    expect(pillRoot!.dataset.state).toBe("expanded");
    expect(suggestions!.isConnected).toBe(true);

    controller.destroy();
  });

  it("hides the container when collapsed and shows it (display:flex) when expanded", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    const container = mount.querySelector<HTMLElement>(".persona-widget-container");
    expect(container).not.toBeNull();
    // Initial state is collapsed → container hidden, only the pill visible.
    expect(container!.style.display).toBe("none");

    controller.open();
    expect(container!.style.display).toBe("flex");

    controller.close();
    expect(container!.style.display).toBe("none");

    controller.destroy();
  });

  it("mirrors data-state from wrapper to pillRoot when toggling open/collapsed", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "composer-bar",
        composerBar: { expandedSize: "modal" },
      },
    });

    const wrapper = mount.querySelector<HTMLElement>(".persona-widget-wrapper[data-persona-composer-bar]");
    const pillRoot = mount.querySelector<HTMLElement>(".persona-widget-pill-root");
    expect(wrapper).not.toBeNull();
    expect(pillRoot).not.toBeNull();

    // Initial: collapsed mirrored on both.
    expect(wrapper!.dataset.state).toBe("collapsed");
    expect(pillRoot!.dataset.state).toBe("collapsed");
    expect(wrapper!.dataset.expandedSize).toBe("modal");
    expect(pillRoot!.dataset.expandedSize).toBe("modal");

    controller.open();
    expect(wrapper!.dataset.state).toBe("expanded");
    expect(pillRoot!.dataset.state).toBe("expanded");

    controller.close();
    expect(wrapper!.dataset.state).toBe("collapsed");
    expect(pillRoot!.dataset.state).toBe("collapsed");

    controller.destroy();
  });

  it("does NOT dismiss the expanded panel when pointerdown lands on the pill (now outside the wrapper)", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    controller.open();
    const wrapper = mount.querySelector<HTMLElement>(".persona-widget-wrapper[data-persona-composer-bar]");
    const pillRoot = mount.querySelector<HTMLElement>(".persona-widget-pill-root");
    expect(wrapper!.dataset.state).toBe("expanded");
    expect(pillRoot).not.toBeNull();

    // Sanity: pillRoot is OUTSIDE the wrapper subtree, so the dismiss
    // listener's wrapper-only composedPath check would treat pill clicks
    // as "outside" without the explicit pillRoot fall-through.
    expect(wrapper!.contains(pillRoot!)).toBe(false);

    const textarea = mount.querySelector<HTMLTextAreaElement>(
      "[data-persona-composer-input]"
    );
    expect(textarea).not.toBeNull();
    expect(pillRoot!.contains(textarea!)).toBe(true);

    textarea!.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true })
    );
    expect(wrapper!.dataset.state).toBe("expanded");

    controller.destroy();
  });

  it("dismisses the expanded panel when a pointerdown fires outside the wrapper", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    controller.open();
    const wrapper = mount.querySelector<HTMLElement>("[data-persona-composer-bar]");
    expect(wrapper!.dataset.state).toBe("expanded");

    // Simulate a pointerdown anywhere outside the wrapper. Use document.body
    // as the target: definitely outside the wrapper subtree.
    const outsideTarget = document.createElement("div");
    document.body.appendChild(outsideTarget);
    outsideTarget.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true })
    );

    expect(wrapper!.dataset.state).toBe("collapsed");

    outsideTarget.remove();
    controller.destroy();
  });

  it("dismisses the expanded panel when Escape is pressed", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    controller.open();
    const wrapper = mount.querySelector<HTMLElement>("[data-persona-composer-bar]");
    expect(wrapper!.dataset.state).toBe("expanded");

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );

    expect(wrapper!.dataset.state).toBe("collapsed");

    controller.destroy();
  });

  it("does NOT dismiss the panel when Escape is pressed during IME composition", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    controller.open();
    const wrapper = mount.querySelector<HTMLElement>("[data-persona-composer-bar]");
    expect(wrapper!.dataset.state).toBe("expanded");

    // KeyboardEvent doesn't expose an `isComposing` constructor option, so
    // override the getter to simulate the IME-composing state.
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    Object.defineProperty(event, "isComposing", { value: true });
    document.dispatchEvent(event);

    expect(wrapper!.dataset.state).toBe("expanded");

    controller.destroy();
  });

  // --- Peek banner tests --------------------------------------------------
  // The peek banner (data-persona-pill-peek) is a chrome-less row above the
  // pill that previews the trailing 100 chars of the most recent assistant
  // message. Visible when (collapsed) AND (assistant content exists) AND
  // (isStreaming OR composer hovered). The streaming branch is exercised
  // end-to-end in manual demo (sendMessage path requires fetch); these unit
  // tests cover the hover branch and the visibility/content invariants.

  const getPeekBanner = (mount: HTMLElement) =>
    mount.querySelector<HTMLButtonElement>("[data-persona-pill-peek]");

  const getPeekText = (mount: HTMLElement) =>
    mount.querySelector<HTMLElement>(".persona-pill-peek__text");

  it("renders a hidden peek banner above the pill inside pillRoot when collapsed with no messages", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    const peek = getPeekBanner(mount);
    expect(peek).not.toBeNull();
    expect(peek!.classList.contains("persona-pill-peek--visible")).toBe(false);

    // Order inside pillRoot: peek → footer (pill). pillRoot's `gap` provides
    // the visible spacing between them.
    const pillRoot = mount.querySelector<HTMLElement>(".persona-widget-pill-root");
    expect(pillRoot).not.toBeNull();
    const children = Array.from(pillRoot!.children);
    const peekIdx = children.indexOf(peek!);
    const footerIdx = children.findIndex((c) =>
      c.classList.contains("persona-widget-footer")
    );
    expect(peekIdx).toBe(0);
    expect(footerIdx).toBe(1);

    controller.destroy();
  });

  it("shows the peek with trailing 100 chars when hovered with a long assistant message", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    const longText = "a".repeat(150);
    controller.injectAssistantMessage({ content: longText });
    // injectAssistantMessage auto-opens; close to evaluate the collapsed-pill UX.
    controller.close();

    const wrapper = mount.querySelector<HTMLElement>("[data-persona-composer-bar]");
    expect(wrapper!.dataset.state).toBe("collapsed");

    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    panel!.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    const peek = getPeekBanner(mount);
    expect(peek!.classList.contains("persona-pill-peek--visible")).toBe(true);

    const textNode = getPeekText(mount);
    // Leading U+2026 prefix + last 100 chars.
    expect(textNode!.textContent).toBe(`…${"a".repeat(100)}`);
    expect(textNode!.textContent!.length).toBe(101);

    controller.destroy();
  });

  it("shows the full message text when shorter than 100 chars (no leading ellipsis)", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    controller.injectAssistantMessage({ content: "thanks i like the recommendation" });
    controller.close();

    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    panel!.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    const peek = getPeekBanner(mount);
    expect(peek!.classList.contains("persona-pill-peek--visible")).toBe(true);
    expect(getPeekText(mount)!.textContent).toBe("thanks i like the recommendation");

    controller.destroy();
  });

  it("hides the peek again on pointerleave from the panel", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    controller.injectAssistantMessage({ content: "Earlier reply" });
    controller.close();

    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    panel!.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    expect(getPeekBanner(mount)!.classList.contains("persona-pill-peek--visible")).toBe(true);

    panel!.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    expect(getPeekBanner(mount)!.classList.contains("persona-pill-peek--visible")).toBe(false);

    controller.destroy();
  });

  it("clicking the peek banner expands the panel", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    controller.injectAssistantMessage({ content: "Earlier reply" });
    controller.close();

    const wrapper = mount.querySelector<HTMLElement>("[data-persona-composer-bar]");
    expect(wrapper!.dataset.state).toBe("collapsed");

    const peek = getPeekBanner(mount)!;
    peek.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true })
    );
    expect(wrapper!.dataset.state).toBe("expanded");

    controller.destroy();
  });

  it("hides the peek banner when the panel is expanded, even with hover", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    controller.injectAssistantMessage({ content: "Earlier reply" });
    // Panel was auto-opened by injectAssistantMessage.
    const wrapper = mount.querySelector<HTMLElement>("[data-persona-composer-bar]");
    expect(wrapper!.dataset.state).toBe("expanded");

    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    panel!.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    expect(getPeekBanner(mount)!.classList.contains("persona-pill-peek--visible")).toBe(false);

    controller.destroy();
  });

  it("ignores user-only messages (peek requires assistant content)", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    controller.injectUserMessage({ content: "what is the price?" });
    controller.close();

    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    panel!.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    expect(getPeekBanner(mount)!.classList.contains("persona-pill-peek--visible")).toBe(false);

    controller.destroy();
  });

  // --- Peek streamAnimation tests ----------------------------------------
  // The peek banner accepts the same `streamAnimation` shape as
  // `features.streamAnimation`. Resolution: peek-specific override → inherit
  // from features. The carve-out is `bubbleClass` (peek has no bubble);
  // everything else (containerClass, wrap, useCaret, buffer, placeholder,
  // speed/duration, custom plugins) ports over.

  it("inherits features.streamAnimation when peek.streamAnimation is omitted", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
      features: { streamAnimation: { type: "typewriter", speed: 60 } },
    });

    controller.injectAssistantMessage({ content: "hello world", streaming: true });
    controller.close();
    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    panel!.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    const textNode = getPeekText(mount)!;
    // typewriter ⇒ container class applied + per-char spans rendered.
    expect(textNode.classList.contains("persona-stream-typewriter")).toBe(true);
    expect(textNode.style.getPropertyValue("--persona-stream-step")).toBe("60ms");
    expect(textNode.querySelectorAll(".persona-stream-char").length).toBeGreaterThan(0);

    controller.destroy();
  });

  it("peek.streamAnimation override beats features.streamAnimation inheritance", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        mountMode: "composer-bar",
        composerBar: {
          peek: { streamAnimation: { type: "letter-rise", speed: 40 } },
        },
      },
      features: { streamAnimation: { type: "typewriter", speed: 200 } },
    });

    controller.injectAssistantMessage({ content: "hi there", streaming: true });
    controller.close();
    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    panel!.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    const textNode = getPeekText(mount)!;
    // letter-rise wins over typewriter: peek-specific config beats inherit.
    expect(textNode.classList.contains("persona-stream-letter-rise")).toBe(true);
    expect(textNode.classList.contains("persona-stream-typewriter")).toBe(false);
    expect(textNode.style.getPropertyValue("--persona-stream-step")).toBe("40ms");

    controller.destroy();
  });

  it("namespaces per-char span IDs with `peek-` so they don't collide with main bubble spans", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
      features: { streamAnimation: { type: "typewriter" } },
    });

    const msg = controller.injectAssistantMessage({
      content: "abc",
      streaming: true,
    });
    controller.close();
    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    panel!.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    const textNode = getPeekText(mount)!;
    const firstChar = textNode.querySelector<HTMLElement>(".persona-stream-char");
    expect(firstChar).not.toBeNull();
    expect(firstChar!.id).toBe(`stream-c-peek-${msg.id}-0`);

    controller.destroy();
  });

  it("uses absolute char indices when the trailing 100-char window slices a long message", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
      features: { streamAnimation: { type: "typewriter" } },
    });

    // 150 chars: slice = chars 50-149, so first peek span ID should be index 50.
    const msg = controller.injectAssistantMessage({
      content: "a".repeat(150),
      streaming: true,
    });
    controller.close();
    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    panel!.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    const textNode = getPeekText(mount)!;
    const chars = textNode.querySelectorAll<HTMLElement>(".persona-stream-char");
    expect(chars.length).toBe(100);
    expect(chars[0].id).toBe(`stream-c-peek-${msg.id}-50`);
    expect(chars[chars.length - 1].id).toBe(`stream-c-peek-${msg.id}-149`);

    controller.destroy();
  });

  it("appends a caret when the resolved plugin uses `useCaret` (typewriter)", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
      features: { streamAnimation: { type: "typewriter" } },
    });

    controller.injectAssistantMessage({ content: "hi", streaming: true });
    controller.close();
    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    panel!.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    const textNode = getPeekText(mount)!;
    expect(textNode.querySelector(".persona-stream-caret")).not.toBeNull();

    controller.destroy();
  });

  it("does NOT apply bubbleClass to the peek (carve-out: peek has no bubble)", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
      // pop-bubble is bubbleClass-only (no containerClass, no wrap).
      features: { streamAnimation: { type: "pop-bubble" } },
    });

    controller.injectAssistantMessage({ content: "hello", streaming: true });
    controller.close();
    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    panel!.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    const peek = getPeekBanner(mount)!;
    const textNode = getPeekText(mount)!;
    // Neither the peek root nor its text should pick up the bubble class.
    expect(peek.classList.contains("persona-stream-pop")).toBe(false);
    expect(textNode.classList.contains("persona-stream-pop")).toBe(false);

    controller.destroy();
  });

  it("renders a peek-sized skeleton when buffer:line + placeholder:skeleton trims content to empty", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
      features: {
        streamAnimation: {
          type: "typewriter",
          buffer: "line",
          placeholder: "skeleton",
        },
      },
    });

    // No newline yet → buffer:"line" trims to empty → skeleton stands in.
    controller.injectAssistantMessage({ content: "first li", streaming: true });
    controller.close();
    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    panel!.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    const textNode = getPeekText(mount)!;
    expect(textNode.querySelector(".persona-pill-peek__skeleton")).not.toBeNull();
    // No char spans yet: skeleton stands alone.
    expect(textNode.querySelectorAll(".persona-stream-char").length).toBe(0);

    controller.destroy();
  });

  it("falls back to the legacy plain-text preview when no streamAnimation is configured", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    controller.injectAssistantMessage({ content: "hello", streaming: true });
    controller.close();
    const panel = mount.querySelector<HTMLElement>(".persona-widget-panel");
    panel!.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    const textNode = getPeekText(mount)!;
    expect(textNode.textContent).toBe("hello");
    expect(textNode.querySelector(".persona-stream-char")).toBeNull();
    expect(textNode.classList.contains("persona-stream-typewriter")).toBe(false);

    controller.destroy();
  });

  it("does NOT dismiss the panel when pointerdown lands inside the pill or chat container", () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { mountMode: "composer-bar" },
    });

    controller.open();
    const wrapper = mount.querySelector<HTMLElement>("[data-persona-composer-bar]");
    expect(wrapper!.dataset.state).toBe("expanded");

    // Click inside the pill textarea: must keep the panel expanded.
    const textarea = mount.querySelector<HTMLTextAreaElement>(
      "[data-persona-composer-input]"
    );
    expect(textarea).not.toBeNull();
    textarea!.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true })
    );
    expect(wrapper!.dataset.state).toBe("expanded");

    // Click inside the chat container body: must also keep the panel open.
    const body = mount.querySelector<HTMLElement>(".persona-widget-body");
    expect(body).not.toBeNull();
    body!.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true })
    );
    expect(wrapper!.dataset.state).toBe("expanded");

    controller.destroy();
  });
});
