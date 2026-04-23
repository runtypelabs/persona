// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  wrapStreamAnimation,
  createSkeletonPlaceholder,
  createStreamCaret,
  resolveStreamAnimation,
  streamAnimationContainerClass,
  streamAnimationBubbleClass,
  isWrappingAnimation,
  resolveStreamAnimationPlugin,
  registerStreamAnimationPlugin,
  unregisterStreamAnimationPlugin,
  listRegisteredStreamAnimations,
  applyStreamBuffer,
  ensurePluginActive,
  detachAllPlugins,
} from "./stream-animation";
import type { AgentWidgetMessage, StreamAnimationPlugin } from "../types";
// Side-import the subpath plugin modules so tests can resolve their types.
// `letter-rise` and `word-fade` are core built-ins and need no import.
import "../animations/wipe";
import "../animations/glyph-cycle";

describe("wrapStreamAnimation — char mode", () => {
  it("wraps every character in a plain paragraph into a stream-char span", () => {
    const out = wrapStreamAnimation("<p>Hi!</p>", "char", "m1");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    const spans = parser.querySelectorAll(".persona-stream-char");
    expect(spans.length).toBe(3);
    expect(spans[0].textContent).toBe("H");
    expect(spans[1].textContent).toBe("i");
    expect(spans[2].textContent).toBe("!");
  });

  it("assigns monotonic --char-index starting at 0", () => {
    const out = wrapStreamAnimation("<p>abc</p>", "char", "m1");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    const spans = parser.querySelectorAll(".persona-stream-char");
    expect(spans[0].getAttribute("style")).toContain("--char-index: 0");
    expect(spans[1].getAttribute("style")).toContain("--char-index: 1");
    expect(spans[2].getAttribute("style")).toContain("--char-index: 2");
  });

  it("emits stable ids scoped by messageId", () => {
    const out = wrapStreamAnimation("<p>ab</p>", "char", "msg-42");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    expect(parser.querySelector("#stream-c-msg-42-0")?.textContent).toBe("a");
    expect(parser.querySelector("#stream-c-msg-42-1")?.textContent).toBe("b");
  });

  it("preserves formatting tags and wraps text inside them", () => {
    const out = wrapStreamAnimation("<p>Hi <strong>bold</strong></p>", "char", "m1");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    expect(parser.querySelector("strong")).toBeTruthy();
    const spans = parser.querySelectorAll(".persona-stream-char");
    // "Hi" (2) + "bold" (4) = 6 wrapped chars; the space between stays as a
    // plain text node so natural line-wrap works.
    expect(spans.length).toBe(6);
    expect(parser.querySelector("strong")?.querySelectorAll(".persona-stream-char").length).toBe(4);
  });

  it("skips descendants of <code> so code spans render as plain text", () => {
    const out = wrapStreamAnimation("<p>see <code>x.y</code></p>", "char", "m1");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    expect(parser.querySelector("code")?.textContent).toBe("x.y");
    expect(parser.querySelector("code")?.querySelectorAll(".persona-stream-char").length).toBe(0);
    // "see" is 3 wrapped chars; the trailing space stays as a plain text node.
    expect(parser.querySelectorAll(".persona-stream-char").length).toBe(3);
  });

  it("skips descendants of <pre>", () => {
    const out = wrapStreamAnimation("<pre>code\nblock</pre>", "char", "m1");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    expect(parser.querySelector("pre")?.textContent).toBe("code\nblock");
    expect(parser.querySelectorAll(".persona-stream-char").length).toBe(0);
  });

  it("skips descendants of <a>", () => {
    const out = wrapStreamAnimation('<p>go <a href="/x">home</a></p>', "char", "m1");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    expect(parser.querySelector("a")?.textContent).toBe("home");
    expect(parser.querySelector("a")?.querySelectorAll(".persona-stream-char").length).toBe(0);
    // Only "go" is wrapped (2 chars); the trailing space stays plain.
    expect(parser.querySelectorAll(".persona-stream-char").length).toBe(2);
  });

  it("leaves whitespace as a plain text node so word breaks survive", () => {
    const out = wrapStreamAnimation("<p>a b</p>", "char", "m1");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    const spans = parser.querySelectorAll(".persona-stream-char");
    expect(spans.length).toBe(2);
    expect(spans[0].textContent).toBe("a");
    expect(spans[1].textContent).toBe("b");
    const p = parser.querySelector("p")!;
    expect(p.childNodes.length).toBe(3);
    expect(p.childNodes[1].nodeType).toBe(Node.TEXT_NODE);
    expect(p.childNodes[1].textContent).toBe(" ");
  });

  it("wraps each word run in a word-group so chars can't break mid-word", () => {
    const out = wrapStreamAnimation("<p>Hi there</p>", "char", "m1");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    const groups = parser.querySelectorAll(".persona-stream-word-group");
    expect(groups.length).toBe(2);
    expect(groups[0].textContent).toBe("Hi");
    expect(groups[1].textContent).toBe("there");
    expect(groups[0].querySelectorAll(".persona-stream-char").length).toBe(2);
    expect(groups[1].querySelectorAll(".persona-stream-char").length).toBe(5);
  });

  it("keeps newlines and multi-space runs intact as text nodes", () => {
    const out = wrapStreamAnimation("<p>a\n  b</p>", "char", "m1");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    const p = parser.querySelector("p")!;
    expect(p.childNodes.length).toBe(3);
    expect(p.childNodes[1].nodeType).toBe(Node.TEXT_NODE);
    expect(p.childNodes[1].textContent).toBe("\n  ");
  });

  it("is idempotent on re-wrap for streaming: same input yields identical ids/indices", () => {
    const input = "<p>Hello</p>";
    const first = wrapStreamAnimation(input, "char", "m1");
    const second = wrapStreamAnimation(input, "char", "m1");
    expect(first).toBe(second);
  });

  it("extends indices for appended text across calls with growing content", () => {
    const first = wrapStreamAnimation("<p>Hi</p>", "char", "m1");
    const second = wrapStreamAnimation("<p>Hi there</p>", "char", "m1");
    const parse = (html: string) => {
      const div = document.createElement("div");
      div.innerHTML = html;
      return div.querySelectorAll(".persona-stream-char");
    };
    const firstSpans = parse(first);
    const secondSpans = parse(second);
    // First two ids are stable — idiomorph match contract. The space between
    // "Hi" and "there" is a plain text node, not a span, so the next wrapped
    // char after "Hi" jumps to index 2 for "t" in "there".
    expect(firstSpans[0].id).toBe(secondSpans[0].id);
    expect(firstSpans[1].id).toBe(secondSpans[1].id);
    expect(secondSpans.length).toBeGreaterThan(firstSpans.length);
    // "there" is 5 wrapped chars, starting at index 2.
    expect(secondSpans[2].id).toBe("stream-c-m1-2");
    expect(secondSpans[2].textContent).toBe("t");
  });

  it("returns input unchanged on empty string", () => {
    expect(wrapStreamAnimation("", "char", "m1")).toBe("");
  });
});

