// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createEventStreamStorageName, findMessageWrapperById } from "./ui";

describe("findMessageWrapperById", () => {
  it("matches wire ids literally without building a CSS selector", () => {
    const container = document.createElement("div");
    const wrapper = document.createElement("div");
    const id = 'tool\n[id="crafted"]';
    wrapper.setAttribute("data-wrapper-id", id);
    container.appendChild(wrapper);
    expect(findMessageWrapperById(container, id)).toBe(wrapper);
  });
});

describe("event stream storage namespace", () => {
  it("isolates tenant scopes without placing credentials in the database name", () => {
    const first = createEventStreamStorageName("persona-", "mount-a:secret-one");
    const second = createEventStreamStorageName("persona-", "mount-b:secret-two");
    expect(first).not.toBe(second);
    expect(first).not.toContain("secret-one");
    expect(second).not.toContain("secret-two");
  });
});
