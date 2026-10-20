// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { initAgentWidget, type ComposerSubmissionSnapshot } from "@runtypelabs/persona";
import { createAssistantPreset } from "./assistant-presets";

let widget: ReturnType<typeof initAgentWidget> | undefined;
afterEach(() => { widget?.destroy(); widget = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); });

it.each([false, true])("uses real mode state for research selection, submission and removal (V5=%s)", async v5 => {
  vi.spyOn(window, "getComputedStyle").mockImplementation(element => (element as HTMLElement).style);
  const host = document.createElement("div"); document.body.append(host);
  const config = createAssistantPreset("claude", vi.fn());
  const beforeSend = vi.fn((_snapshot: ComposerSubmissionSnapshot) => false as const);
  widget = initAgentWidget({ target: host, config: { ...config, apiUrl: "/local", future: { v5Defaults: v5 }, composer: { ...config.composer, onBeforeSend: beforeSend } } });
  const openMenu = () => host.querySelector<HTMLButtonElement>('[data-persona-composer-overflow-trigger]')!.click();
  const activeButton = () => host.querySelector<HTMLButtonElement>('[data-persona-composer-action="core:mode:research"] > button');
  expect(activeButton()).toBeNull();
  await vi.waitFor(() => expect(host.querySelector('[data-persona-composer-overflow-trigger]')).not.toBeNull());
  openMenu();
  document.querySelector<HTMLButtonElement>('[data-action="core:mode:research"]')!.click();
  expect(widget.getComposerState().activeModeIds).toEqual(["research", "chat"]);
  expect(document.querySelector('[data-persona-composer-overflow-menu]')).toBeNull();
  expect(activeButton()?.getAttribute("aria-pressed")).toBe("true");
  expect(activeButton()?.getAttribute("aria-label")).toBe("Research mode");
  expect(activeButton()?.querySelector('.persona-composer-action-button__label')).toBeNull();
  expect(host.querySelector('.persona-composer-mode-chip')).toBeNull();
  widget.submitMessage("Find reliable sources");
  await vi.waitFor(() => expect(beforeSend).toHaveBeenCalled());
  expect(beforeSend.mock.calls[0]?.[0]).toMatchObject({ options: { activeModeIds: ["research", "chat"] } });
  activeButton()!.click();
  expect(widget.getComposerState().activeModeIds).toEqual(["chat"]);
  expect(activeButton()).toBeNull();
  openMenu();
  expect(document.querySelector('[data-action="core:mode:research"]')).not.toBeNull();
});