describe("wrapStreamAnimation — word mode", () => {
  it("splits on whitespace and wraps each non-whitespace token", () => {
    const out = wrapStreamAnimation("<p>Hello brave world</p>", "word", "m1");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    const words = parser.querySelectorAll(".persona-stream-word");
    expect(words.length).toBe(3);
    expect(words[0].textContent).toBe("Hello");
    expect(words[1].textContent).toBe("brave");
    expect(words[2].textContent).toBe("world");
  });

  it("preserves whitespace between word spans as plain text", () => {
    const out = wrapStreamAnimation("<p>a b</p>", "word", "m1");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    const p = parser.querySelector("p")!;
    // Expected DOM: <span>a</span>" "<span>b</span>
    expect(p.childNodes.length).toBe(3);
    expect(p.childNodes[1].nodeType).toBe(Node.TEXT_NODE);
    expect(p.childNodes[1].textContent).toBe(" ");
  });

  it("assigns monotonic --word-index", () => {
    const out = wrapStreamAnimation("<p>one two three</p>", "word", "m1");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    const words = parser.querySelectorAll(".persona-stream-word");
    expect(words[0].getAttribute("style")).toContain("--word-index: 0");
    expect(words[2].getAttribute("style")).toContain("--word-index: 2");
  });

  it("emits stable word ids scoped by messageId", () => {
    const out = wrapStreamAnimation("<p>foo bar</p>", "word", "abc");
    const parser = document.createElement("div");
    parser.innerHTML = out;
    expect(parser.querySelector("#stream-w-abc-0")?.textContent).toBe("foo");
    expect(parser.querySelector("#stream-w-abc-1")?.textContent).toBe("bar");
  });

  it("skips words inside <pre>, <code>, <a>", () => {
    const out = wrapStreamAnimation(
      '<p>see <code>foo</code> and <a href="/x">link</a></p>',
      "word",
      "m1"
    );
    const parser = document.createElement("div");
    parser.innerHTML = out;
    expect(parser.querySelector("code")?.querySelectorAll(".persona-stream-word").length).toBe(0);
    expect(parser.querySelector("a")?.querySelectorAll(".persona-stream-word").length).toBe(0);
    // "see", "and" are the wrapped words
    const wrapped = Array.from(parser.querySelectorAll(".persona-stream-word")).map(
      (el) => el.textContent
    );
    expect(wrapped).toEqual(["see", "and"]);
  });
});

