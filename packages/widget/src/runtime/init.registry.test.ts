// @vitest-environment jsdom

/**
 * `getAgentWidgetHandles()` registry: every `initAgentWidget()` mount is
 * listed (oldest first) until its `destroy()`, so companions created after
 * `persona:chat-ready` fired can still adopt a mounted widget.
 */

import { afterEach, describe, expect, it } from "vitest";

import { getAgentWidgetHandles, initAgentWidget } from "./init";

const mountHost = (id: string): HTMLElement => {
  const host = document.createElement("div");
  host.id = id;
  document.body.appendChild(host);
  return host;
};

const CONFIG = {
  apiUrl: "https://api.example.com/chat",
  launcher: { enabled: false },
  persistState: false,
};

describe("getAgentWidgetHandles", () => {
  afterEach(() => {
    // Sweep any instances a failing assertion left behind.
    for (const handle of getAgentWidgetHandles()) handle.destroy();
    document.body.innerHTML = "";
  });

  it("lists mounted handles oldest-first and drops them on destroy", () => {
    expect(getAgentWidgetHandles()).toEqual([]);

    const first = initAgentWidget({ target: mountHost("reg-a"), config: CONFIG });
    const second = initAgentWidget({ target: mountHost("reg-b"), config: CONFIG });

    expect(getAgentWidgetHandles()).toEqual([first, second]);
    expect(getAgentWidgetHandles().at(-1)).toBe(second);

    second.destroy();
    expect(getAgentWidgetHandles()).toEqual([first]);

    first.destroy();
    expect(getAgentWidgetHandles()).toEqual([]);
  });

  it("returns a copy, not the live registry", () => {
    const handle = initAgentWidget({ target: mountHost("reg-c"), config: CONFIG });
    const snapshot = getAgentWidgetHandles();
    snapshot.length = 0;
    expect(getAgentWidgetHandles()).toEqual([handle]);
    handle.destroy();
  });
});
