// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { syncOverlayHostStacking } from "./overlay-host-stacking";

describe("syncOverlayHostStacking", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("sets position relative on a static element and restores on teardown", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const teardown = syncOverlayHostStacking(host);
    expect(host.style.position).toBe("relative");
    expect(host.style.zIndex).toBe("100000");
    expect(host.style.isolation).toBe("isolate");

    teardown();
    expect(host.style.position).toBe("");
    expect(host.style.zIndex).toBe("");
    expect(host.style.isolation).toBe("");
  });

  it("preserves existing positioned value", () => {
    const host = document.createElement("div");
    host.style.position = "absolute";
    document.body.appendChild(host);

    const teardown = syncOverlayHostStacking(host);
    expect(host.style.position).toBe("absolute");
    expect(host.style.zIndex).toBe("100000");

    teardown();
    expect(host.style.position).toBe("absolute");
    expect(host.style.zIndex).toBe("");
  });

  it("accepts custom z-index", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const teardown = syncOverlayHostStacking(host, 42);
    expect(host.style.zIndex).toBe("42");

    teardown();
  });

  it("restores previous inline z-index on teardown", () => {
    const host = document.createElement("div");
    host.style.zIndex = "5";
    document.body.appendChild(host);

    const teardown = syncOverlayHostStacking(host);
    expect(host.style.zIndex).toBe("100000");

    teardown();
    expect(host.style.zIndex).toBe("5");
  });
});