describe("resolveStreamAnimation", () => {
  it("returns all defaults when feature is undefined", () => {
    const resolved = resolveStreamAnimation(undefined);
    expect(resolved.type).toBe("none");
    expect(resolved.placeholder).toBe("none");
    expect(resolved.speed).toBe(120);
    expect(resolved.duration).toBe(1800);
  });

  it("applies partial overrides", () => {
    const resolved = resolveStreamAnimation({ type: "typewriter", speed: 50 });
    expect(resolved.type).toBe("typewriter");
    expect(resolved.speed).toBe(50);
    expect(resolved.duration).toBe(1800);
    expect(resolved.placeholder).toBe("none");
  });
});

describe("streamAnimationContainerClass / streamAnimationBubbleClass", () => {
  it("returns null for 'none'", () => {
    expect(streamAnimationContainerClass("none")).toBeNull();
    expect(streamAnimationBubbleClass("none")).toBeNull();
  });

  it("maps per-unit types to container classes", () => {
    expect(streamAnimationContainerClass("typewriter")).toBe("persona-stream-typewriter");
    expect(streamAnimationContainerClass("letter-rise")).toBe("persona-stream-letter-rise");
    expect(streamAnimationContainerClass("word-fade")).toBe("persona-stream-word-fade");
    expect(streamAnimationContainerClass("glyph-cycle")).toBe("persona-stream-glyph-cycle");
    expect(streamAnimationContainerClass("wipe")).toBe("persona-stream-wipe");
  });

  it("puts pop-bubble on the bubble, not the content container", () => {
    expect(streamAnimationContainerClass("pop-bubble")).toBeNull();
    expect(streamAnimationBubbleClass("pop-bubble")).toBe("persona-stream-pop");
  });
});

describe("isWrappingAnimation", () => {
  it("is true for char and word modes", () => {
    expect(isWrappingAnimation("typewriter")).toBe(true);
    expect(isWrappingAnimation("letter-rise")).toBe(true);
    expect(isWrappingAnimation("glyph-cycle")).toBe(true);
    expect(isWrappingAnimation("word-fade")).toBe(true);
    expect(isWrappingAnimation("wipe")).toBe(true);
  });

  it("is false for container-only modes and none", () => {
    expect(isWrappingAnimation("none")).toBe(false);
    expect(isWrappingAnimation("pop-bubble")).toBe(false);
  });
});

describe("createSkeletonPlaceholder", () => {
  it("renders a single full-width shimmer line", () => {
    const el = createSkeletonPlaceholder();
    expect(el.classList.contains("persona-stream-skeleton")).toBe(true);
    expect(el.querySelectorAll(".persona-stream-skeleton-line").length).toBe(1);
    expect(el.getAttribute("data-preserve-animation")).toBe("stream-skeleton");
  });
});

