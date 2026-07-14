// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { PersonaArtifactCard } from "./artifact-card";
import { componentRegistry, type ComponentRenderer } from "./registry";
import type { ComponentContext } from "./registry";
import type {
  AgentWidgetArtifactsFeature,
  AgentWidgetConfig,
  PersonaArtifactStatusLabelContext,
} from "../types";

const makeContext = (
  artifacts?: AgentWidgetArtifactsFeature
): ComponentContext =>
  ({
    message: {},
    config: {
      features: { artifacts: { enabled: true, ...(artifacts ?? {}) } },
    } as AgentWidgetConfig,
    updateProps: () => {},
  }) as unknown as ComponentContext;

const render = (
  props: Record<string, unknown>,
  artifacts?: AgentWidgetArtifactsFeature
): HTMLElement => PersonaArtifactCard(props, makeContext(artifacts));

const streamingProps = {
  artifactId: "a1",
  title: "index.html",
  status: "streaming",
  artifactType: "markdown",
  file: { path: "index.html", mimeType: "text/html", language: "html" },
};

const NBSP = String.fromCharCode(0xa0);

const findStatusText = (root: HTMLElement): HTMLElement | null =>
  root.querySelector(
    ".persona-tool-loading-shimmer, .persona-tool-loading-shimmer-color, .persona-tool-loading-rainbow, .persona-tool-loading-pulse"
  ) as HTMLElement | null;

