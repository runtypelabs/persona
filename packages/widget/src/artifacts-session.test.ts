import { describe, it, expect, vi } from "vitest";
import { AgentWidgetSession } from "./session";

describe("AgentWidgetSession artifacts", () => {
  it("merges artifact_start, delta, complete into markdown state", () => {
    const onArtifactsState = vi.fn();
    const session = new AgentWidgetSession(
      {},
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onArtifactsState
      }
    );

    session.injectTestEvent({
      type: "artifact_start",
      id: "a1",
      artifactType: "markdown",
      title: "Doc"
    });
    expect(onArtifactsState.mock.calls.length).toBe(1);
    expect(onArtifactsState.mock.calls[0][0].artifacts[0].markdown).toBe("");

    session.injectTestEvent({
      type: "artifact_delta",
      id: "a1",
      artDelta: "# Hello"
    });
    expect(onArtifactsState.mock.calls[1][0].artifacts[0].markdown).toBe("# Hello");

    session.injectTestEvent({ type: "artifact_complete", id: "a1" });
    expect(onArtifactsState.mock.calls[2][0].artifacts[0].status).toBe("complete");
  });

  it("clearMessages clears artifacts", () => {
    const onArtifactsState = vi.fn();
    const session = new AgentWidgetSession(
      {},
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onArtifactsState
      }
    );
    session.injectTestEvent({
      type: "artifact_start",
      id: "x",
      artifactType: "markdown"
    });
    session.injectTestEvent({
      type: "artifact_delta",
      id: "x",
      artDelta: "Hi"
    });
    expect(session.getArtifacts().length).toBe(1);
    session.clearMessages();
    expect(session.getArtifacts().length).toBe(0);
    const last = onArtifactsState.mock.calls.pop()?.[0];
    expect(last?.artifacts.length).toBe(0);
  });

  it("upsertArtifact adds record", () => {
    const onArtifactsState = vi.fn();
    const session = new AgentWidgetSession(
      {},
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onArtifactsState
      }
    );
    session.upsertArtifact({ artifactType: "markdown", content: "C" });
    expect(session.getArtifacts()).toHaveLength(1);
    expect(session.getArtifacts()[0].markdown).toBe("C");
  });

  it("stores file metadata via applyArtifactStreamEvent and keeps accumulating deltas", () => {
    const session = new AgentWidgetSession(
      {},
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onArtifactsState: () => {}
      }
    );
    const file = { path: "outputs/cat.html", mimeType: "text/html", language: "html" };
    session.injectTestEvent({
      type: "artifact_start",
      id: "f1",
      artifactType: "markdown",
      title: "outputs/cat.html",
      file
    });
    session.injectTestEvent({ type: "artifact_delta", id: "f1", artDelta: "```html\n" });
    session.injectTestEvent({ type: "artifact_delta", id: "f1", artDelta: "<h1>hi</h1>\n```" });
    const rec = session.getArtifactById("f1");
    expect(rec?.file).toEqual(file);
    expect(rec?.markdown).toBe("```html\n<h1>hi</h1>\n```");
  });

  it("upsertArtifact injects a card transcript block by default", () => {
    const session = new AgentWidgetSession(
      {},
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onArtifactsState: () => {}
      }
    );
    const rec = session.upsertArtifact({
      artifactType: "markdown",
      title: "Doc",
      content: "# Hi"
    });
    const block = session
      .getMessages()
      .find((m) => m.id === `artifact-ref-${rec.id}`);
    expect(block).toBeDefined();
    expect(block?.role).toBe("assistant");
    const parsed = JSON.parse(block!.rawContent!);
    expect(parsed.component).toBe("PersonaArtifactCard");
    expect(parsed.props).toMatchObject({
      artifactId: rec.id,
      title: "Doc",
      artifactType: "markdown",
      status: "complete",
      markdown: "# Hi"
    });
  });

  it("upsertArtifact injects an inline block when display resolves to inline", () => {
    const session = new AgentWidgetSession(
      { features: { artifacts: { enabled: true, display: "inline" } } },
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onArtifactsState: () => {}
      }
    );
    const rec = session.upsertArtifact({
      artifactType: "component",
      title: "Chart",
      component: "MyChart",
      props: { series: [1, 2] }
    });
    const block = session
      .getMessages()
      .find((m) => m.id === `artifact-ref-${rec.id}`);
    expect(block).toBeDefined();
    const parsed = JSON.parse(block!.rawContent!);
    expect(parsed.component).toBe("PersonaArtifactInline");
    // Inline blocks render component artifacts through the registry, so the
    // component name AND its props are embedded in the block props (the
    // registry is not persisted, so hydration re-invokes the renderer from
    // these).
    expect(parsed.props.component).toBe("MyChart");
    expect(parsed.props.componentProps).toEqual({ series: [1, 2] });
    expect(parsed.props.status).toBe("complete");
  });

  it("upsertArtifact with transcript: false injects no transcript block", () => {
    const session = new AgentWidgetSession(
      {},
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onArtifactsState: () => {}
      }
    );
    session.upsertArtifact({
      id: "pane-only",
      artifactType: "markdown",
      content: "C",
      transcript: false
    });
    expect(session.getArtifacts()).toHaveLength(1);
    expect(session.getMessages()).toHaveLength(0);
  });

  it("upsertArtifact update to an existing artifact does not duplicate the block", () => {
    const session = new AgentWidgetSession(
      {},
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onArtifactsState: () => {}
      }
    );
    session.upsertArtifact({ id: "a1", artifactType: "markdown", content: "v1" });
    session.upsertArtifact({ id: "a1", artifactType: "markdown", content: "v2" });
    const blocks = session
      .getMessages()
      .filter((m) => m.id === "artifact-ref-a1");
    expect(blocks).toHaveLength(1);
    expect(session.getArtifacts()).toHaveLength(1);
    expect(session.getArtifactById("a1")?.markdown).toBe("v2");
  });

  it("upsertArtifact re-upsert rebuilds the existing block's persisted props", () => {
    const session = new AgentWidgetSession(
      {},
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onArtifactsState: () => {}
      }
    );
    session.upsertArtifact({
      id: "a1",
      artifactType: "markdown",
      title: "T1",
      content: "v1"
    });
    session.upsertArtifact({
      id: "a1",
      artifactType: "markdown",
      title: "T2",
      content: "v2"
    });
    const blocks = session
      .getMessages()
      .filter((m) => m.id === "artifact-ref-a1");
    expect(blocks).toHaveLength(1);
    const parsed = JSON.parse(blocks[0].rawContent!);
    expect(parsed.props.markdown).toBe("v2");
    expect(parsed.props.title).toBe("T2");
  });

  it("stores file metadata via upsertArtifact", () => {
    const session = new AgentWidgetSession(
      {},
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onArtifactsState: () => {}
      }
    );
    const file = { path: "notes.md", mimeType: "text/markdown" };
    session.upsertArtifact({
      artifactType: "markdown",
      title: "notes.md",
      content: "```md\n# Hi\n\n```",
      file
    });
    expect(session.getArtifactById(session.getArtifacts()[0].id)?.file).toEqual(file);
  });

  it("uses exact media-type file rules and the producer preferredMode hint", () => {
    const session = new AgentWidgetSession(
      {
        features: {
          artifacts: {
            enabled: true,
            display: {
              default: "card",
              files: { byMediaType: { "text/html": "inline" } },
            },
          },
        },
      },
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onArtifactsState: () => {},
      }
    );
    const rec = session.upsertArtifact({
      id: "html-app",
      artifactType: "markdown",
      content: "<h1>App</h1>",
      file: { path: "app.html", mimeType: "TEXT/HTML; charset=utf-8" },
    });
    const block = session.getMessages().find((message) => message.id === `artifact-ref-${rec.id}`);
    expect(JSON.parse(block!.rawContent!).component).toBe("PersonaArtifactInline");

    const hinted = session.upsertArtifact({
      id: "hinted-doc",
      artifactType: "markdown",
      content: "# Live preview",
      presentation: { preferredMode: "inline" },
    });
    const hintedBlock = session
      .getMessages()
      .find((message) => message.id === `artifact-ref-${hinted.id}`);
    expect(JSON.parse(hintedBlock!.rawContent!).component).toBe(
      "PersonaArtifactInline"
    );
  });

  it("re-materializes existing artifact blocks after a live display update", () => {
    const onMessagesChanged = vi.fn();
    const session = new AgentWidgetSession(
      { features: { artifacts: { enabled: true, display: "card" } } },
      {
        onMessagesChanged,
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onArtifactsState: () => {},
      }
    );
    session.upsertArtifact({
      id: "live",
      artifactType: "component",
      component: "Chart",
      props: { values: [1, 2] },
    });
    session.upsertArtifact({
      id: "live-markdown",
      artifactType: "markdown",
      content: "# Report",
    });
    const unmatchedRawContent = JSON.stringify({
      component: "PersonaArtifactCard",
      props: {
        artifactId: "hydrated-without-record",
        artifactType: "markdown",
        status: "complete",
      },
    });
    session.injectAssistantMessage({
      id: "artifact-ref-hydrated-without-record",
      content: "",
      rawContent: unmatchedRawContent,
    });
    onMessagesChanged.mockClear();

    session.updateConfig({
      features: { artifacts: { enabled: true, display: "inline" } },
    });

    expect(onMessagesChanged).toHaveBeenCalledTimes(1);
    const block = session.getMessages().find((message) => message.id === "artifact-ref-live");
    const parsed = JSON.parse(block!.rawContent!);
    expect(parsed.component).toBe("PersonaArtifactInline");
    expect(parsed.props.component).toBe("Chart");
    expect(parsed.props.componentProps).toEqual({ values: [1, 2] });
    const markdownBlock = session
      .getMessages()
      .find((message) => message.id === "artifact-ref-live-markdown");
    const parsedMarkdown = JSON.parse(markdownBlock!.rawContent!);
    expect(parsedMarkdown.component).toBe("PersonaArtifactInline");
    expect(parsedMarkdown.props.markdown).toBe("# Report");
    expect(
      session
        .getMessages()
        .find(
          (message) =>
            message.id === "artifact-ref-hydrated-without-record"
        )?.rawContent
    ).toBe(unmatchedRawContent);
  });
});
