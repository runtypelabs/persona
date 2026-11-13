// Decides which calls to the UI SDK bridge tools run without a prompt in the
// chat, and words the approval bubble for the ones that ask first.
//
// This is chat UX, not the safety boundary. Controls marked
// `data-agent-confirm` are guarded by the bridge itself: it asks the page's
// `allow` callback for those steps whatever this policy decides.

type BridgeStep = { ref: string; action: string; args: unknown[] };

/** The part of a bridge snapshot entry this policy reads. */
export type BridgeComponent = { ref: string; label?: string; confirm?: string };

const READ_ONLY_TOOLS = new Set(["snapshot", "query"]);

// The actions this page's fields report in their snapshot, all of which only
// move a control's own state. Anything else (`press`, or an action a later
// UI SDK version adds) is treated as consequential until it is listed here.
const FIELD_EDIT_ACTIONS = new Set(["setValue", "setChecked", "setOpen", "setQuery", "clear"]);

export const bareToolName = (toolName: string): string =>
  toolName.replace(/^webmcp[:_]/, "");

/** Reads the `steps` of an `act` call. Returns null when the shape is not usable. */
export function readActSteps(args: unknown): BridgeStep[] | null {
  if (!args || typeof args !== "object") return null;
  const steps = (args as { steps?: unknown }).steps;
  if (!Array.isArray(steps) || steps.length === 0) return null;

  const parsed: BridgeStep[] = [];
  for (const step of steps) {
    if (!step || typeof step !== "object") return null;
    const { ref, action, args: stepArgs } = step as Record<string, unknown>;
    if (typeof ref !== "string" || typeof action !== "string") return null;
    parsed.push({ ref, action, args: Array.isArray(stepArgs) ? stepArgs : [] });
  }
  return parsed;
}

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The marked component a `press` step names, when the step names exactly one
 * component by its ref or its whole label. A looser name is left to the
 * bridge to resolve, and the step asks in the chat as any other press does.
 */
function markedTargetOf(
  step: BridgeStep,
  components: readonly BridgeComponent[],
): BridgeComponent | undefined {
  if (step.action !== "press" || step.args.length > 0) return undefined;
  const matches = components.filter(
    (component) =>
      sameName(component.ref, step.ref) ||
      (component.label !== undefined && sameName(component.label, step.ref)),
  );
  return matches.length === 1 && matches[0].confirm ? matches[0] : undefined;
}

/**
 * True when a bridge call may run without the chat's approval bubble: the read
 * tools, and an `act` call whose every step either edits a field or presses a
 * marked control, which the page confirms with the person itself.
 */
export function isAutoApprovedBridgeCall(
  toolName: string,
  args: unknown,
  components: readonly BridgeComponent[] = [],
): boolean {
  const name = bareToolName(toolName);
  if (READ_ONLY_TOOLS.has(name)) return true;
  if (name !== "act") return false;
  const steps = readActSteps(args);
  return (
    steps !== null &&
    steps.every(
      (step) =>
        FIELD_EDIT_ACTIONS.has(step.action) || markedTargetOf(step, components) !== undefined,
    )
  );
}

const quote = (value: unknown): string => `“${String(value)}”`;

/** A step may name its component by a bridge ref such as `c15`: show its label. */
const nameOf = (ref: string, components: readonly BridgeComponent[]): string =>
  components.find((component) => component.ref === ref)?.label ?? ref;

function describeStep(step: BridgeStep, components: readonly BridgeComponent[]): string {
  const [first] = step.args;
  const target = nameOf(step.ref, components);
  if (step.action === "press") {
    return `press ${quote(first ?? target)}`;
  }
  if (step.action === "setChecked") {
    return `turn ${quote(target)} ${first ? "on" : "off"}`;
  }
  if (/^set[A-Z]/.test(step.action)) {
    return `set ${quote(target)} to ${quote(first)}`;
  }
  return `${step.action} ${quote(target)}`;
}

/** Plain-language summary of an `act` call for the approval bubble. */
export function describeBridgeApproval(
  toolName: string,
  args: unknown,
  components: readonly BridgeComponent[] = [],
): string | undefined {
  if (bareToolName(toolName) !== "act") return undefined;
  const steps = readActSteps(args);
  if (!steps) return undefined;
  const summary = steps.map((step) => describeStep(step, components)).join(", then ");
  return `Allow the assistant to ${summary}?`;
}