describe("createStreamCaret", () => {
  it("creates a span with data-preserve-animation so idiomorph keeps blink going", () => {
    const caret = createStreamCaret();
    expect(caret.tagName).toBe("SPAN");
    expect(caret.classList.contains("persona-stream-caret")).toBe(true);
    expect(caret.getAttribute("data-preserve-animation")).toBe("stream-caret");
    expect(caret.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("plugin registry", () => {
  it("resolves built-in types without requiring registration", () => {
    expect(resolveStreamAnimationPlugin("typewriter")?.name).toBe("typewriter");
    expect(resolveStreamAnimationPlugin("pop-bubble")?.name).toBe("pop-bubble");
  });

  it("returns null for 'none' and unknown types", () => {
    expect(resolveStreamAnimationPlugin("none")).toBeNull();
    expect(resolveStreamAnimationPlugin("totally-made-up")).toBeNull();
  });

  it("prefers per-instance overrides over the global registry", () => {
    const custom: StreamAnimationPlugin = {
      name: "typewriter",
      containerClass: "custom-typewriter",
      wrap: "char",
    };
    const plugin = resolveStreamAnimationPlugin("typewriter", { typewriter: custom });
    expect(plugin?.containerClass).toBe("custom-typewriter");
  });

  it("registerStreamAnimationPlugin makes the plugin globally resolvable", () => {
    const sparkle: StreamAnimationPlugin = {
      name: "sparkle",
      containerClass: "sparkle-fx",
      wrap: "char",
    };
    registerStreamAnimationPlugin(sparkle);
    expect(resolveStreamAnimationPlugin("sparkle")?.containerClass).toBe("sparkle-fx");
    expect(listRegisteredStreamAnimations()).toContain("sparkle");
    unregisterStreamAnimationPlugin("sparkle");
    expect(resolveStreamAnimationPlugin("sparkle")).toBeNull();
  });

  it("unregisterStreamAnimationPlugin refuses to remove built-ins", () => {
    unregisterStreamAnimationPlugin("typewriter");
    expect(resolveStreamAnimationPlugin("typewriter")?.name).toBe("typewriter");
  });
});

describe("applyStreamBuffer", () => {
  const message = { id: "m1", role: "assistant", content: "" } as AgentWidgetMessage;

  it("passes through when streaming is false", () => {
    expect(applyStreamBuffer("abc", "word", null, message, false)).toBe("abc");
  });

  it("passes through when buffer is 'none'", () => {
    expect(applyStreamBuffer("abc def", "none", null, message, true)).toBe("abc def");
  });

  it("word mode trims to the last whitespace boundary", () => {
    expect(applyStreamBuffer("hello wor", "word", null, message, true)).toBe("hello");
    expect(applyStreamBuffer("hello world ", "word", null, message, true)).toBe(
      "hello world"
    );
  });

  it("word mode hides all content until the first word boundary", () => {
    expect(applyStreamBuffer("partial", "word", null, message, true)).toBe("");
  });

  it("line mode trims to the last newline", () => {
    expect(applyStreamBuffer("line1\nmid", "line", null, message, true)).toBe("line1");
  });

  it("plugin.bufferContent takes precedence over the built-in strategy", () => {
    const plugin: StreamAnimationPlugin = {
      name: "capper",
      bufferContent: (content) => content.slice(0, 3),
    };
    expect(applyStreamBuffer("hello world", "word", plugin, message, true)).toBe("hel");
  });
});

describe("ensurePluginActive / detachAllPlugins", () => {
  it("injects plugin styles once and runs onAttach cleanup on detach", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    let attached = 0;
    let detached = 0;
    const plugin: StreamAnimationPlugin = {
      name: "test-attach",
      styles: ".test-attach { color: red; }",
      onAttach() {
        attached += 1;
        return () => {
          detached += 1;
        };
      },
    };
    ensurePluginActive(plugin, root);
    ensurePluginActive(plugin, root); // second call is a no-op

    expect(attached).toBe(1);
    expect(root.querySelectorAll("style[data-persona-animation='test-attach']").length).toBe(1);

    detachAllPlugins(root);
    expect(detached).toBe(1);

    document.body.removeChild(root);
  });

  it("re-injects plugin styles after the root's children are cleared", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const plugin: StreamAnimationPlugin = {
      name: "test-reinject",
      styles: ".test-reinject { color: red; }",
    };

    ensurePluginActive(plugin, root);
    expect(root.querySelectorAll("style[data-persona-animation='test-reinject']").length).toBe(1);

    // Simulate widget re-init: destroy callbacks run, then host is wiped.
    detachAllPlugins(root);
    root.innerHTML = "";

    ensurePluginActive(plugin, root);
    expect(root.querySelectorAll("style[data-persona-animation='test-reinject']").length).toBe(1);

    document.body.removeChild(root);
  });
});
