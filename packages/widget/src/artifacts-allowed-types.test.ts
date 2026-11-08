import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetClient } from "./client";
import { AgentWidgetSession } from "./session";
import type {
  AgentWidgetConfig,
  AgentWidgetEvent,
  AgentWidgetStreamCheckpoint,
  PersonaArtifactKind,
} from "./types";

type Frame = Record<string, unknown>;
const stream = (frames: Frame[], cursors = true) => new ReadableStream<Uint8Array>({
  start(controller) {
    frames.forEach((frame, index) => controller.enqueue(new TextEncoder().encode(
      `${cursors ? `id: ${index + 1}\n` : ""}data: ${JSON.stringify(frame)}\n\n`
    )));
    controller.close();
  },
});
const start = (kind: PersonaArtifactKind): Frame => ({
  type: "artifact_start", id: kind, artifactType: kind, component: "Chart",
});
const content = (kind: PersonaArtifactKind): Frame => kind === "markdown"
  ? { type: "artifact_delta", id: kind, delta: "# Notes" }
  : { type: "artifact_update", id: kind, props: { values: [1, 2] } };
const complete = (kind: PersonaArtifactKind): Frame => ({ type: "artifact_complete", id: kind });
const mixedArtifacts = () => [
  start("markdown"), start("component"), content("markdown"), content("component"),
  complete("markdown"), complete("component"),
];
const artifactEvents = (events: AgentWidgetEvent[]) => events.filter(event => event.type.startsWith("artifact_"));
const messages = (events: AgentWidgetEvent[]) => events.flatMap(event => event.type === "message" ? [event.message] : []);
const config = (allowedTypes?: PersonaArtifactKind[]): AgentWidgetConfig => ({
  apiUrl: "/test", features: { artifacts: { allowedTypes, display: "inline" } },
});

afterEach(() => vi.unstubAllGlobals());

