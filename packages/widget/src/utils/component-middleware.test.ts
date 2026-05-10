import { describe, it, expect } from "vitest";

import {
  extractComponentDirectiveFromMessage,
  hasComponentDirective
} from "./component-middleware";
import type { AgentWidgetMessage } from "../types";

const baseMessage = (overrides: Partial<AgentWidgetMessage>): AgentWidgetMessage => ({
  id: "msg-1",
  role: "assistant",
  content: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

describe("extractComponentDirectiveFromMessage", () => {
  it("extracts directive from rawContent (streamed path)", () => {
    const directive = {
      text: "Booking form",
      component: "DynamicForm",
      props: { title: "Book a demo" }
    };
    const message = baseMessage({
      content: "Booking form",
      rawContent: JSON.stringify(directive)
    });

    const result = extractComponentDirectiveFromMessage(message);

    expect(result).not.toBeNull();
    expect(result?.component).toBe("DynamicForm");
    expect(result?.props).toEqual({ title: "Book a demo" });
    expect(result?.raw).toBe(JSON.stringify(directive));
  });

  it("falls back to content when rawContent is missing and content looks like JSON", () => {
    const directive = {
      text: "Booking form",
      component: "DynamicForm",
      props: { title: "Book a demo" }
    };
    const message = baseMessage({
      content: JSON.stringify(directive)
    });

    const result = extractComponentDirectiveFromMessage(message);

    expect(result).not.toBeNull();
    expect(result?.component).toBe("DynamicForm");
    expect(result?.props).toEqual({ title: "Book a demo" });
  });

  it("prefers rawContent over content when both are present", () => {
    const message = baseMessage({
      rawContent: JSON.stringify({
        text: "Raw form",
        component: "RawComponent",
        props: { source: "raw" }
      }),
      content: JSON.stringify({
        text: "Content form",
        component: "ContentComponent",
        props: { source: "content" }
      })
    });

    const result = extractComponentDirectiveFromMessage(message);

    expect(result?.component).toBe("RawComponent");
    expect(result?.props).toEqual({ source: "raw" });
  });

  it("returns null for plain-text content", () => {
    const message = baseMessage({ content: "Hello, how can I help?" });
    expect(extractComponentDirectiveFromMessage(message)).toBeNull();
  });

  it("returns null when content is JSON without a component field", () => {
    const message = baseMessage({
      content: JSON.stringify({ text: "Just text", foo: "bar" })
    });
    expect(extractComponentDirectiveFromMessage(message)).toBeNull();
  });

  it("returns null for empty rawContent and empty content", () => {
    const message = baseMessage({ rawContent: "", content: "" });
    expect(extractComponentDirectiveFromMessage(message)).toBeNull();
  });

  it("returns null when JSON is malformed", () => {
    const message = baseMessage({ rawContent: '{"component": "Foo"' });
    expect(extractComponentDirectiveFromMessage(message)).toBeNull();
  });

  it("defaults props to {} when the directive omits or nulls them", () => {
    const message = baseMessage({
      rawContent: JSON.stringify({ text: "x", component: "Foo" })
    });
    const result = extractComponentDirectiveFromMessage(message);
    expect(result?.props).toEqual({});

    const messageNullProps = baseMessage({
      rawContent: JSON.stringify({ text: "x", component: "Foo", props: null })
    });
    expect(extractComponentDirectiveFromMessage(messageNullProps)?.props).toEqual({});
  });
});

describe("hasComponentDirective", () => {
  it("returns true when rawContent carries a directive", () => {
    const message = baseMessage({
      rawContent: JSON.stringify({ text: "x", component: "Foo", props: {} })
    });
    expect(hasComponentDirective(message)).toBe(true);
  });

  it("returns true when only content carries a directive", () => {
    const message = baseMessage({
      content: JSON.stringify({ text: "x", component: "Foo", props: {} })
    });
    expect(hasComponentDirective(message)).toBe(true);
  });

  it("returns false for plain content", () => {
    const message = baseMessage({ content: "Hello!" });
    expect(hasComponentDirective(message)).toBe(false);
  });

  it("returns false for malformed JSON", () => {
    const message = baseMessage({ rawContent: "{not json" });
    expect(hasComponentDirective(message)).toBe(false);
  });
});
