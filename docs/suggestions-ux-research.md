# Suggestions UX: research and recommendation (July 2026)

Research and product direction for improving prompt starters, conversational
follow-ups, and quick replies in Persona.

## Decision

Evolve Persona from a single suggestion-chip surface into a small, coherent
suggestion system with three distinct interaction types:

1. **Prompt starters** help users discover capabilities before the first message.
2. **Follow-up suggestions** offer optional next turns after an assistant answer.
3. **Required choices** collect an answer needed to continue a workflow.

Persona already has the behavioral foundations for all three:

- `suggestionChips` provides static starters before the first user message.
- `suggest_replies` provides optional, model-pushed follow-ups.
- `ask_user_question` provides blocking choices and optional free text.

The recommendation is to preserve those lifecycle distinctions while giving
starters and follow-ups richer content models, purpose-built layouts, semantic
theme tokens, and send-or-edit behavior. Required choices should remain in
`ask_user_question`; they should not be folded into generic suggestions.

The highest-value first release is:

- a backward-compatible suggestion item object with separate display and prompt
  text;
- starter cards in the welcome surface;
- compact follow-up pills associated with the latest assistant turn;
- `send` and `fill` selection modes;
- first-class component tokens and interaction states; and
- unified impression and selection events.

## Research method and evidence limits

There is no credible public ranking of the "most loved" suggestion interfaces,
and large AI products generally do not publish suggestion click-through,
satisfaction, or task-completion data. This recommendation therefore uses three
forms of evidence:

1. **Convergent product patterns** across OpenAI ChatKit, Microsoft 365 Copilot,
   Intercom, Google conversational design, assistant-ui, and CopilotKit.
2. **Mature design-system guidance** from Material, Carbon, Apple, and WCAG.
3. **Early empirical evidence** from a 2026 prompt-recommendation user study.

Product documentation is stronger evidence for supported implementation
contracts than for user preference. Design-system guidance is stronger evidence
for component behavior and accessibility than for chat-specific placement. The
PromptHelper study is directly relevant to follow-up suggestions, but it is a
small preprint study with 32 participants and should be treated as encouraging,
not conclusive.

Two cited conversational systems have been retired or archived:

- Actions on Google has been sunset, but its conversation-design guidance
  remains one of the clearest published treatments of conversational chips.
- Microsoft Bot Framework SDK v4 is archived, but its stale-action lifecycle
  remains a useful interaction precedent.

## Suggestion taxonomy

Treating every short button as a "chip" hides meaningful differences in user
intent, lifecycle, placement, and accessibility.

| Type | User need | Lifecycle | Typical selection | Persona primitive |
| --- | --- | --- | --- | --- |
| Prompt starter | "What can this assistant do?" | Empty/new thread only | Send or fill composer | `suggestionChips` |
| Follow-up suggestion | "What could I do next?" | Latest completed assistant turn | Send or fill composer | `suggest_replies` |
| Required choice | "Which answer lets this task continue?" | Until answered or cancelled | Resolve awaited tool | `ask_user_question` |
| Action | "Perform an operation without pretending I typed it" | Context-dependent | Client/server action | Existing action/component systems |
| Prompt library | "Find a reusable prompt from a large catalog" | Available on demand | Fill composer | Not currently first-class |
| Composer typeahead | "Complete the prompt I already started" | While typing | Fill composer | Not currently first-class |

The first three belong in the core suggestions UX. Actions should use Persona's
action primitives rather than being encoded as fake user messages. Prompt
libraries and typeahead are useful future surfaces for complex enterprise
agents, but they are not necessary for the initial improvement.

## Industry patterns

### 1. Empty-state starter cards

The dominant onboarding pattern is a small set of examples integrated with the
welcome state rather than a dense row permanently attached to the composer.

OpenAI ChatKit defines start-screen prompts with:

- an optional icon;
- a human-readable label; and
- separate message content submitted when selected.

Its theme contract applies color scheme, density, radius, and typography to the
whole interface. This is important: starters participate in the product's
design system instead of exposing an isolated collection of chip-only style
properties.

Sources:

