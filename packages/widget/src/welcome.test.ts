import { describe, expect, it, vi } from "vitest";

import { DEFAULT_WIDGET_CONFIG, mergeWithDefaults } from "./defaults";
import { mergeConfigUpdate } from "./utils/config-merge";
import {
  DEFAULT_WELCOME_SUBTITLE,
  DEFAULT_WELCOME_TITLE,
  isWelcomeVisible,
  resolveConversationState,
  resolveWelcomeConfig,
} from "./welcome";
import type { AgentWidgetConfig, AgentWidgetMessage } from "./types";

const config = (partial: Partial<AgentWidgetConfig>): AgentWidgetConfig =>
  partial as AgentWidgetConfig;

const userMessage: AgentWidgetMessage = {
  id: "u1",
  role: "user",
  content: "hi",
  createdAt: "2026-08-01T00:00:00.000Z",
  streaming: false,
};

const assistantMessage: AgentWidgetMessage = {
  ...userMessage,
  id: "a1",
  role: "assistant",
};

describe("resolveWelcomeConfig", () => {
  it("falls back to resolver-owned defaults", () => {
    const resolved = resolveWelcomeConfig(config({}));
    expect(resolved.title).toBe(DEFAULT_WELCOME_TITLE);
    expect(resolved.subtitle).toBe(DEFAULT_WELCOME_SUBTITLE);
    expect(resolved.variant).toBe("card");
    expect(resolved.dismiss).toBe("never");
    expect(resolved.message).toBeUndefined();
    expect(resolved.icon).toBeUndefined();
    expect(resolved.anchor).toBe("bottom");
    expect(resolved.anchorComposerTop).toBe("44%");
    expect(resolved.composerGap).toBe("24px");
  });

  it("keeps a valid center anchor and its geometry", () => {
    const resolved = resolveWelcomeConfig(
      config({
        welcome: {
          anchor: "center",
          anchorComposerTop: "43%",
          composerGap: "16px",
        },
      })
    );
    expect(resolved.anchor).toBe("center");
    expect(resolved.anchorComposerTop).toBe("43%");
    expect(resolved.composerGap).toBe("16px");
  });

  it("falls back to 44% for an invalid anchorComposerTop, warning once in debug", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const invalid = config({
      debug: true,
      welcome: { anchor: "center", anchorComposerTop: "120%" },
    });
    expect(resolveWelcomeConfig(invalid).anchorComposerTop).toBe("44%");
    resolveWelcomeConfig(invalid);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("welcome.anchorComposerTop must be");
    warn.mockRestore();
  });

  it("warns when the anchor geometry is set without anchor center", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveWelcomeConfig(config({ debug: true, welcome: { composerGap: "8px" } }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(
      'ignored unless welcome.anchor is "center"'
    );
    warn.mockRestore();
  });

  it("prefers welcome.* over the legacy copy aliases, per field", () => {
    const resolved = resolveWelcomeConfig(
      config({
        welcome: { title: "New title" },
        copy: { welcomeTitle: "Legacy title", welcomeSubtitle: "Legacy subtitle" },
      })
    );
    expect(resolved.title).toBe("New title");
    expect(resolved.subtitle).toBe("Legacy subtitle");
  });

  it("uses the legacy aliases when welcome does not set the field", () => {
    const resolved = resolveWelcomeConfig(
      config({ copy: { welcomeTitle: "Legacy", welcomeSubtitle: "Scope" } })
    );
    expect(resolved.title).toBe("Legacy");
    expect(resolved.subtitle).toBe("Scope");
  });

  it("honors an explicitly empty title or subtitle", () => {
    const resolved = resolveWelcomeConfig(
      config({ welcome: { title: "", subtitle: "" } })
    );
    expect(resolved.title).toBe("");
    expect(resolved.subtitle).toBe("");
  });

  it("maps showWelcomeCard: false onto variant none", () => {
    expect(
      resolveWelcomeConfig(config({ copy: { showWelcomeCard: false } })).variant
    ).toBe("none");
    expect(
      resolveWelcomeConfig(config({ copy: { showWelcomeCard: true } })).variant
    ).toBe("card");
  });

  it("lets welcome.variant win over showWelcomeCard", () => {
    expect(
      resolveWelcomeConfig(
        config({ welcome: { variant: "hero" }, copy: { showWelcomeCard: false } })
      ).variant
    ).toBe("hero");
  });

  it("forces on-first-message dismissal for hero and suppresses the greeting", () => {
    const resolved = resolveWelcomeConfig(
      config({
        welcome: { variant: "hero", dismiss: "never", message: "Hi there" },
      })
    );
    expect(resolved.dismiss).toBe("on-first-message");
    expect(resolved.message).toBeUndefined();
  });

  it("keeps the greeting for card and none variants", () => {
    expect(
      resolveWelcomeConfig(config({ welcome: { message: "Hi there" } })).message
    ).toBe("Hi there");
    expect(
      resolveWelcomeConfig(
        config({ welcome: { variant: "none", message: "Hi there" } })
      ).message
    ).toBe("Hi there");
  });

  it("warns once in debug mode when a field is set through both namespaces", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const withBoth = config({
      debug: true,
      welcome: { title: "New" },
      copy: { welcomeTitle: "Legacy" },
    });
    resolveWelcomeConfig(withBoth);
    resolveWelcomeConfig(withBoth);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("copy.welcomeTitle");
    warn.mockRestore();
  });

  it("warns in debug mode when message is set with variant hero", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveWelcomeConfig(
      config({ debug: true, welcome: { variant: "hero", message: "Hi" } })
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("welcome.message is ignored");
    warn.mockRestore();
  });

  it("stays silent outside debug mode", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveWelcomeConfig(
      config({ welcome: { title: "New" }, copy: { welcomeTitle: "Legacy" } })
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("welcome defaults are never materialized into config", () => {
  it("keeps welcome copy out of DEFAULT_WIDGET_CONFIG", () => {
    expect(DEFAULT_WIDGET_CONFIG.copy).not.toHaveProperty("welcomeTitle");
    expect(DEFAULT_WIDGET_CONFIG.copy).not.toHaveProperty("welcomeSubtitle");
    expect(DEFAULT_WIDGET_CONFIG).not.toHaveProperty("welcome");
  });

  it("keeps welcome copy out of a defaults-merged config", () => {
    const merged = mergeWithDefaults({ apiUrl: "https://example.com" });
    expect(merged.copy).not.toHaveProperty("welcomeTitle");
    expect(merged.copy).not.toHaveProperty("welcomeSubtitle");
    expect(merged.welcome).toBeUndefined();
  });

  it("resets to the resolver default on an explicit-undefined patch", () => {
    const initial = mergeWithDefaults({
      apiUrl: "https://example.com",
      welcome: { title: "Set by host" },
    }) as AgentWidgetConfig;
    expect(resolveWelcomeConfig(initial).title).toBe("Set by host");

    const cleared = mergeConfigUpdate(initial, {
      welcome: { title: undefined },
    });
    expect(cleared.welcome).not.toHaveProperty("title");
    expect(resolveWelcomeConfig(cleared).title).toBe(DEFAULT_WELCOME_TITLE);
  });

  it("falls back to the legacy alias after clearing the welcome field", () => {
    const initial = mergeWithDefaults({
      apiUrl: "https://example.com",
      welcome: { title: "New" },
      copy: { welcomeTitle: "Legacy" },
    }) as AgentWidgetConfig;
    const cleared = mergeConfigUpdate(initial, { welcome: { title: undefined } });
    expect(resolveWelcomeConfig(cleared).title).toBe("Legacy");
  });

  it("replaces the icon wholesale instead of splicing union variants", () => {
    const initial = mergeWithDefaults({
      apiUrl: "https://example.com",
      welcome: { icon: { type: "image", url: "/logo.png", alt: "Logo" } },
    }) as AgentWidgetConfig;
    const updated = mergeConfigUpdate(initial, {
      welcome: { icon: { type: "lucide", name: "sparkles" } },
    });
    expect(updated.welcome?.icon).toEqual({ type: "lucide", name: "sparkles" });
  });
});

describe("isWelcomeVisible", () => {
  const card = resolveWelcomeConfig(config({}));
  const hero = resolveWelcomeConfig(config({ welcome: { variant: "hero" } }));
  const none = resolveWelcomeConfig(config({ welcome: { variant: "none" } }));

  it("shows a never-dismissing card regardless of transcript content", () => {
    expect(isWelcomeVisible(card, [])).toBe(true);
    expect(isWelcomeVisible(card, [userMessage])).toBe(true);
  });

  it("hides an on-first-message surface once a user message exists", () => {
    expect(isWelcomeVisible(hero, [])).toBe(true);
    expect(isWelcomeVisible(hero, [assistantMessage])).toBe(true);
    expect(isWelcomeVisible(hero, [userMessage, assistantMessage])).toBe(false);
  });

  it("never shows variant none", () => {
    expect(isWelcomeVisible(none, [])).toBe(false);
  });

  it("treats a missing message list as empty", () => {
    expect(isWelcomeVisible(hero, undefined)).toBe(true);
  });
});

describe("resolveConversationState", () => {
  it("stays empty until a user message exists", () => {
    expect(resolveConversationState([])).toBe("empty");
    expect(resolveConversationState(undefined)).toBe("empty");
    expect(resolveConversationState([assistantMessage])).toBe("empty");
  });

  it("flips to active on the first user message", () => {
    expect(resolveConversationState([userMessage])).toBe("active");
    expect(resolveConversationState([assistantMessage, userMessage])).toBe(
      "active"
    );
  });

  it("ignores welcome.message, which is never a session message", () => {
    const greeted = resolveWelcomeConfig(config({ welcome: { message: "Hi" } }));
    expect(greeted.message).toBe("Hi");
    expect(resolveConversationState([])).toBe("empty");
  });
});
