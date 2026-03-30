// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireScrollLock } from "./scroll-lock";

describe("acquireScrollLock", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
  });

  it("sets overflow hidden and position fixed on body", () => {
    const release = acquireScrollLock();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.width).toBe("100%");

    release();
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
    expect(document.body.style.width).toBe("");
  });

  it("is ref-counted: first release does not unlock when second acquire is active", () => {
    const release1 = acquireScrollLock();
    const release2 = acquireScrollLock();
    expect(document.body.style.overflow).toBe("hidden");

    release1();
    expect(document.body.style.overflow).toBe("hidden");

    release2();
    expect(document.body.style.overflow).toBe("");
  });

  it("release is idempotent", () => {
    const release = acquireScrollLock();
    release();
    release();
    expect(document.body.style.overflow).toBe("");
  });

  it("restores original body styles on release", () => {
    document.body.style.overflow = "scroll";
    document.body.style.position = "relative";

    const release = acquireScrollLock();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");

    release();
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.body.style.position).toBe("relative");
  });
});
