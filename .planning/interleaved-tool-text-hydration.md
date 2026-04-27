# Interleaved Tool/Text — Hydration on Reload

## Problem

During **live streaming**, the widget now splits assistant messages at tool boundaries
using `partId`, rendering preamble → tool → follow-up in order. But on **page reload**,
the conversation is loaded from the server record which stores a single assistant message
with concatenated text + a flat `toolInvocations` array. The interleaved ordering is lost.

---

## Option 1: Store segmented messages server-side

Store each text segment and tool invocation as separate entries in the conversation
record, preserving the interleaved order.

### Server changes (`/v1/client/chat` in `client.ts`)

- Instead of accumulating `assistantResponse += textContent` into one string,
  track an ordered `parts` array:
  ```
  parts: [
    { type: "text", id: "ast_abc", partId: "text_0", content: "Let me search..." },
    { type: "tool", toolCallId: "tc_1", toolName: "search", args: {...}, result: {...} },
    { type: "text", id: "ast_abc_text_1", partId: "text_1", content: "Found it!..." },
  ]
  ```
- Store `parts` on the assistant message in `updateConversationMessages()`
- Keep `content` as the full concatenated text for backward compatibility / search

### Widget changes (Persona)

- On hydration, if a message has `parts`, render each part as its own bubble
  (text segments as assistant messages, tool parts as tool bubbles)
- Fall back to current behavior (single bubble + `toolInvocations`) when `parts` is absent

### Pros
- Clean data model — aligns with Anthropic content blocks / AI SDK parts
- Widget hydration is straightforward: iterate `parts` in order
- Full fidelity on reload — identical to live streaming experience
- `toolInvocations` can eventually be deprecated in favor of `parts`

### Cons
- **Breaking storage schema change** — existing conversation records don't have `parts`
- Requires migration strategy or dual-write (keep both `content`/`toolInvocations` AND `parts`)
- More data stored per message (though tool results are already stored in `toolInvocations`)
- Server needs to track `text_start`/`text_end`/`partId` events during streaming
  (currently it only tracks `step_delta` text and `tool_start`/`tool_complete`)

### Estimated scope
- **Server**: ~50-80 lines in `client.ts` stream handler + schema addition
- **Widget**: ~30-50 lines in session hydration / message loading
- **Shared types**: Add `MessagePart` type to `@runtypelabs/shared`
- **Migration**: None required if `parts` is optional and hydration falls back gracefully

---

## Option 2: Store segment markers alongside the existing message

Keep the single `content` string + `toolInvocations` array, but add a `segments`
metadata field that describes how to re-split the content on hydration.

### Server changes

- Track text segment boundaries during streaming:
  ```
  segments: [
    { type: "text", partId: "text_0", offset: 0, length: 22 },
    { type: "tool", toolCallId: "tc_1" },
    { type: "text", partId: "text_1", offset: 22, length: 32 },
  ]
  ```
- Store `segments` on the assistant message alongside `content` and `toolInvocations`

### Widget changes

- On hydration, if `segments` is present, use offsets to slice `content` into
  separate text bubbles and interleave with tool bubbles from `toolInvocations`
- Fall back to current behavior when `segments` is absent

### Pros
- Smaller change — additive field, no schema migration
- `content` remains the full text (backward compatible for search, export, etc.)
- Doesn't duplicate tool data (tools are still in `toolInvocations`)

### Cons
- **Fragile** — offset-based slicing breaks if content is modified (e.g. post-processing,
  sanitization, or if the server trims/normalizes whitespace)
- More complex hydration logic (offset math vs. iterating typed parts)
- Two sources of truth for tool ordering (`segments` order vs. `toolInvocations` array order)
- Still coupled to the `toolInvocations` format which may be deprecated

### Estimated scope
- **Server**: ~30-40 lines to track segment offsets during streaming
- **Widget**: ~40-60 lines for offset-based re-splitting (more complex than Option 1)
- **Shared types**: Add `SegmentMarker` type

---

## Recommendation

**Option 1** is the better long-term choice. It's cleaner, more robust, and aligns with
industry conventions (Anthropic content blocks, AI SDK parts, OpenAI output items).
The `parts` field is additive — existing records without it hydrate with current behavior,
so no migration is needed.

Option 2 is a patch that creates technical debt (offset fragility, dual ordering) without
meaningfully reducing scope.

### Suggested implementation order

1. **Ship the current widget change** (live streaming interleaving) — already done
2. **Add `parts` to the server storage** in a follow-up PR
3. **Add `parts`-based hydration** to the widget
4. **Deprecate `toolInvocations`** on the message type once `parts` is fully adopted
