// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createAgentExperience } from "@runtypelabs/persona";

import { createHomeScreenPlugin } from "./home-screen-plugin";

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("home screen on a live widget", () => {
  it("hides the composer on home and swaps the real one in on start", async () => {
    const plugin = createHomeScreenPlugin({
      starters: [{ id: "order", label: "Track my latest order" }],
    });
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "https://example.com/api",
      persistState: false,
      launcher: { enabled: false },
      plugins: [plugin],
      welcome: { title: "Hi, how can we help?", subtitle: "Ask us anything." },
    });
    await flushMicrotasks();

    // Home is up: hidden placeholder footer, no real composer in the DOM.
    expect(mount.querySelector(".persona-home")).not.toBeNull();
    expect(
      mount.querySelector("[data-persona-home-composer-hidden]"),
    ).not.toBeNull();
    expect(mount.querySelector("[data-persona-composer-input]")).toBeNull();

    mount.querySelector<HTMLButtonElement>(".persona-home__start")!.click();
    await flushMicrotasks();

    // Transcript view: default composer rebuilt in place of the placeholder.
    expect(mount.querySelector(".persona-home")).toBeNull();
    expect(
      mount.querySelector("[data-persona-composer-input]"),
    ).not.toBeNull();
    expect(mount.querySelector("[data-persona-home-composer-hidden]")).toBeNull();

    // The header action path returns home over the transcript: hidden again.
    plugin.showHome();
    await flushMicrotasks();
    expect(mount.querySelector(".persona-home")).not.toBeNull();
    expect(mount.querySelector("[data-persona-composer-input]")).toBeNull();

    controller.destroy();
    mount.remove();
  });
});
