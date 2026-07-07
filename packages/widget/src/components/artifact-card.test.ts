// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { PersonaArtifactCard } from "./artifact-card";
import type { ComponentContext } from "./registry";
import type { AgentWidgetArtifactsFeature, AgentWidgetConfig } from "../types";

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
