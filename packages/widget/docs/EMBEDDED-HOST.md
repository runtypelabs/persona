# Embedded host integration

These APIs work with both V4 and V5 defaults. The `future.v5Defaults` flag changes
presentation, not access to host APIs. See the [two-widget example](https://persona-chat.dev/embedded-host.html)
for a browser-local demonstration, and [theme configuration](../THEME-CONFIG.md)
for `layout.embedded` and bounded host sizing.

## Identify the source of an event

Every controller has a read-only `instanceId`. A target element's ID is used when
present; otherwise Persona generates an ID for that widget lifetime. Give each
target a unique ID. Message IDs and run IDs are separate from widget identity.

Controller subscriptions belong to that widget. Existing payloads are unchanged;
the second callback argument supplies source context for shared handlers:

```ts
const research = initAgentWidget({ target: "#research", config: { persistState: false } });
const support = initAgentWidget({ target: "#support", config: { persistState: false } });

function onMessage(message, { instanceId }) {
  console.log(instanceId, message.content);
}
const unsubscribe = research.on("assistant:message", onMessage);
support.on("assistant:message", onMessage);
unsubscribe(); // Only removes the research subscription.
```

One-argument listeners continue to work. `off(event, handler)` and the returned
unsubscribe function remove the matching listener; destruction releases the bus.
Subscriptions on the `initAgentWidget` handle survive host layout rebuilds.
Widget-origin DOM notifications include `detail.instanceId`. The installer's
pre-widget lifecycle notifications have no widget yet; `persona:chat-ready`
continues to carry the controller handle, which exposes `instanceId`.

Prefer controller methods for host actions. Existing window commands can be
targeted using `detail.instanceId`; omitting it intentionally retains the legacy
broadcast behavior:

```ts
window.dispatchEvent(new CustomEvent("persona:focusInput", {
  detail: { instanceId: research.instanceId },
}));
// Or simply: research.focusInput()
```

Instance identity does not change storage namespaces. For independent persistent
conversations, configure separate storage adapters/keys and `persistState.keyPrefix`
values. Set `persistState: false` for ephemeral widgets, as the example does.

## Observe the transcript and runs

`messages:changed` supplies the latest message array, including injections,
updates, removal, restoration, and clearing. Plain streaming-text updates are
coalesced to animation frames using the rendering pipeline; structural changes
are delivered immediately. Do not treat the callback as one notification per SSE
frame. Message objects are read-only by convention, not deep-cloned snapshots.
Read the initial state explicitly because hydration can finish before subscribing:

```ts
renderTranscriptSummary(research.getMessages());
research.on("messages:changed", (messages, context) => {
  renderTranscriptSummary(messages, context.instanceId);
});

research.on("run:started", ({ runId, timestamp }, context) => {
  console.log(context.instanceId, runId, "started", timestamp);
});
research.on("run:finished", ({ runId, outcome }, context) => {
  // outcome is "success", "error", or "cancel".
  console.log(context.instanceId, runId, outcome);
});
```

A run tracks a session text dispatch or connected SSE stream, not an individual
assistant message. Dictation submitted through the normal composer uses this same
run lifecycle. Realtime voice-provider transcript, recognition, and audio callbacks
do not independently start runs; use the existing voice events for those states.
Tool and
approval pauses and automatic reconnects retain the run ID. Retries start a new
run; cancellation, supersession, clear, and destroy finish the prior run. Injecting
or restoring messages alone does not start a run. A restored durable stream that
is explicitly resumed starts a new local run. Final pending text is flushed before
the finish notification. `assistant:complete` retains its earlier message-level
meaning; it is not a replacement for `run:finished`.

## Control composer modes and placeholders

```ts
research.setComposerModes(["concise"]);
research.setComposerModes([]);
research.update({ copy: { inputPlaceholder: "Ask a follow-up…" } });
```

`setComposerModes` accepts configured mode IDs, removes unknown IDs and duplicates,
and uses the last requested member of each single-selection group. The returned
composer state uses configuration order. This changes active selection without
rewriting initial defaults. Existing once/sticky behavior still applies on send.
An active mode's placeholder takes precedence over `copy.inputPlaceholder`.

V5 shows active modes as labeled toolbar controls without duplicate header
chips. V4 retains its mode chips; a mode group's `chipVisibility: "hidden"`
opts into the labeled control, while `"auto"` retains chips in V5. Context
mention chips remain independent of this choice.

## Own a layout slot

Use `layout.slots` rather than querying internal DOM. In addition to existing
header/body/footer slots, host integrations can use:

| Slot | Position |
| --- | --- |
| `transcript-top` | Inside the scrolling transcript, above messages, constrained to the message content width. |
| `composer-start` | In the composer's start action group. |
| `composer-end` | In the composer's end action group. |
| `composer-before-send` | Immediately before the terminal send control. |

Composer positions require the corresponding action regions in the composer;
custom composer plugins own their structure. These slots do not replace the
composer. Deprecated `messages` and `composer` slots remain unsupported.

Single-row composers adapt to the available host width and the size of their
controls, including slot content. Keep custom content responsive and provide
accessible names for interactive controls. Clicking a slot input or button
preserves its focus; clicking empty composer chrome focuses the message editor.

Legacy renderers returning an element or `null` are supported. A managed slot can
retain an element across config updates and release resources when removed:

```ts
const contextSlot = ({ signal }) => {
  const element = document.createElement("div");
  element.textContent = "Project context";
  element.addEventListener("click", showProject, { signal });
  return {
    element,
    update({ config }) { element.title = config.launcher?.title ?? "Assistant"; },
    destroy() { releaseProjectSubscription(); },
  };
};
research.update({ layout: { slots: { "transcript-top": contextSlot } } });
research.update({ layout: { slots: { "transcript-top": undefined } } });
```

Context contains `slot`, `config`, `signal`, and `defaultContent()`. A retained
managed renderer's `update` runs on widget configuration updates, not on every
stream delta. It may return an element to replace the output, `null` to restore
default content, or nothing to retain the current element. A `null` output adds
no wrapper spacing. Replacing/removing the renderer or destroying the widget
aborts its signal and calls `destroy` once. Temporary DOM detachment does not end
its lifetime. Use public events to manage live host state; a legacy element-only
renderer can own its own DOM updates or be replaced with a new renderer function.

## Own an injected component

Configured `components` are local to the widget; explicit registrations through
`componentRegistry` remain a shared fallback. Two widgets can safely configure
different renderers with the same name.

```ts
const config = {
  components: {
    Counter(props, context) {
      const element = document.createElement("button");
      let count = Number(props.count ?? 0);
      const paint = () => { element.textContent = String(count); };
      paint();
      element.addEventListener("click", () => {
        context.updateProps({ count: count + 1 });
      }, { signal: context.signal });
      return {
        element,
        update(nextProps) { count = Number(nextProps.count ?? 0); paint(); },
        destroy() { /* release non-DOM resources */ },
      };
    },
  },
};
const chat = initAgentWidget({ target: "#counter", config });
chat.injectComponentDirective({ id: "counter-1", component: "Counter", props: { count: 0 } });
chat.updateComponentProps("counter-1", { count: 5 });
chat.removeComponentMessage("counter-1");
```

Prop updates replace the complete props object, preserving the message ID and
ordering. `context.updateProps` schedules a write after the current render;
writes from an aborted renderer are ignored. Public update/remove methods return
`false` when the ID is not a supported component message. They do not mutate
ordinary text, tool, or approval messages.

Managed renderers receive updated props/context without replacing their element.
Element-only renderers are recreated when directive contents change. The render
signal aborts before `destroy` on true removal, renderer replacement, conversion
to plain text, clear, or widget destruction. Unrelated renders and temporary
detachment preserve the component. Host-rendered DOM remains the host's trust
boundary; it is not automatically sanitized as markdown.

## Route links through the host

```ts
const config = {
  onLinkClick({ url, preventDefault }) {
    const destination = new URL(url);
    if (destination.origin !== location.origin) return;
    preventDefault();
    router.navigate(destination.pathname + destination.search + destination.hash);
  },
};
```

The hook sees the resolved URL, anchor, original mouse event, and `preventDefault`.
Call `preventDefault()` synchronously to take ownership; otherwise the browser
keeps its default behavior. Only ordinary primary/keyboard activation of self
links is routed. Modified clicks, middle clicks, downloads, non-self targets, and
unsafe URL schemes are left out. Relative links and fragments resolve against the
document base URL. Existing markdown sanitization remains in place. Nested widget
links belong to their own instance.
