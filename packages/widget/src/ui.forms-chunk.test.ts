// @vitest-environment jsdom

/**
 * Transport test for the lazy forms-ui chunk: what a `[data-tv-form]`
 * placeholder does while the chunk is in flight, after it lands, and when it
 * fails to load.
 *
 * Lives in its own file because the chunk loader's memoization is
 * module-global: once a load resolves here, later widgets in this file see it
 * synchronously, and other test files (which run isolated) are unaffected.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { setFormsUiLoader, type FormsUiModule } from "./forms-ui-loader";
import * as formsUiEntry from "./forms-ui";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

// Bypasses markdown entirely: every assistant message renders as the bare
// placeholder div the directive postprocessor would emit.
const widgetConfig = {
  apiUrl: "https://api.example.com/chat",
  launcher: { enabled: false },
  sanitize: false,
  postprocessMessage: () =>
    '<div class="persona-form-directive" data-tv-form="init"></div>',
};

const injectFormMessage = (
  controller: ReturnType<typeof createAgentExperience>,
  id = "form-1"
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "assistant",
      content: "Fill in the form below.",
      createdAt: "2026-08-23T00:00:00.000Z",
      streaming: false,
    },
  });
};

const flushChunkLoad = async () => {
  // Loader promise → notify → re-render is a few microtask hops; a macrotask
  // hop covers them all without coupling to the exact chain length.
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("forms-ui chunk transport", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps the placeholder bare when the chunk load fails, then heals on retry", async () => {
    setFormsUiLoader(() => Promise.reject(new Error("network")));
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      widgetConfig as unknown as Parameters<typeof createAgentExperience>[1]
    );

    injectFormMessage(controller, "form-fail-1");
    await flushChunkLoad();

    // The placeholder is still the bare div; nothing crashed and the message
    // row itself rendered.
    expect(mount.querySelector("#wrapper-form-fail-1")).not.toBeNull();
    expect(mount.querySelector("[data-tv-form]")).not.toBeNull();
    expect(mount.querySelector(".persona-form-card form")).toBeNull();

    // Point the loader at the real module; the next render retries the load
    // and the heal re-renders BOTH placeholders into forms.
    setFormsUiLoader(() =>
      Promise.resolve(formsUiEntry as unknown as FormsUiModule)
    );
    injectFormMessage(controller, "form-fail-2");
    await flushChunkLoad();

    expect(mount.querySelectorAll(".persona-form-card form").length).toBe(2);
    controller.destroy();
  });

  it("enhances placeholders synchronously once the module is cached", () => {
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      widgetConfig as unknown as Parameters<typeof createAgentExperience>[1]
    );

    injectFormMessage(controller, "form-warm-1");
    // No flush: the previous test resolved the loader, so the module is
    // memoized and the form renders in the same tick.
    expect(mount.querySelector(".persona-form-card form")).not.toBeNull();
    controller.destroy();
  });
});
