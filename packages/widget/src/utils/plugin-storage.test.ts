// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createPluginStorageFactory, pluginStorageKey } from "./plugin-storage";
import type { AgentWidgetConfig } from "../types";

const config = (patch: Partial<AgentWidgetConfig> = {}): AgentWidgetConfig =>
  ({ apiUrl: "https://api.example.com/chat", ...patch }) as AgentWidgetConfig;

describe("plugin storage facade", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("namespaces keys by keyPrefix and plugin id", () => {
    expect(pluginStorageKey(config(), "home-screen", "view")).toBe(
      "persona-plugin:home-screen:view"
    );
    expect(
      pluginStorageKey(
        config({ persistState: { keyPrefix: "myapp-" } }),
        "home-screen",
        "view"
      )
    ).toBe("myapp-plugin:home-screen:view");
  });

  it("reads and writes localStorage under the namespaced key", () => {
    const storage = createPluginStorageFactory(() => config())("pre-chat");
    storage.set("identity", "ada");

    expect(window.localStorage.getItem("persona-plugin:pre-chat:identity")).toBe(
      "ada"
    );
    expect(storage.get("identity")).toBe("ada");

    storage.remove("identity");
    expect(storage.get("identity")).toBeNull();
  });

  it("keeps two plugins from colliding on the same key", () => {
    const factory = createPluginStorageFactory(() => config());
    factory("a").set("view", "home");
    factory("b").set("view", "chat");

    expect(factory("a").get("view")).toBe("home");
    expect(factory("b").get("view")).toBe("chat");
  });

  it("downgrades to an in-memory map under persistState: false", () => {
    const storage = createPluginStorageFactory(() =>
      config({ persistState: false })
    )("pre-chat");
    storage.set("identity", "ada");

    expect(storage.get("identity")).toBe("ada");
    expect(window.localStorage.getItem("persona-plugin:pre-chat:identity")).toBeNull();
  });

  it("falls back to memory when localStorage access throws (private mode)", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    const storage = createPluginStorageFactory(() => config())("home-screen");
    expect(() => storage.set("view", "home")).not.toThrow();
    expect(storage.get("view")).toBe("home");

    setItem.mockRestore();
    getItem.mockRestore();
  });

  it("follows a live keyPrefix change through controller.update()", () => {
    let current = config();
    const storage = createPluginStorageFactory(() => current)("home-screen");
    storage.set("view", "home");

    current = config({ persistState: { keyPrefix: "next-" } });
    expect(storage.get("view")).toBeNull();
    storage.set("view", "chat");
    expect(window.localStorage.getItem("next-plugin:home-screen:view")).toBe(
      "chat"
    );
  });
});
