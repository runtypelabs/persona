// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { initAgentWidget } from "./runtime/init";

const controllers: Array<{ destroy: () => void }> = [];
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.destroy());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const mount = () => {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return element;
};
const warnings = () => vi.spyOn(console, "warn").mockImplementation(() => {});
const legacyWarnings = (warn: ReturnType<typeof warnings>) => warn.mock.calls.filter(([message]) =>
  String(message).includes("supported legacy alias"));

describe("legacy diagnostic owner boundaries", () => {
  it("standalone experience diagnoses raw input and patches once", () => {
    const warn = warnings();
    const controller = createAgentExperience(mount(), {
      apiUrl: "/chat", persistState: false, launcher: { enabled: false }, debug: true,
      toolCall: { shadow: "none" },
    });
    controllers.push(controller);
    expect(legacyWarnings(warn)).toHaveLength(1);
    controller.update({ theme: { semantic: { colors: { primary: "pink" } } } });
    expect(legacyWarnings(warn)).toHaveLength(1);
    controller.update({ approval: { borderColor: "red" } });
    expect(legacyWarnings(warn)).toHaveLength(2);
  });

  it("init owns deduplication through inner merges and layout rebuilds", () => {
    const warn = warnings();
    const controller = initAgentWidget({ target: mount(), config: {
      apiUrl: "/chat", persistState: false, debug: true, toolCall: { shadow: "none" },
    } });
    controllers.push(controller);
    expect(legacyWarnings(warn)).toHaveLength(1);
    controller.update({ launcher: { mountMode: "docked" } });
    controller.update({ approval: { borderColor: "red" } });
    controller.update({ launcher: { mountMode: "floating" } });
    expect(legacyWarnings(warn)).toHaveLength(2);
  });

  it.each([false, true])("unconfigured widgets do not diagnose defaults when debug is enabled later (v5=%s)", (v5Defaults) => {
    const warn = warnings();
    const controller = initAgentWidget({ target: mount(), config: { apiUrl: "/chat", persistState: false, future: { v5Defaults } } });
    controllers.push(controller);
    controller.update({ debug: true });
    expect(legacyWarnings(warn)).toHaveLength(0);
  });

  it("each independent init lifecycle diagnoses the same explicit path", () => {
    const warn = warnings();
    const config = { apiUrl: "/chat", persistState: false, debug: true, launcherWidth: "420px" };
    controllers.push(initAgentWidget({ target: mount(), config }), initAgentWidget({ target: mount(), config }));
    expect(legacyWarnings(warn)).toHaveLength(2);
  });
});
