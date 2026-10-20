# Embedded host integration

These APIs work with both V4 and V5 defaults. The `future.v5Defaults` flag changes
presentation, not access to host APIs. See the
[two-widget example](https://persona-chat.dev/embedded-host.html) for a browser-local
demonstration of independent widgets, conversation switching, and relocation, and
[theme configuration](../THEME-CONFIG.md) for `layout.embedded` and bounded host
sizing.

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

## Move a live widget between containers

`initAgentWidget()` handles expose `moveTo(target, { preserveFocus?: boolean })`.
The target is a selector or an `HTMLElement`. Relocation preserves the handle,
generated `host`, mount, optional ShadowRoot, `instanceId`, session, active
stream, draft, mentions, attachments, dictation, and renderer/subscription
lifetimes. It does not invoke configuration updates or remount renderers.

```ts
const chat = initAgentWidget({
  target: "#sidebar-chat",
  config: { launcher: { enabled: false }, layout: { embedded: true } },
});
// Both containers must already be connected to this document's light DOM.
chat.moveTo("#modal-chat");
chat.moveTo(document.querySelector<HTMLElement>("#sidebar-chat")!);
```

This works with both V4 and V5 defaults and keeps the current Persona
presentation. The host application owns container dimensions, visibility,
modal/dialog semantics, focus trapping, and returning focus to the opener.
Open/show a modal destination before moving into it; a hidden or inert container
cannot retain interactive focus. Give embedded containers a bounded height and
a shrinkable flex chain, as described in [theme configuration](../THEME-CONFIG.md).
When returning from a modal, move the widget **before** hiding or closing the
modal so its visible transcript position can still be measured. Use
`preserveFocus: false` for that move, then close the dialog to restore its opener.

`preserveFocus` defaults to `true`: widget-owned focus and text selection are
restored without scrolling the page. Focus outside the widget is left alone.
With `false`, Persona skips restoration; it does not force a blur, and a native
move may retain focus. Follow mode stays following; paused readers keep their
visible-message position across reflow (with scrollTop as a fallback). Open
Persona popovers and tooltips are repositioned for the new host.

Only direct layouts can move. Docked layouts wrap page content rather than
simply parenting the widget and are rejected. Destinations in another document,
ShadowRoot, or detached subtree, and destinations within the generated host,
are rejected before mutation. Moving a destroyed handle also throws. The
current target is a no-op. Subsequent `update()` and `destroy()` use the new
target; changing docked/composer-bar mount modes still follows the existing
layout-rebuild lifecycle and is not state-preserving relocation.

Where supported, Persona uses the browser's
[`Element.moveBefore()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore)
to preserve native DOM state. Other browsers reparent with `appendChild()`:
Persona's state and DOM identities survive, but iframes can reload, custom
elements can receive disconnect/connect callbacks, and browser animation or
native popover state can reset. Custom elements need `connectedMoveCallback()`
to opt into native move lifecycle behavior. Plugin-owned overlays should manage
their own positioning on host changes. Test iframe-based artifacts and custom
elements in each supported browser before relying on their browser-owned state.

## Switch conversations inside one widget

Use the existing history API with an enabled history provider. A custom backend
can supply `features.history.provider`; the built-in provider uses client token
mode. Keep one controller mounted and open conversations by ID:

```ts
const chat = initAgentWidget({
  target: "#chat",
  config: {
    launcher: { enabled: false },
    layout: { embedded: true },
    features: { history: { enabled: true, provider: myHistoryProvider } },
  },
});

await chat.openConversation("project-brief");
// The visitor writes an unsent draft, attaches a file, and scrolls up.
await chat.openConversation("release-notes");
// This conversation starts with its own composer state.
await chat.openConversation("project-brief", { focus: true });
// The brief's unsent composer state and reading position return.
```

Persona retains each visited conversation's unsent text, structured mentions,
quote context, attachments, selected model, and active composer modes for this
widget's lifetime. Attachment preparation continues for its originating
conversation; completing an upload while another conversation is visible does
not place that file in the other composer. A first visit starts with configured
composer defaults. Dictation stops at successful activation; reviewed text stays
with the conversation it came from. A successful open preserves the controller,
instance identity, host slots, and subscriptions. Transcript renderers follow
normal removal and mounting lifecycles as the transcript changes.

Readers who scrolled away from the bottom return to their visible message when
it remains loaded, with a scroll offset fallback. Conversations that followed
new messages keep following. Provider transcripts are fetched again on reopen;
the provider owns durable message history, while Persona owns this temporary
composer and reading state. `persistState: false` still supports continuity.
The per-conversation cache is memory-only and ends on page reload or widget
destruction. Existing persistence of the active draft still applies when enabled;
it does not persist the full per-conversation cache. `moveTo()` can relocate the
same widget between conversation switches. Reopening the already active ID also
refreshes its transcript and keeps its draft.

`startNewConversation()` initializes a fresh composer and retains the prior
conversation's cached draft for reopening. Deleting a conversation discards that
conversation's cached state. Clearing history, resetting identity, or replacing
the history provider/identity discards the cache; drafts do not cross those
boundaries.

Switching while a dispatch, tool/approval pause, or message preparation is active
rejects by default with `error.code === "conversation_busy"`. The active
conversation keeps running. A host can deliberately stop it before switching:

```ts
try {
  await chat.openConversation("release-notes");
} catch (error) {
  if (error && typeof error === "object" &&
      "code" in error && error.code === "conversation_busy") {
    showStopAndSwitchAction(async () => {
      await chat.openConversation("release-notes", { busy: "stop", focus: true });
    });
  }
}
```

The second argument accepts `busy: "reject" | "stop" | "background"` and `focus?: boolean`.
`focus` defaults to false. `"stop"` cancels current work; it does not run that
conversation in the background. An open that fails or is superseded before its
provider commit preserves the source transcript and draft. Once a provider's
asynchronous commit has begun, that activation finishes coherently before a
newer selection commits; its draft remains scoped to that conversation. A newer
selection suppresses stale public open notifications. If the host chose `"stop"`,
cancellation remains effective even if loading fails. Keep host navigation
selection tied to `getActiveConversationId()` after the
promise settles, including failures, so the selected row reflects the actual
active conversation.

`"background"` is opt-in: configure `backgroundConversations` with a backend
adapter that guarantees durable execution and read-only event replay. Persona
then detaches the browser stream and retains its partial transcript and matching
event cursor. Reopening that conversation restores the saved transcript before
replaying missed events; it does not start a second execution. The optional
`conversation:executionState` event lets a host show running, needs-attention,
completed, or failed states in its own conversation list. Detached completion
updates require the adapter's status subscription. See
[durable reconnect](../../../docs/durable-reconnect.md) for the adapter contract
and lifecycle limitations. Existing reconnect integrations do not opt in
automatically.

The [embedded host example](https://persona-chat.dev/embedded-host.html) seeds
Project brief and Release notes in a separate local provider for each assistant.
Choose a conversation first, write a draft, attach a text file, and scroll up;
switch away and return. The initial playground before any conversation is
opened is not a named history conversation. The page also supports busy
switching, a failed-open test control, and moving the same widget to its modal.
Choose **Continue in background**, send a message in Project brief, and switch
to Release notes to test a simulated durable task. Its completion status updates
while you are away; return to catch up on the reply. This local simulation keeps
working after a reader disconnects, but ends when the page or widgets restart.
History opens simulate a short loading delay. All history and replies stay in
browser memory; changing defaults restarts the widgets and resets the
demonstration.

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