describe("PersonaArtifactCard streaming status", () => {
  it("renders shimmer animation by default with no pulsing dot", () => {
    const root = render(streamingProps);

    // No leftover pulsing dot element.
    expect(root.querySelector(".persona-rounded-full")).toBeNull();
    expect(root.innerHTML).not.toContain("persona-pulse ");

    const statusText = findStatusText(root);
    expect(statusText).not.toBeNull();
    expect(statusText!.classList.contains("persona-tool-loading-shimmer")).toBe(
      true
    );
    expect(statusText!.getAttribute("data-preserve-animation")).toBe("true");
    expect(
      statusText!.style.getPropertyValue("--persona-tool-anim-duration")
    ).toBe("2000ms");

    const chars = statusText!.querySelectorAll(".persona-tool-char");
    expect(chars.length).toBeGreaterThan(0);
    expect((chars[0] as HTMLElement).style.getPropertyValue("--char-index")).toBe(
      "0"
    );
    // Reconstruct the animated text from the character spans.
    const text = Array.from(chars)
      .map((c) => (c.textContent === NBSP ? " " : c.textContent))
      .join("");
    expect(text).toBe("Generating html...");
  });

  it("renders plain text with no animation classes when loadingAnimation is none", () => {
    const root = render(streamingProps, { loadingAnimation: "none" });

    expect(findStatusText(root)).toBeNull();
    expect(root.querySelector(".persona-tool-char")).toBeNull();
    expect(root.textContent).toContain("Generating html...");
  });

  it("applies the pulse class to the status element without char spans", () => {
    const root = render(streamingProps, { loadingAnimation: "pulse" });

    const statusText = root.querySelector(
      ".persona-tool-loading-pulse"
    ) as HTMLElement | null;
    expect(statusText).not.toBeNull();
    expect(statusText!.getAttribute("data-preserve-animation")).toBe("true");
    expect(statusText!.querySelector(".persona-tool-char")).toBeNull();
    expect(statusText!.textContent).toBe("Generating html...");
  });

  it("sets color CSS vars for shimmer-color mode", () => {
    const root = render(streamingProps, {
      loadingAnimation: "shimmer-color",
      loadingAnimationColor: "#111111",
      loadingAnimationSecondaryColor: "#eeeeee",
      loadingAnimationDuration: 3000,
    });

    const statusText = root.querySelector(
      ".persona-tool-loading-shimmer-color"
    ) as HTMLElement | null;
    expect(statusText).not.toBeNull();
    expect(
      statusText!.style.getPropertyValue("--persona-tool-anim-color")
    ).toBe("#111111");
    expect(
      statusText!.style.getPropertyValue("--persona-tool-anim-secondary-color")
    ).toBe("#eeeeee");
    expect(
      statusText!.style.getPropertyValue("--persona-tool-anim-duration")
    ).toBe("3000ms");
  });

  it("carries the artifact-card class so radius/border/background come from CSS", () => {
    const root = render(streamingProps);

    // Standalone card must not hardcode the rounded-xl utility class.
    expect(root.classList.contains("persona-rounded-xl")).toBe(false);
    // Radius/border/background now live in widget.css keyed off this class,
    // following the --persona-artifact-card-radius → assistant-bubble chain.
    expect(root.classList.contains("persona-artifact-card")).toBe(true);
  });

  it("keeps border/background off inline styles so they come from CSS", () => {
    const root = render(streamingProps);

    expect(root.classList.contains("persona-artifact-card")).toBe(true);
    // Border/bg/radius/cursor moved to widget.css keyed off the card class.
    expect(root.style.border).toBe("");
    expect(root.style.background).toBe("");
    expect(root.style.backgroundColor).toBe("");
    expect(root.style.borderRadius).toBe("");
  });

  it("renders the Download button as a label button carrying the artifact id", () => {
    const root = render({
      artifactId: "a1",
      title: "index.html",
      status: "complete",
      artifactType: "markdown",
      file: { path: "index.html", mimeType: "text/html", language: "html" },
    });

    const dl = root.querySelector(
      "[data-download-artifact]"
    ) as HTMLButtonElement | null;
    expect(dl).not.toBeNull();
    expect(dl!.tagName).toBe("BUTTON");
    expect(dl!.classList.contains("persona-label-btn")).toBe(true);
    expect(dl!.textContent).toBe("Download");
    expect(dl!.getAttribute("data-download-artifact")).toBe("a1");
  });

  it("renders the complete state with a Download button and no animation", () => {
    const root = render({
      artifactId: "a1",
      title: "index.html",
      status: "complete",
      artifactType: "markdown",
      file: { path: "index.html", mimeType: "text/html", language: "html" },
    });

    expect(findStatusText(root)).toBeNull();
    expect(root.querySelector(".persona-tool-char")).toBeNull();

    const dl = root.querySelector(
      "[data-download-artifact]"
    ) as HTMLButtonElement | null;
    expect(dl).not.toBeNull();
    expect(dl!.textContent).toBe("Download");
    // Subtitle shows the file type label, not a "Generating" status.
    expect(root.textContent).not.toContain("Generating");
  });
});

describe("PersonaArtifactCard statusLabel", () => {
  // Reconstruct the (possibly char-span animated) status label text.
  const labelText = (root: HTMLElement): string => {
    const label = root.querySelector(
      ".persona-artifact-status-label"
    ) as HTMLElement | null;
    if (!label) return "";
    const chars = label.querySelectorAll(".persona-tool-char");
    if (chars.length === 0) return label.textContent ?? "";
    return Array.from(chars)
      .map((c) => (c.textContent === NBSP ? " " : c.textContent))
      .join("");
  };

  it("replaces the default status text with a plain string", () => {
    const root = render(streamingProps, { statusLabel: "Cooking up your file..." });
    expect(labelText(root)).toBe("Cooking up your file...");
    expect(root.textContent).not.toContain("Generating");
  });

  it("calls a statusLabel function with the card surface and ctx", () => {
    const calls: PersonaArtifactStatusLabelContext[] = [];
    const root = render(streamingProps, {
      statusLabel: (ctx) => {
        calls.push(ctx);
        return "Custom label";
      },
    });
    expect(calls.length).toBe(1);
    expect(calls[0].surface).toBe("card");
    expect(calls[0].artifactId).toBe("a1");
    expect(calls[0].artifactType).toBe("markdown");
    // file: index.html -> fileTypeLabel "HTML".
    expect(calls[0].typeLabel).toBe("HTML");
    expect(typeof calls[0].content).toBe("function");
    expect(labelText(root)).toBe("Custom label");
  });

  it("renders a { label, detail } as an animated label + plain detail span", () => {
    const root = render(streamingProps, {
      statusLabel: () => ({ label: "Writing", detail: "just started" }),
    });
    expect(labelText(root)).toBe("Writing");
    const detail = root.querySelector(
      ".persona-artifact-status-detail"
    ) as HTMLElement | null;
    expect(detail).not.toBeNull();
    expect(detail!.textContent).toBe("just started");
    // The detail span is un-animated (no char spans / loading classes).
    expect(detail!.querySelector(".persona-tool-char")).toBeNull();
  });

  it("falls back to the default label when statusLabel throws", () => {
    const root = render(streamingProps, {
      statusLabel: () => {
        throw new Error("boom");
      },
    });
    expect(labelText(root)).toBe("Generating html...");
  });
});

