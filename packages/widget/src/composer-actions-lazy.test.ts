// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "./composer-actions-runtime";
import type { createAgentExperience } from "./ui";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve!: (module: typeof actions) => void;
  const promise = new Promise<typeof actions>(done => { resolve = done; });
  return { promise, resolve };
};

// Global setup eagerly provides chunks for synchronous UI tests. Reset the
// graph here so loading, config changes, and teardown are exercised together.
describe("cold composer controls", () => {
  beforeEach(() => { vi.resetModules(); window.scrollTo = vi.fn(); });
  afterEach(() => {
    controllers.splice(0).forEach(controller => controller.destroy());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  async function prepare() {
    const loader = await import("./composer-actions-loader");
    const { createAgentExperience } = await import("./ui");
    const mount = document.createElement("div");
    document.body.append(mount);
    return { loader, mount, create: () => {
      const controller = createAgentExperience(mount, {
        apiUrl: "https://example.test/chat", launcher: { enabled: false }, persistState: false,
        composer: { actions: [{ id: "host", kind: "button", placement: "start", presentation: "bar", label: "Before load", onSelect() {} }] },
      });
      controllers.push(controller);
      return controller;
    } };
  }

  it("renders the latest config after loading and keeps controls usable", async () => {
    const { loader, mount, create } = await prepare();
    const pending = deferred();
    loader.setComposerActionsLoader(() => pending.promise);
    const controller = create();
    expect(mount.hasAttribute("data-persona-preparing")).toBe(true);
    expect(mount.inert).toBe(true);
    const ready = controller.ready;
    const selected = vi.fn();
    controller.update({ composer: { actions: [{ id: "host", kind: "button", placement: "start", presentation: "bar", label: "After load", onSelect: selected }] } });
    pending.resolve(actions);
    await ready;
    expect(mount.hasAttribute("data-persona-preparing")).toBe(false);
    expect(mount.inert).toBe(false);
    const button = mount.querySelector<HTMLButtonElement>('[data-persona-composer-action="host"] button')!;
    expect(button.textContent).toContain("After load");
    button.click();
    expect(selected).toHaveBeenCalledTimes(1);
  });

  it("does not adopt a late module after destroy", async () => {
    const { loader, mount, create } = await prepare();
    const pending = deferred();
    loader.setComposerActionsLoader(() => pending.promise);
    create().destroy();
    controllers.length = 0;
    pending.resolve(actions);
    await flush();
    expect(mount.querySelector('[data-persona-composer-action="host"]')).toBeNull();
  });

  it("retries a failed load on a later update", async () => {
    const { loader, mount, create } = await prepare();
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(actions);
    loader.setComposerActionsLoader(load);
    const controller = create();
    await expect(controller.ready).rejects.toThrow("offline");
    expect(mount.hasAttribute("data-persona-preparing")).toBe(true);
    controller.update({ composer: { actions: [{ id: "retried", kind: "button", placement: "start", presentation: "bar", label: "Retry succeeded", onSelect() {} }] } });
    await controller.ready;
    expect(mount.hasAttribute("data-persona-preparing")).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
    expect(mount.querySelector('[data-persona-composer-action="retried"]')).not.toBeNull();
  });
});
