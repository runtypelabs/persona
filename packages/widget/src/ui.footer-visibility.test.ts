// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAgentWidget } from "./runtime/init";
import { createAgentExperience, type AgentWidgetController } from "./ui";

let mount: HTMLElement;
let controller: { destroy: () => void } | undefined;

const footer = () => mount.querySelector<HTMLElement>(".persona-widget-footer");
const settle = async () => {
  await vi.dynamicImportSettled();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  mount = document.createElement("div");
  mount.id = "chat";
  document.body.appendChild(mount);
});

afterEach(() => {
  controller?.destroy();
  controller = undefined;
  document.body.replaceChildren();
});

describe.each([false, true])("layout.showFooter: false (V5 defaults: %s)", (v5Defaults) => {
  const config = {
    apiUrl: "/test",
    persistState: false,
    future: { v5Defaults },
    launcher: { enabled: false },
    layout: { embedded: true, showFooter: false },
    initialMessages: [{ id: "m1", role: "user" as const, content: "Hi", createdAt: "2026-01-01T00:00:00Z" }],
  };

  it("keeps the footer hidden after the widget is ready", async () => {
    controller = initAgentWidget({ target: "#chat", useShadowDom: false, config });
    await settle();
    expect(footer()?.style.display).toBe("none");
  });

  it("keeps the footer hidden when an update rebuilds the composer", async () => {
    const experience: AgentWidgetController = createAgentExperience(mount, config);
    controller = experience;
    await settle();
    experience.update({ contextMentions: { enabled: false } });
    await settle();
    expect(footer()?.style.display).toBe("none");
  });
});