describe("PersonaArtifactCard custom card actions", () => {
  const completeProps = {
    artifactId: "a1",
    title: "index.html",
    status: "complete",
    artifactType: "markdown",
    markdown: "# Hi",
    file: { path: "index.html", mimeType: "text/html", language: "html" },
  };

  it("renders a card action button before Download on complete cards", () => {
    const root = render(completeProps, {
      cardActions: [
        { id: "save", label: "Save to Drive", icon: "star", onClick: () => {} },
      ],
    });

    const btn = root.querySelector(
      '[data-artifact-custom-action="save"]'
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.tagName).toBe("BUTTON");
    // Delegated in ui.ts: the card carries the id attribute, no direct listener.
    expect(btn!.getAttribute("data-artifact-custom-action")).toBe("save");

    const dl = root.querySelector(
      "[data-download-artifact]"
    ) as HTMLElement | null;
    expect(dl).not.toBeNull();
    // Custom actions render before Download.
    expect(
      btn!.compareDocumentPosition(dl!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("does not render card actions while streaming", () => {
    const root = render(streamingProps, {
      cardActions: [
        { id: "save", label: "Save to Drive", icon: "star", onClick: () => {} },
      ],
    });
    expect(root.querySelector("[data-artifact-custom-action]")).toBeNull();
  });

  it("suppresses a card action whose visible() returns false", () => {
    const root = render(completeProps, {
      cardActions: [
        {
          id: "save",
          label: "Save",
          icon: "star",
          visible: () => false,
          onClick: () => {},
        },
      ],
    });
    expect(root.querySelector("[data-artifact-custom-action]")).toBeNull();
  });
});

describe("componentRegistry registration options", () => {
  const noop: ComponentRenderer = () => document.createElement("div");

  afterEach(() => {
    componentRegistry.unregister("OptTest");
  });

  it("registers the built-in artifact card with bubbleChrome:false", () => {
    expect(componentRegistry.getOptions("PersonaArtifactCard")?.bubbleChrome).toBe(false);
  });

  it("returns the options passed to register", () => {
    componentRegistry.register("OptTest", noop, { bubbleChrome: false });
    expect(componentRegistry.getOptions("OptTest")).toEqual({ bubbleChrome: false });
  });

  it("returns undefined when a component is registered without options", () => {
    componentRegistry.register("OptTest", noop);
    expect(componentRegistry.getOptions("OptTest")).toBeUndefined();
  });

  it("clears prior options when re-registered without options", () => {
    componentRegistry.register("OptTest", noop, { bubbleChrome: false });
    componentRegistry.register("OptTest", noop);
    expect(componentRegistry.getOptions("OptTest")).toBeUndefined();
  });

  it("drops options on unregister", () => {
    componentRegistry.register("OptTest", noop, { bubbleChrome: false });
    componentRegistry.unregister("OptTest");
    expect(componentRegistry.getOptions("OptTest")).toBeUndefined();
  });
});
