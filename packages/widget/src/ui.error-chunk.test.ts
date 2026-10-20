// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { setApprovalUiLoader } from "./approval-ui-loader";
import * as approvalUi from "./approval-ui-entry";

it("heals an errors-only transcript when its lazy renderer loads", async () => {
  window.scrollTo = vi.fn();
  let resolve!: (module: typeof approvalUi) => void;
  setApprovalUiLoader(() => new Promise((ready) => { resolve = ready; }));
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://example.invalid/chat", launcher: { enabled: false },
    persistState: false, errorDisplay: "block",
  });
  controller.injectAssistantMessage({ content: "Offline", dispatchError: true });
  expect(mount.querySelector(".persona-error-block")).toBeNull();
  expect(mount.textContent).toContain("Offline");
  resolve(approvalUi);
  await new Promise((done) => setTimeout(done, 0));
  expect(mount.querySelector('.persona-error-block[role="alert"]')?.textContent).toContain("Offline");
  controller.destroy(); mount.remove(); vi.restoreAllMocks();
});
