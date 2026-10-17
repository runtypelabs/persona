// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createRenderReadiness } from "./render-readiness";

afterEach(() => document.body.replaceChildren());
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
const fixture = () => {
  const mount = document.createElement("div");
  document.body.append(mount);
  return { mount, gate: createRenderReadiness(mount) };
};

it("reveals only after rendering, even when descendants explicitly request visibility", async () => {
  const { mount, gate } = fixture();
  mount.innerHTML = '<button style="visibility:visible">Send</button>';
  const pending = deferred();
  gate.prepare([pending.promise], () => {
    expect(mount.inert).toBe(true);
    expect(mount.hasAttribute("data-persona-preparing")).toBe(true);
  });
  expect(mount.querySelector("style")!.textContent).toContain("*{visibility:hidden!important}");
  pending.resolve();
  await gate.ready;
  expect(mount.inert).toBe(false);
  expect(mount.hasAttribute("data-persona-preparing")).toBe(false);
});

it("keeps the original ready waiter behind the latest preparation", async () => {
  const { mount, gate } = fixture();
  const first = deferred(), second = deferred();
  const staleRender = vi.fn(), latestRender = vi.fn(), notified = vi.fn();
  gate.prepare([first.promise], staleRender);
  const original = gate.ready.then(notified);
  gate.prepare([second.promise], latestRender);
  first.resolve();
  await Promise.resolve();
  expect(notified).not.toHaveBeenCalled();
  expect(mount.inert).toBe(true);
  second.resolve();
  await original;
  expect(staleRender).not.toHaveBeenCalled();
  expect(latestRender).toHaveBeenCalledOnce();
});

it("does not reveal or render after destroy", async () => {
  const { gate } = fixture();
  const pending = deferred(), render = vi.fn();
  gate.prepare([pending.promise], render);
  gate.destroy();
  await expect(gate.ready).rejects.toThrow("destroyed");
  pending.resolve();
  expect(render).not.toHaveBeenCalled();
});

it("keeps a failed preparation hidden and permits retry", async () => {
  const { mount, gate } = fixture();
  gate.prepare([Promise.reject(new Error("offline"))], vi.fn());
  await expect(gate.ready).rejects.toThrow("offline");
  expect(mount.inert).toBe(true);
  gate.prepare([], vi.fn());
  await gate.ready;
  expect(mount.hasAttribute("data-persona-preparing")).toBe(false);
});

for (const initialPending of [false, true]) {
  it(`waits for preparation started during render (initial pending: ${initialPending})`, async () => {
    const { mount, gate } = fixture();
    const styles = deferred(), rendered = vi.fn(), notified = vi.fn();
    gate.prepare(initialPending ? [Promise.resolve()] : [], () => {
      gate.prepare([styles.promise], rendered);
    });
    const ready = gate.ready.then(notified);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mount.inert).toBe(true);
    expect(notified).not.toHaveBeenCalled();
    styles.resolve();
    await ready;
    expect(rendered).toHaveBeenCalledOnce();
    expect(mount.inert).toBe(false);
  });
}
