// @vitest-environment jsdom
import pageHtml from "../style-migration.html?raw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeWithDefaults } from "../../../packages/widget/src/defaults";
import { mergeConfigUpdate } from "../../../packages/widget/src/utils/config-merge";
import { hasExplicitStylePath } from "../../../packages/widget/src/utils/style-provenance";
import { resolveWelcomeConfig } from "../../../packages/widget/src/welcome";
import { legacyOverrides, migrateOverrides, resetStyleOverrides, themeOverrides } from "./style-migration-config";

const mocks = vi.hoisted(() => ({
  init: vi.fn(), update: vi.fn(), inject: vi.fn(), destroy: vi.fn(), clearChat: vi.fn(),
  clearArtifacts: vi.fn(), upsertArtifact: vi.fn(), selectArtifact: vi.fn(), showArtifacts: vi.fn(),
}));
vi.mock("@runtypelabs/persona", () => ({ initAgentWidget: mocks.init }));
vi.mock("./examples-nav", () => ({ renderExamplesShell: vi.fn() }));
vi.mock("./demo-echo-fetch", () => ({ createDemoEchoFetch: () => vi.fn() }));

async function start() {
  vi.resetModules();
  mocks.init.mockReturnValue({
    update: mocks.update, injectTestMessage: mocks.inject, destroy: mocks.destroy,
    clearChat: mocks.clearChat, clearArtifacts: mocks.clearArtifacts, upsertArtifact: mocks.upsertArtifact,
    selectArtifact: mocks.selectArtifact, showArtifacts: mocks.showArtifacts,
  });
  document.body.innerHTML = pageHtml;
  await import("./style-migration");
}
function choose(id: string, value: string) {
  const element = document.querySelector<HTMLSelectElement>(`#${id}`)!;
  element.value = value;
  element.dispatchEvent(new Event("change"));
}
function click(id: string) { document.querySelector<HTMLButtonElement>(`#${id}`)!.click(); }
afterEach(() => { window.dispatchEvent(new Event("pagehide")); vi.clearAllMocks(); document.body.innerHTML = ""; });

describe("style migration lab", () => {
  it("retains its mounted widget and live controls over repeated cached Back restores", async () => {
    await start();
    for (let cycle = 0; cycle < 2; cycle++) {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      click("live-layer");
      expect(mocks.update.mock.lastCall?.[0]).toMatchObject(themeOverrides());
      expect(mocks.init).toHaveBeenCalledOnce();
      expect(mocks.destroy).not.toHaveBeenCalled();
    }
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("mounts once with isolated storage and applies resets without clearing the transcript", async () => {
    await start();
    expect(mocks.init.mock.lastCall?.[0].config.persistState).toBe(false);
    click("live-layer");
    expect(mocks.update.mock.lastCall?.[0]).toMatchObject(themeOverrides());
    click("live-migrate");
    const migrated = mocks.update.mock.lastCall?.[0];
    expect(Object.prototype.hasOwnProperty.call(migrated.launcher, "closeButtonColor")).toBe(true);
    expect(migrated.launcher.closeButtonColor).toBeUndefined();
    expect(migrated.suggestionChips).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(migrated, "suggestionChips")).toBe(true);
    expect(migrated.suggestions.starters).toMatchObject({ variant: "chip", placement: "composer", overflow: "wrap", maxItems: 4 });
    expect(document.querySelector("#live-code")!.textContent).toContain('"closeButtonColor": undefined');
    click("live-reset");
    expect(mocks.update.mock.lastCall?.[0].theme).toBeUndefined();
    choose("defaults", "v4");
    choose("scheme", "dark");
    choose("width", "narrow");
    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(mocks.clearChat).not.toHaveBeenCalled();
    expect(mocks.update.mock.lastCall?.[0]).toEqual({ future: { v5Defaults: false }, colorScheme: "dark" });
    expect(document.querySelector<HTMLElement>(".migration-page")!.dataset.width).toBe("narrow");
  });

  it.each([false, true])("clears alias origin while preserving unrelated behavior (v5=%s)", (v5Defaults) => {
    const initial = mergeWithDefaults({
      ...legacyOverrides("light"), future: { v5Defaults },
      launcher: { ...legacyOverrides("light").launcher, enabled: false, title: "Host title" },
      approval: { ...legacyOverrides("light").approval, approveLabel: "Allow once" },
      features: { ...legacyOverrides("light").features, askUserQuestion: { ...legacyOverrides("light").features?.askUserQuestion, layout: "pills" } },
    });
    const layered = mergeConfigUpdate(initial, themeOverrides());
    expect(hasExplicitStylePath(layered, "launcher.closeButtonColor")).toBe(true);
    const migrated = mergeConfigUpdate(layered, migrateOverrides());
    expect(hasExplicitStylePath(migrated, "launcher.closeButtonColor")).toBe(false);
    expect(hasExplicitStylePath(migrated, "suggestionChipsConfig.paddingX")).toBe(false);
    expect(hasExplicitStylePath(migrated, "features.askUserQuestion.styles.sheetBackground")).toBe(false);
    expect(migrated.launcher).toMatchObject({ enabled: false, title: "Host title" });
    expect(migrated.approval && migrated.approval.approveLabel).toBe("Allow once");
    expect(migrated.features?.askUserQuestion?.layout).toBe("pills");
    expect(resolveWelcomeConfig(migrated).title).toBe(resolveWelcomeConfig(initial).title);
    const reset = mergeConfigUpdate(migrated, resetStyleOverrides());
    expect(reset.theme).toBeUndefined();
    expect(reset.darkTheme).toBeUndefined();
    expect(reset.suggestions?.starters?.items).toEqual(initial.suggestionChips);
    expect(reset.approval && reset.approval.approveLabel).toBe("Allow once");
  });

  it("keeps simulated controls separate from the mounted widget and exposes real local scenes", async () => {
    await start();
    choose("voice", "recording");
    click("reset");
    expect(mocks.update).not.toHaveBeenCalled();
    choose("scene", "question");
    expect(mocks.inject.mock.lastCall?.[0].message).toMatchObject({ variant: "tool", toolCall: { name: "ask_user_question" }, agentMetadata: { awaitingLocalTool: true } });
    choose("scene", "artifact");
    expect(mocks.upsertArtifact).toHaveBeenCalledWith(expect.objectContaining({ id: "migration-checklist", artifactType: "markdown", transcript: false }));
    expect(mocks.selectArtifact).toHaveBeenCalledWith("migration-checklist");
    expect(mocks.showArtifacts).toHaveBeenCalledOnce();
    expect(mocks.inject.mock.lastCall?.[0].message.rawContent).toContain("PersonaArtifactCard");
    choose("scene", "tools");
    const firstApproval = mocks.inject.mock.lastCall?.[0].message;
    expect(firstApproval.approval.status).toBe("pending");
    expect(firstApproval.id).toBe(`approval-${firstApproval.approval.id}`);
    const toolMessage = mocks.inject.mock.calls[mocks.inject.mock.calls.length - 2]?.[0].message;
    const userMessage = mocks.inject.mock.calls[mocks.inject.mock.calls.length - 3]?.[0].message;
    expect(new Date(firstApproval.createdAt).getTime()).toBeGreaterThan(new Date(toolMessage.createdAt).getTime());
    expect(new Date(toolMessage.createdAt).getTime()).toBeGreaterThan(new Date(userMessage.createdAt).getTime());
    click("replay");
    expect(mocks.inject.mock.lastCall?.[0].message.approval.id).not.toBe(firstApproval.approval.id);
    expect(mocks.init).toHaveBeenCalledTimes(1);
  });
});