- [OpenAI ChatKit customization](https://openai.github.io/chatkit-js/customize/)
- [OpenAI `StartScreenPrompt`](https://openai.github.io/chatkit-js/api/openai/chatkit/type-aliases/startscreenprompt/)
- [OpenAI `ThemeOption`](https://openai.github.io/chatkit-js/api/openai/chatkit/type-aliases/themeoption/)

assistant-ui similarly supports:

- simple string suggestions;
- title, description, and prompt objects;
- a two-column welcome grid;
- customization through rendering primitives; and
- either populating the composer or immediately sending.

It recommends three to six starter suggestions, with concise, actionable,
capability-spanning content. A narrow embedded widget should use the lower end
of that range; three or four is a better Persona default.

Source:

- [assistant-ui suggested prompts](https://www.assistant-ui.com/docs/guides/suggestions)

Microsoft Copilot Studio supports up to ten configured starters on an agent
welcome page, but Microsoft 365's organizational-prompt experience pins only
four high-priority prompts to the primary suggested surface. The rest live in a
searchable gallery. This supports a useful division: keep the home set small
and treat a large catalog as a separate product surface.

Sources:

- [Microsoft Copilot Studio suggested prompts](https://learn.microsoft.com/en-us/microsoft-copilot-studio/configure-starter-prompts)
- [Microsoft 365 organizational prompts](https://learn.microsoft.com/en-us/microsoft-365/copilot/organizational-prompts)

#### Implication for Persona

Move static starters into the welcome surface and support a richer card
presentation. A starter should be able to show a concise label while sending
or drafting a more complete prompt.

### 2. Compact contextual follow-ups

Follow-ups are more ephemeral and should consume less visual weight than
starters. The recurring pattern is two to four neutral pills shown only after a
completed assistant answer.

assistant-ui explicitly separates static welcome suggestions from runtime
follow-ups. Runtime suggestions:

- are stored separately from static starters;
- can be produced by an adapter after an assistant run;
- clear when a new run begins;
- support cancellation of in-flight generation; and
- commonly render in a single-line pill layout.

CopilotKit makes the suggestion lifecycle explicit through:

- static or dynamically generated suggestions;
- `before-first-message`, `after-first-message`, `always`, and `disabled`
  availability;
- minimum and maximum counts;
- regeneration when application-state dependencies change; and
- loading, reload, and clear state.

Sources:

- [assistant-ui runtime suggestions](https://www.assistant-ui.com/docs/guides/suggestions)
- [CopilotKit `useConfigureSuggestions`](https://docs.copilotkit.ai/reference/hooks/useConfigureSuggestions)
- [CopilotKit `useSuggestions`](https://docs.copilotkit.ai/reference/v2/hooks/useSuggestions)

Google's conversation-design guidance describes chips as ways to:

- refine a topic;
- discover related topics, next steps, or pivots; and
- take action.

It recommends conversational, relevant, action-oriented, concise, consistent
labels with clear outcomes. It also recommends covering meaningfully different
directions instead of clustering around one topic, and avoiding duplicates of
choices already visible in a list or carousel.

Source:

- [Google conversational chip guidance](https://developers.google.com/assistant/conversation-design/chips)

#### Implication for Persona

Keep follow-ups optional, compact, latest-turn-scoped, and visually connected
to the answer that produced them. Do not render them as the same roomy cards
used for onboarding.

### 3. Ephemeral quick replies for deterministic decisions

Quick replies that answer a clear question behave differently from optional
follow-up prompts.

Microsoft's suggested-action pane removes actions after a selection. Its
stated reason is to prevent stale buttons from being selected later in the
conversation and to avoid making the bot handle obsolete choices.

Intercom uses reply buttons to triage users into support, feature request, and
bug-report paths. Its guidance emphasizes:

- introduce the choices with a clear question;
- do not attempt to cover every possible scenario; and
- retain a composer fallback when none of the choices apply.

Sources:

- [Microsoft suggested actions](https://learn.microsoft.com/en-us/azure/bot-service/bot-builder-howto-add-suggested-actions?view=azure-bot-service-4.0)
- [Intercom workflow reply buttons](https://www.intercom.com/help/en/articles/4134615)

#### Implication for Persona

Continue using `ask_user_question` for awaited decisions. Its answer sheet can
share lower-level visual tokens with suggestions, but it should retain its own
semantics, state machine, and accessibility labeling.

### 4. Editable prompts preserve agency

Immediate send is efficient for short, unambiguous follow-ups. It is less
appropriate for a long starter, a reusable organizational prompt, or a
suggestion that may need user-specific details.

assistant-ui supports both populating and immediately sending. Microsoft
Prompt Lab inserts a selected prompt into the composer without submitting it,
allowing the user to review and modify it first. Microsoft also separates:

- a short title;
- a display prompt used on pills, cards, and autosuggestions; and
- the full prompt text.

The PromptHelper research prototype displayed a concise intent label plus a
full prompt that could be copied and modified. In a within-subject study of 32
participants, contextual and semantically diverse follow-up recommendations
increased perceived exploration and expressiveness without increasing
cognitive workload.

Sources:

- [Microsoft 365 organizational prompts](https://learn.microsoft.com/en-us/microsoft-365/copilot/organizational-prompts)
- [assistant-ui suggested prompts](https://www.assistant-ui.com/docs/guides/suggestions)
- [PromptHelper preprint](https://arxiv.org/abs/2601.15575)

#### Implication for Persona

Add a per-item `send` or `fill` selection mode and decouple visible copy from
submitted prompt content. Default short follow-ups to `send`; allow complex
starters to opt into `fill`.

### 5. Prompt galleries and typeahead serve the long tail

Microsoft 365 uses three levels of discovery:

1. up to four pinned prompts on the suggested home surface;
2. a searchable and filterable prompt gallery; and
3. matching typeahead suggestions as the user writes.

It also exposes per-prompt submissions and active-user analytics so
administrators can replace low-adoption prompts and promote strong ones.

Source:

- [Microsoft 365 organizational prompts](https://learn.microsoft.com/en-us/microsoft-365/copilot/organizational-prompts)

#### Implication for Persona

Do not force a prompt catalog into the chip row. If Persona later supports
large prompt sets, build a separate prompt-gallery or composer-command
experience and reuse the same suggestion item model.

## Content guidance

### Count

Use three suggestions by default and cap the normal embedded-widget experience
at four.

- Three gives enough breadth to communicate capability without dominating the
  conversation.
- Four matches Persona's current `suggest_replies` cap.
- Larger sets should use horizontal overflow, a gallery, or another selection
  component rather than creating many wrapped lines.

Google allowed up to eight chips and assistant-ui recommends three to six, but
those upper bounds target broader surfaces. Persona's common floating and
docked layouts are substantially narrower.

### Length

Keep visible labels to a short phrase, ideally under approximately 25
characters when the language permits. Do not impose that limit on the
submitted prompt.

Carbon recommends concise tag titles, under 20 characters where possible, and
discourages multiline wrapping because it damages the compact shape and group
alignment. Google specified a 25-character chip limit in its product.

Source:

- [Carbon tag usage](https://carbondesignsystem.com/components/tag/usage/)

### Voice

Use direct, outcome-oriented labels:

- "Compare plans"
- "Explain the tradeoff"
- "Draft a response"
- "Show an example"

Avoid:

- vague continuations such as "More";
- command-training language such as "Say pricing";
- model-centered language such as "Have the AI...";
- several paraphrases of the same next step; and
- labels whose destination or side effect is unclear.

Persona's current `suggest_replies` tool instructs the model to phrase every
suggestion in the user's voice. That remains appropriate for a suggestion that
is sent verbatim. Once label and prompt are separate, the visible label can be
shorter and more action-oriented while the prompt remains natural first-person
user input.

### Diversity

A useful three-item set should cover different intents, for example:

1. **Deepen:** ask for more detail or rationale.
2. **Transform:** turn the answer into a draft, table, plan, or other artifact.
3. **Act or verify:** take a next action, check assumptions, or inspect evidence.

The exact categories should be contextual. Diversity is more valuable than
minor wording variation.

### Ordering and emphasis

Put the most likely or highest-value suggestion first. Keep all suggestions at
equal visual weight by default.

Use a primary treatment only when there is a real primary next action, not
merely the model's first guess. Strong visual emphasis can turn an optional
suggestion into an implicit recommendation and reduce user agency.

### Free-form escape

The composer must remain available whenever suggestions are optional. Required
choice flows may constrain input only when the workflow explicitly demands it
and communicates why.

## Current Persona behavior

### What is already strong

The existing implementation has several sound lifecycle choices:

- Static suggestions disappear after the first user message.
- Agent-pushed suggestions use a latest-wins rule.
- A typed, voice, or suggested user message dismisses prior follow-ups.
- Agent suggestions restore correctly from hydrated message history.
- Suggestions are disabled while the session is streaming.
- `suggest_replies` is fire-and-forget, so showing optional follow-ups does not
  park the agent run.
- Agent-pushed rows emit `persona:suggestReplies:shown` and
  `persona:suggestReplies:selected`.

Relevant source:

- `packages/widget/src/suggest-replies-tool.ts`
- `packages/widget/src/components/suggestions.ts`
- `packages/widget/src/ui.ts`

These semantics should be preserved while the data model and renderer evolve.

### Current limitations

#### One data shape

Both configured starters and agent follow-ups are reduced to `string[]`.
Visible and submitted text must be identical. Items cannot provide:

- stable ids;
- descriptions;
- icons;
- separate prompt content;
- send-versus-fill behavior;
- emphasis;
- disabled state; or
- custom action metadata.

#### One renderer for different jobs

Static starters and agent-pushed follow-ups share the same button renderer and
composer-adjacent container. This prevents:

- roomy starter cards in the welcome state;
- compact follow-up pills after an answer; and
- surface-specific theming.

#### Limited layout

The row always uses a wrapping flex layout with an 8px gap. It has no supported
configuration for:

- grid, row, or stack layout;
- horizontal overflow;
- alignment;
- maximum visible rows;
- responsive placement; or
- an overflow affordance.

#### Limited theming

`AgentWidgetSuggestionChipsConfig` exposes only:

- `fontFamily`;
- `fontWeight`;
- `paddingX`; and
- `paddingY`.

The default button otherwise uses generic surface, primary-text, border, and
button-radius utilities. There are no suggestion-specific semantic tokens for:

- default, hover, pressed, focus, or disabled state;
- starter versus follow-up variants;
- title and description typography;
- icon color and size;
- minimum target height;
- group spacing; or
- entrance motion.

The theme editor currently exposes the suggestion text list but no visual
suggestion controls.

#### Immediate send only

Every selection clears the textarea and sends immediately. This is efficient
for terse follow-ups but does not support editable or parameterized starter
prompts.

#### Placement

Suggestions live above the composer. This is convenient and keeps them outside
the scrolling transcript, especially in pill-composer mode, but weakens the
association between a contextual follow-up and the assistant response that
generated it.

#### Accessibility gaps

The current default combines a 16px line box with 6px vertical padding, for an
approximately 28px visible height.

- It clears WCAG 2.2's 24 by 24 CSS pixel Level AA minimum.
- It is below Apple's general 44 by 44 point hit-region recommendation and the
  48dp Android convention.
- It has no dedicated suggestion focus treatment.
- A multiline wrapped row can create dense adjacent targets on narrow screens.

Sources:

- [WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [WCAG focus appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance)
- [Apple button guidance](https://developer.apple.com/design/human-interface-guidelines/buttons)
- [Android accessibility touch targets](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)

## Recommended public model

### Suggestion item

Introduce a richer item while preserving string shorthand:

```ts
export type AgentWidgetSuggestion =
  | string
  | {
      /**
       * Stable analytics and reconciliation key.
       * A deterministic fallback may be derived when omitted.
       */
      id?: string;

      /** Concise text displayed in the UI. */
      label: string;

      /**
       * Message content sent or placed in the composer.
       * Defaults to `label`.
       */
      prompt?: string;

      /** Optional supporting copy used by card or list presentations. */
      description?: string;

      /** Optional decorative icon from Persona's supported icon set. */
      icon?: IconName;

      /**
       * "send": immediately send the prompt.
       * "fill": place the prompt in the composer for review/editing.
       */
      selection?: "send" | "fill";

      /**
       * Visual importance only. Use "primary" sparingly for a true primary
       * next action.
       */
      emphasis?: "default" | "primary";
    };
```

Strings normalize to:

```ts
{
  label: value,
  prompt: value,
  selection: "send",
  emphasis: "default",
}
```

This preserves all existing integrations.

### Surface configuration

Add a structured configuration while retaining `suggestionChips` and
`suggestionChipsConfig` as compatibility aliases:

```ts
export type AgentWidgetSuggestionsConfig = {
  starters?: {
    items?: AgentWidgetSuggestion[];
    variant?: "card" | "chip" | "list";
    placement?: "welcome" | "composer";
    selection?: "send" | "fill";
    maxItems?: number;
  };

  followUps?: {
    variant?: "chip" | "card" | "list";
    placement?: "auto" | "after-message" | "composer";
    selection?: "send" | "fill";
    overflow?: "scroll" | "wrap";
    maxItems?: number;
  };
};
```

Recommended defaults:

```ts
suggestions: {
  starters: {
    variant: "card",
    placement: "welcome",
    selection: "send",
    maxItems: 4,
  },
  followUps: {
    variant: "chip",
    placement: "auto",
    selection: "send",
    overflow: "scroll",
    maxItems: 4,
  },
}
```

Compatibility mapping:

```ts
suggestionChips
  -> suggestions.starters.items

suggestionChipsConfig
  -> compatibility overrides over the resolved starter/follow-up tokens
```

Do not remove the existing fields in the first release. Document the structured
API as preferred and schedule removals, if any, for a future major version.

### `suggest_replies` payload

Continue accepting the current string payload:

```json
{
  "suggestions": [
    "Tell me more about pricing",
    "Compare the plans"
  ]
}
```

Extend parsing to accept richer items:

```json
{
  "suggestions": [
    {
      "label": "Compare plans",
      "prompt": "Compare the available plans and explain which is best for a small team."
    },
    {
      "label": "Estimate cost",
      "prompt": "Estimate my monthly cost for 12 users."
    }
  ]
}
```

The parser should:

- accept strings and valid objects in the same array;
- trim labels and prompts;
- drop malformed or empty items;
- deduplicate by normalized prompt;
- enforce the four-item cap;
- enforce a concise label limit independently of prompt length; and
- default missing prompt text to the label.

For compatibility with server-declared runtime tools, either:

1. leave the exported v1 schema unchanged and export an opt-in v2 schema; or
2. use a schema union only after verifying every supported tool consumer
   accepts `oneOf`.

The first option is safer for a patch/minor release.

### Actions are not prompts

Do not extend the item model with arbitrary URLs or opaque callbacks in the
first release. A suggestion represents a possible user utterance. An operation
such as opening a page, purchasing an item, granting approval, or invoking a
tool should use Persona's action and component systems so the transcript does
not falsely claim that the user typed a message.

If a later release unifies the visual primitive, preserve separate semantic
types for prompts and actions.

## Recommended layouts

### Starter cards

Default desktop/tablet treatment:

- integrated with the welcome card or empty transcript;
- two-column grid when each card can retain a useful width;
- one-column stack in narrow widgets;
- 8–12px gap;
- optional 16–20px leading icon;
- one-line title;
- optional one-line description;
- neutral surface and border;
- subtle hover fill and pressed feedback; and
- 44px minimum hit region.

Do not center long card copy. Left-aligned labels and descriptions scan better
and work more reliably across localization and RTL.

### Follow-up pills

Default treatment:

- two to four items;
- a single horizontal row;
- shown only after the assistant turn is complete;
- positioned immediately after the latest assistant message when the transcript
  layout has room;
- positioned above the composer for compact pill-composer surfaces;
- neutral outlined appearance with equal visual weight;
- one-line labels;
- horizontal scrolling when needed;
- edge fade or a partially visible next item to communicate overflow; and
- no visible scrollbar unless required by the platform or user settings.

`placement: "auto"` should choose:

| Surface | Default follow-up placement |
| --- | --- |
| Inline/full panel | After latest assistant turn |
| Detached/docked panel | After latest assistant turn |
| Expanded pill composer | Above composer |
| Collapsed pill composer | Hidden |
| Very short transcript viewport | Above composer |

This preserves the current pill-composer invariant while improving contextual
association in normal transcript layouts.

### Wrapping fallback

Support `overflow: "wrap"` for brands and accessibility contexts that prefer
all options visible.

When wrapping:

- cap normal display at two rows;
- retain at least 8px between targets;
- switch long sets to a list or gallery rather than five or more rows; and
- avoid varying multiline chip heights.

Carbon recommends horizontal alignment for small groups and wrapping when the
group no longer fits, while discouraging excessive wrapped lines.

Source:

- [Carbon tag usage](https://carbondesignsystem.com/components/tag/usage/)

## Theme recommendation

Suggestion appearance should join Persona's semantic theme system rather than
accumulate more inline properties.

### Component tokens

Add optional suggestion tokens:

```ts
export interface SuggestionVariantTokens extends ComponentTokenSet {
  minHeight?: string;
  gap?: string;
  iconSize?: string;

  hover?: {
    background?: TokenReference<"color">;
    foreground?: TokenReference<"color">;
    border?: TokenReference<"color">;
  };

  pressed?: {
    background?: TokenReference<"color">;
    foreground?: TokenReference<"color">;
    border?: TokenReference<"color">;
  };

  focus?: {
    ring?: TokenReference<"color">;
  };

  disabled?: {
    opacity?: number;
  };

  title?: {
    fontFamily?: TokenReference<"typography">;
    fontSize?: TokenReference<"typography">;
    fontWeight?: TokenReference<"typography">;
    lineHeight?: TokenReference<"typography">;
  };

  description?: {
    foreground?: TokenReference<"color">;
    fontSize?: TokenReference<"typography">;
    lineHeight?: TokenReference<"typography">;
  };
}

export interface SuggestionTokens {
  starter?: SuggestionVariantTokens;
  followUp?: SuggestionVariantTokens;
  primary?: SuggestionVariantTokens;
  group?: {
    gap?: string;
  };
}
```

Expose this as:

```ts
theme: {
  components: {
    suggestion: {
      starter: { ... },
      followUp: { ... },
      primary: { ... },
      group: { ... },
    },
  },
}
```

### Default token intent

Starter cards:

- background: semantic surface;
- foreground: semantic text;
- border: semantic border;
- description: semantic muted text;
- radius: large or extra-large;
- shadow: none;
- hover: subtle container tint; and
- focus: semantic interactive focus.

Follow-up pills:

- background: transparent or semantic surface;
- foreground: semantic text;
- border: semantic border;
- radius: full;
- shadow: none;
- hover: semantic container;
- pressed: slightly stronger container; and
- focus: semantic interactive focus.

Primary suggestions:

- derive from `components.button.primary`;
- retain accessible text contrast; and
- remain opt-in.

### Inheritance and overrides

Suggestion tokens should inherit:

- palette and semantic colors;
- semantic typography;
- global color scheme and `darkTheme`;
- global radius choices where possible;
- density; and
- reduced-motion preferences.

The structured suggestion config should control content, placement, layout, and
selection behavior. Theme tokens should control appearance. Avoid duplicating
color, border, radius, and typography fields in both places.

### Theme editor

Expand the existing Suggestions section with:

- starter content editor supporting label, prompt, description, and icon;
- starter variant and placement;
- follow-up variant, placement, and overflow;
- send-versus-fill default;
- live empty-state and post-answer preview scenes; and
- component-token controls for the common starter and follow-up appearance.

Keep advanced state-token editing in the raw theme editor if the main UI would
become too dense.

## Interaction and state behavior

### Starter visibility

Show starters when:

- the thread contains no user message;
- the widget is not streaming;
- the starter list is non-empty; and
- the active layout has a visible welcome or composer surface.

Hide starters after any user message, matching current behavior.

### Follow-up visibility

Show the latest valid follow-up set when:

- the feature is enabled;
- the originating assistant turn is complete;
- no later user message exists;
- no newer valid follow-up set supersedes it; and
- the session is not currently starting or streaming a new turn.

The current latest-wins and persisted-resolution rules should remain the source
of truth.

### Selection

For `selection: "send"`:

1. dispatch the unified selected event;
2. disable the visible set immediately;
3. send `prompt ?? label`;
4. let the new user message remove the set through derived state; and
5. avoid double submission on rapid tap or keyboard activation.

For `selection: "fill"`:

1. dispatch the unified selected event with `selection: "fill"`;
2. write `prompt ?? label` into the composer;
3. focus the composer;
4. place the caret at the end;
5. keep the draft editable; and
6. dismiss or retain the set according to a documented default.

Recommended default: dismiss the selected set after fill. The user can still
undo or edit the draft without a stale group competing for attention.

### Streaming

Do not show partially generated follow-ups one at a time by default. Wait until
the assistant answer and suggestion set are settled, then reveal the group as a
unit. This avoids layout jitter and premature selection.

If a future adapter generates suggestions separately:

- support an optional skeleton;
- cancel generation when a new user turn begins;
- do not block composer input; and
- discard results whose source turn is no longer current.

### Motion

Use restrained motion:

- 120–180ms opacity plus 2–4px translate entrance;
- a short pressed response;
- no bouncing or stagger that slows interaction; and
- no motion under `prefers-reduced-motion: reduce`.

Reserve sufficient space or position the group carefully so its entrance does
not cause a large transcript jump.

## Accessibility requirements

### Semantics

- Render each suggestion as a native `<button type="button">`.
- Use normal Tab navigation and native Enter/Space activation.
- Do not use `role="listbox"` unless the interaction actually has listbox
  selection semantics.
- Group optional follow-ups under an accessible label such as "Suggested next
  messages."
- Associate required choices with their question through
  `aria-labelledby`/`aria-describedby` in `ask_user_question`.

### Target size

- Meet WCAG 2.2 Level AA's 24 by 24 CSS pixel minimum in all modes.
- Target 36–40px visible height on pointer-oriented desktop surfaces.
- Use at least a 44px hit region on coarse pointers.
- Maintain enough spacing that expanded hit regions do not overlap.

### Focus

- Provide a visible `:focus-visible` treatment.
- Aim for a 2px perimeter with at least 3:1 contrast between focused and
  unfocused pixels, following WCAG's enhanced focus guidance.
- Do not rely only on a subtle background-color change.
- Ensure focus remains visible inside horizontal overflow containers; scroll
  the focused item into view.

### Contrast and states

- Text must meet normal text contrast requirements.
- Interactive boundaries and focus indicators must remain discernible in
  light, dark, and high-contrast themes.
- Disabled styling must not be the only communication of a temporary loading
  state when a user needs to understand why activation is unavailable.

### Localization and direction

- Use logical properties for spacing and alignment.
- Reverse scrolling and icon placement appropriately in RTL.
- Do not assume a short English label remains short after translation.
- Let starter cards grow vertically; keep compact pills one line with a
  tooltip or accessible full label only when truncation is unavoidable.
- Avoid font-family switch logic embedded in the component; consume resolved
  theme typography.

## Events and analytics

Unify starter and follow-up observability:

```ts
type PersonaSuggestionEventDetail = {
  id: string;
  label: string;
  prompt: string;
  index: number;
  origin: "configured" | "agent" | "provider";
  surface: "starter" | "follow-up";
  placement: "welcome" | "after-message" | "composer";
  variant: "card" | "chip" | "list";
  selection: "send" | "fill";
  sourceMessageId?: string;
};
```

Recommended events:

- `persona:suggestion:shown`
- `persona:suggestion:selected`
- `persona:suggestion:filled`
- `persona:suggestion:sent`
- `persona:suggestion:dismissed`

Keep the existing `persona:suggestReplies:*` events as compatibility aliases
for at least one deprecation cycle.

### Product metrics

Measure by surface and suggestion id:

- impression count;
- selection rate;
- time from impression to selection;
- send versus fill rate;
- edit-before-send rate for filled prompts;
- suggestion-to-freeform ratio;
- time to first user message;
- abandonment after starter impression;
- follow-up continuation rate;
- downstream task completion where the host can provide it; and
- horizontal-scroll or overflow interaction.

Do not optimize only for click-through. A high click rate can reflect
overpowering visual emphasis or low-quality menu-like behavior. Pair engagement
with successful continuation, user edits, task completion, and free-form usage.

## Implementation architecture

### 1. Normalize data at the boundary

Create a pure normalizer that maps strings and objects into a canonical
internal item:

```ts
type NormalizedSuggestion = {
  id: string;
  label: string;
  prompt: string;
  description?: string;
  icon?: IconName;
  selection: "send" | "fill";
  emphasis: "default" | "primary";
};
```

Use the same normalizer for:

- configured starters;
- `suggest_replies` payloads; and
- future provider-driven suggestions.

### 2. Separate state from presentation

Retain pure selectors for:

- whether starters apply;
- the latest agent follow-up set; and
- surface placement.

Render through a shared low-level suggestion-button primitive plus
surface-specific group renderers:

```text
Suggestion state
├── Starter group
│   ├── Card renderer
│   ├── Chip renderer
│   └── List renderer
└── Follow-up group
    ├── Chip renderer
    ├── Card renderer
    └── List renderer
```

This avoids duplicating interaction, event, icon, accessibility, and token
logic while allowing starters and follow-ups to have different default layouts.

### 3. Use data attributes as the stable styling surface

Recommended internal attributes:

```html
<div
  data-persona-suggestions
  data-surface="follow-up"
  data-placement="after-message"
  data-variant="chip"
>
  <button
    data-persona-suggestion
    data-emphasis="default"
    data-selection="send"
  >
    ...
  </button>
</div>
```

Persona's documented customization contract should remain theme/config driven.
Data attributes improve internal clarity, testing, and narrowly scoped host
overrides without requiring utility-class archaeology.

### 4. Preserve derived visibility

Do not introduce independent booleans such as `showFollowUps`. Derive visibility
from messages, active run state, feature configuration, and the normalized
suggestion set. This preserves hydration and eliminates imperative show/hide
drift.

### 5. Avoid destructive rerenders during fill

The current renderer clears and rebuilds the container on each message change.
When richer cards, tooltips, overflow position, and focus are added, use keyed
reconciliation or a lightweight render fingerprint so equivalent updates do
not:

- reset horizontal scroll;
- lose focus;
- replay entrance animation;
- re-announce the group; or
- destroy host-provided icon elements.

## Test plan

### Unit tests

- string and object normalization;
- label/prompt defaults;
- invalid object filtering;
- mixed v1/v2 `suggest_replies` payloads;
- deduplication and caps;
- latest-wins follow-up selection;
- dismissal after typed, voice, sent, and filled input;
- static starter visibility;
- placement resolution for each mount/composer mode;
- theme token resolution; and
- compatibility mapping from existing config.

### DOM tests

- native button semantics;
- label, description, and icon rendering;
- send and fill behavior;
- caret/focus after fill;
- unified and legacy event details;
- no double send;
- disabled state while streaming;
- focus preservation across equivalent rerenders;
- horizontal focus scrolling;
- RTL order and logical spacing; and
- reduced-motion behavior.

### Browser and visual tests

Cover:

- light and dark schemes;
- default, compact, and spacious density;
- sharp, rounded, and pill radius treatments;
- 320px, 400px, and wide inline surfaces;
- floating, detached, docked, fullscreen, and pill composer modes;
- one through four suggestions;
- long localized labels;
- icons and descriptions;
- keyboard-only navigation;
- coarse pointer target height;
- 200% zoom/reflow;
- high-contrast/forced-colors mode; and
- restored follow-ups after hydration.

## Rollout

### Phase 1 — Rich items and accessible states

- Add `AgentWidgetSuggestion`.
- Add normalization shared by static and agent suggestions.
- Add separate label and prompt.
- Add `send` and `fill`.
- Add stable ids and unified events.
- Add dedicated focus, pressed, disabled, and coarse-pointer target styling.
- Preserve current placement and existing config aliases.

This phase provides immediate value with limited layout risk.

### Phase 2 — Purpose-built surfaces

- Add structured `suggestions.starters` and `suggestions.followUps`.
- Move starter defaults into the welcome surface.
- Add starter card and follow-up pill renderers.
- Add `auto`, `after-message`, and `composer` placement.
- Add horizontal overflow affordances.
- Preserve the pill-composer placement invariant.

### Phase 3 — Semantic theming and editor support

- Add `theme.components.suggestion`.
- Map all component states to CSS variables.
- Make typography and density inherit from the theme.
- Expand theme-editor content, behavior, and visual preview controls.
- Deprecate chip-only inline style fields only if a future major warrants it.

### Phase 4 — Providers and advanced discovery

Only after product demand is clear:

- suggestion provider/adapter API;
- contextual regeneration and cancellation;
- loading, refresh, and dismiss controls;
- prompt gallery;
- composer typeahead;
- personalization; and
- admin analytics.

## Recommended lead example

```ts
const config: AgentWidgetConfig = {
  suggestions: {
    starters: {
      variant: "card",
      placement: "welcome",
      items: [
        {
          id: "compare-plans",
          label: "Compare plans",
          description: "See features, limits, and pricing side by side.",
          prompt: "Compare your plans and recommend the best one for a small team.",
          icon: "files",
          selection: "send",
        },
        {
          id: "estimate-cost",
          label: "Estimate my cost",
          description: "Draft an estimate I can adjust before sending.",
          prompt: "Estimate my monthly cost for [number] users and explain the assumptions.",
          icon: "dollar-sign",
          selection: "fill",
        },
        {
          id: "migration-help",
          label: "Plan a migration",
          description: "Build a practical rollout checklist.",
          prompt: "Help me plan a migration, including risks, sequencing, and rollback.",
          icon: "arrow-right",
          selection: "send",
        },
      ],
    },
    followUps: {
      variant: "chip",
      placement: "auto",
      overflow: "scroll",
      maxItems: 4,
    },
  },
  features: {
    suggestReplies: {
      expose: true,
    },
  },
  theme: {
    components: {
      suggestion: {
        starter: {
          borderRadius: "palette.radius.xl",
          background: "semantic.colors.surface",
          foreground: "semantic.colors.text",
        },
        followUp: {
          borderRadius: "palette.radius.full",
          background: "transparent",
          foreground: "semantic.colors.text",
        },
      },
    },
  },
};
```

## Success criteria

The work is successful when:

1. Existing `suggestionChips: string[]` integrations render and send unchanged.
2. Starters can display concise labels and descriptions while sending or
   drafting longer prompts.
3. Follow-ups are visually associated with the answer that generated them on
   normal transcript surfaces.
4. Compact pill-composer layouts retain a usable composer-adjacent treatment.
5. Every suggestion state is themeable in light and dark modes without host
   CSS.
6. Keyboard, touch, zoom, RTL, and reduced-motion behavior passes the browser
   test matrix.
7. Hydrated follow-ups preserve current latest-wins and dismissal behavior.
8. Hosts can measure impressions, fills, sends, and selections consistently.
9. `ask_user_question` remains the unmistakable surface for required answers.
10. A large prompt catalog is not forced into a wrapping chip row.

## Source index

Sources reviewed July 24, 2026:

- [OpenAI ChatKit customization](https://openai.github.io/chatkit-js/customize/)
- [OpenAI `StartScreenPrompt`](https://openai.github.io/chatkit-js/api/openai/chatkit/type-aliases/startscreenprompt/)
- [OpenAI `ThemeOption`](https://openai.github.io/chatkit-js/api/openai/chatkit/type-aliases/themeoption/)
- [assistant-ui suggested prompts](https://www.assistant-ui.com/docs/guides/suggestions)
- [CopilotKit `useConfigureSuggestions`](https://docs.copilotkit.ai/reference/hooks/useConfigureSuggestions)
- [CopilotKit `useSuggestions`](https://docs.copilotkit.ai/reference/v2/hooks/useSuggestions)
- [Microsoft 365 organizational prompts](https://learn.microsoft.com/en-us/microsoft-365/copilot/organizational-prompts)
- [Microsoft Copilot Studio suggested prompts](https://learn.microsoft.com/en-us/microsoft-copilot-studio/configure-starter-prompts)
- [Microsoft Bot Framework suggested actions](https://learn.microsoft.com/en-us/azure/bot-service/bot-builder-howto-add-suggested-actions?view=azure-bot-service-4.0)
- [Intercom workflow reply buttons](https://www.intercom.com/help/en/articles/4134615)
- [Google conversational chip guidance](https://developers.google.com/assistant/conversation-design/chips)
- [Android Material suggestion chips](https://developer.android.com/develop/ui/compose/quick-guides/content/create-chip)
- [Carbon tag usage](https://carbondesignsystem.com/components/tag/usage/)
- [WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [WCAG focus appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance)
- [Apple button guidance](https://developer.apple.com/design/human-interface-guidelines/buttons)
- [Android accessibility touch targets](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)
- [PromptHelper preprint](https://arxiv.org/abs/2601.15575)
