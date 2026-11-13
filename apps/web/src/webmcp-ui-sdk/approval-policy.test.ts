import { describe, expect, test } from "vitest";

import {
  describeBridgeApproval,
  isAutoApprovedBridgeCall,
  type BridgeComponent,
} from "./approval-policy";

const components: BridgeComponent[] = [
  { ref: "c1", label: "Workspace name" },
  { ref: "c2", label: "Save changes" },
  { ref: "c3", label: "Delete workspace", confirm: "Permanently deletes this workspace" },
];

const act = (...steps: unknown[]) => ({ steps });

describe("isAutoApprovedBridgeCall", () => {
  test("runs the read tools without a prompt, with or without the wire prefix", () => {
    expect(isAutoApprovedBridgeCall("snapshot", {})).toBe(true);
    expect(isAutoApprovedBridgeCall("webmcp:query", { within: "Region" })).toBe(true);
  });

  test("runs an act call whose every step edits a field", () => {
    const call = act(
      { ref: "Workspace name", action: "setValue", args: ["Northwind"] },
      { ref: "Weekly digest email", action: "setChecked", args: [false] },
    );
    expect(isAutoApprovedBridgeCall("act", call, components)).toBe(true);
  });

  test("asks in the chat when any step presses an unmarked button", () => {
    const call = act(
      { ref: "Workspace name", action: "setValue", args: ["Northwind"] },
      { ref: "Save changes", action: "press" },
    );
    expect(isAutoApprovedBridgeCall("act", call, components)).toBe(false);
  });

  test("leaves a marked control to the page's own confirmation", () => {
    expect(
      isAutoApprovedBridgeCall("act", act({ ref: "delete workspace", action: "press" }), components),
    ).toBe(true);
    expect(isAutoApprovedBridgeCall("act", act({ ref: "c3", action: "press" }), components)).toBe(
      true,
    );
  });

  test("asks in the chat when a press names its target loosely or by button text", () => {
    expect(
      isAutoApprovedBridgeCall("act", act({ ref: "Delete", action: "press" }), components),
    ).toBe(false);
    expect(
      isAutoApprovedBridgeCall(
        "act",
        act({ ref: "c3", action: "press", args: ["Delete workspace"] }),
        components,
      ),
    ).toBe(false);
  });

  test.each([
    ["an unknown action", act({ ref: "Workspace name", action: "submit" })],
    ["no steps", act()],
    ["a step without an action", act({ ref: "Workspace name" })],
    ["arguments that are not an object", "setValue"],
  ])("asks in the chat for an act call with %s", (_name, call) => {
    expect(isAutoApprovedBridgeCall("act", call, components)).toBe(false);
  });

  test("asks in the chat for a tool the bridge does not publish", () => {
    expect(isAutoApprovedBridgeCall("delete_everything", {})).toBe(false);
  });
});

describe("describeBridgeApproval", () => {
  test("words each step of an act call for the approval bubble", () => {
    const call = act(
      { ref: "Region", action: "setValue", args: ["Europe"] },
      { ref: "Require two-factor sign-in", action: "setChecked", args: [true] },
      { ref: "Save changes", action: "press" },
    );
    expect(describeBridgeApproval("webmcp:act", call)).toBe(
      "Allow the assistant to set “Region” to “Europe”, then turn “Require two-factor sign-in” on, then press “Save changes”?",
    );
  });

  test("shows a component's label when the step names it by ref", () => {
    expect(describeBridgeApproval("act", act({ ref: "c2", action: "press" }), components)).toBe(
      "Allow the assistant to press “Save changes”?",
    );
  });

  test("falls back to the default copy for other tools and unreadable steps", () => {
    expect(describeBridgeApproval("snapshot", {})).toBeUndefined();
    expect(describeBridgeApproval("act", { steps: "all" })).toBeUndefined();
  });
});