describe("streamed artifact allowedTypes", () => {
  it.each(["markdown", "component"] as const)("filters disallowed events and transcript blocks while completing allowed %s artifacts", async allowed => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream(mixedArtifacts()))));
    const client = new AgentWidgetClient(config([allowed]));
    const events: AgentWidgetEvent[] = [];
    const rawEvents: unknown[] = [];
    client.setSSEEventCallback((_type, payload) => rawEvents.push(payload));
    await client.dispatch({ messages: [] }, event => events.push(event));

    expect(artifactEvents(events)).toEqual([
      expect.objectContaining({ type: "artifact_start", id: allowed, artifactType: allowed }),
      expect.objectContaining({ type: allowed === "markdown" ? "artifact_delta" : "artifact_update", id: allowed }),
      { type: "artifact_complete", id: allowed },
    ]);
    expect(new Set(messages(events).map(message => message.id))).toEqual(new Set([`artifact-ref-${allowed}`]));
    const finalBlock = messages(events).at(-1)!;
    expect(finalBlock.streaming).toBe(false);
    expect(JSON.parse(finalBlock.rawContent!).props).toMatchObject({
      status: "complete",
      ...(allowed === "markdown" ? { markdown: "# Notes" } : { componentProps: { values: [1, 2] } }),
    });
    expect(rawEvents).toEqual(mixedArtifacts());
  });

  it.each<{ allowedTypes: PersonaArtifactKind[] | undefined }>([
    { allowedTypes: undefined }, { allowedTypes: [] },
  ])("keeps both artifact types when the allowlist is $allowedTypes", async ({ allowedTypes }) => {
    const events: AgentWidgetEvent[] = [];
    await new AgentWidgetClient(config(allowedTypes))
      .processStream(stream(mixedArtifacts()), event => events.push(event));
    expect(artifactEvents(events)).toHaveLength(6);
    expect(new Set(messages(events).map(message => message.id))).toEqual(new Set([
      "artifact-ref-markdown", "artifact-ref-component",
    ]));
  });

  it("retains denied IDs in a reconnect checkpoint without requiring background mode", async () => {
    const client = new AgentWidgetClient(config(["markdown"]));
    const before: AgentWidgetEvent[] = [];
    await client.processStream(stream([start("component"), start("markdown"), content("markdown")]), event => before.push(event));
    const checkpoint = before.flatMap(event => event.type === "cursor" && event.checkpoint ? [event.checkpoint] : []).at(-1)!;
    expect(checkpoint.ignoredArtifactIds).toEqual(["component"]);
    const restored: AgentWidgetStreamCheckpoint = JSON.parse(JSON.stringify(checkpoint));
    const after: AgentWidgetEvent[] = [];
    await new AgentWidgetClient(config(["markdown"])).processStream(
      stream([content("component"), complete("component"), complete("markdown")]),
      event => after.push(event), undefined, undefined, undefined, messages(before), restored
    );
    expect(artifactEvents(after)).toEqual([{ type: "artifact_complete", id: "markdown" }]);
    expect(messages(after)).toHaveLength(1);
    expect(JSON.parse(messages(after)[0].rawContent!).props).toMatchObject({ status: "complete", markdown: "# Notes" });
  });

  it("suppresses denied followups across approval/tool continuations without cursor frames", async () => {
    const client = new AgentWidgetClient(config(["markdown"]));
    const events: AgentWidgetEvent[] = [];
    await client.processStream(stream([start("component")], false), event => events.push(event));
    await client.processStream(stream([content("component"), complete("component")], false), event => events.push(event));
    expect(artifactEvents(events)).toEqual([]);
    expect(messages(events)).toEqual([]);
    expect(events.some(event => event.type === "cursor")).toBe(false);
  });

  it.each(["dispatch", "cancelStreams"] as const)("resets prior ignored IDs at a fresh %s boundary", async boundary => {
    const client = new AgentWidgetClient(config(["markdown"]));
    await client.processStream(stream([start("component")], false), () => {});
    const events: AgentWidgetEvent[] = [];
    if (boundary === "dispatch") {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(stream([complete("component")], false))));
      await client.dispatch({ messages: [] }, event => events.push(event));
    } else {
      client.cancelStreams();
      await client.processStream(stream([complete("component")], false), event => events.push(event));
    }
    // A continuation can update a pre-existing artifact without a new start;
    // a denial from another turn/conversation must not suppress that event.
    expect(artifactEvents(events)).toEqual([{ type: "artifact_complete", id: "component" }]);
  });

  it("uses the current allowlist for new starts without deleting earlier accepted artifacts", async () => {
    const client = new AgentWidgetClient(config(["markdown"]));
    const events: AgentWidgetEvent[] = [];
    await client.processStream(stream([start("markdown"), start("component"), complete("markdown")]), event => {
      events.push(event);
      if (event.type === "artifact_start") client.updateConfig(config(["component"]));
    });
    expect(artifactEvents(events)).toEqual([
      expect.objectContaining({ type: "artifact_start", id: "markdown" }),
      expect.objectContaining({ type: "artifact_start", id: "component" }),
      { type: "artifact_complete", id: "markdown" },
    ]);
  });

  it("filters external streams before they enter session state and preserves manual and restored artifacts", async () => {
    const session = new AgentWidgetSession({
      ...config(["markdown"]),
      initialArtifacts: [{ id: "historical", artifactType: "component", status: "complete", component: "Chart", props: {} }],
    }, {
      onMessagesChanged: () => {}, onStatusChanged: () => {}, onStreamingChanged: () => {},
    });
    session.upsertArtifact({ id: "manual", artifactType: "component", component: "Chart" });
    await session.connectStream(stream(mixedArtifacts()));

    expect(session.getArtifacts().map(record => record.id)).toEqual(["historical", "manual", "markdown"]);
    expect(session.getArtifactById("markdown")).toMatchObject({ status: "complete", markdown: "# Notes" });
    expect(session.getSelectedArtifactId()).toBe("markdown");
    expect(session.getMessages().map(message => message.id)).toEqual(["artifact-ref-manual", "artifact-ref-markdown"]);
    session.hydrateArtifacts([{ id: "restored", artifactType: "component", status: "complete", component: "Chart", props: {} }]);
    expect(session.getArtifacts().map(record => record.id)).toEqual(["restored"]);
    session.destroy();
  });
});
