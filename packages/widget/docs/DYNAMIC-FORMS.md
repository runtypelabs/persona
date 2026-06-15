# Dynamic Forms

The Persona widget renders AI-generated forms when the assistant emits a JSON
component directive of the form:

```json
{
  "text": "Please fill out this form:",
  "component": "DynamicForm",
  "props": {
    "title": "Contact us",
    "fields": [
      { "label": "Name", "type": "text", "required": true },
      { "label": "Email", "type": "email", "required": true }
    ],
    "submit_text": "Submit"
  }
}
```

The form is rendered by a `DynamicForm` component that ships with the example
app: **not** the widget core. You're expected to copy and customize it. This
doc is the reference for what that component supports out of the box and how
to extend it.

> **Where to find it:** [`examples/embedded-app/src/components.ts`](../../../examples/embedded-app/src/components.ts) (look for `export const DynamicForm`).

## Live demos

- [`/dynamic-form.html`](../../../examples/embedded-app/dynamic-form.html): primary demo, plus three layout variants (Compact, Spacious, Branded).
- [`/dynamic-form-fields.html`](../../../examples/embedded-app/dynamic-form-fields.html): field-type reference: every supported `type`, `width: "half"` pairing, helper text, required marking, and sensitive masking.

## Wiring it up

```ts
import { initAgentWidget, componentRegistry } from "@runtypelabs/persona";
import { DynamicForm } from "./components";

componentRegistry.register("DynamicForm", DynamicForm);

initAgentWidget({
  target: "#app",
  config: {
    apiUrl: "/api/chat/dispatch",
    parserType: "json",
    enableComponentStreaming: true,
    formEndpoint: "/form",         // POST target on submit
    wrapComponentDirectiveInBubble: false  // optional: see below
  }
});
```

Because `DynamicForm` renders its own card chrome (border, padding, shadow),
set `wrapComponentDirectiveInBubble: false` to suppress Persona's default
bubble wrap and avoid a card-on-card look.

## Field reference

Each entry in `props.fields` is a [`FormField`](../../../examples/embedded-app/src/components.ts):

| Property      | Type                                                                           | Notes                                                                                  |
|---------------|--------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| `label`       | `string`                                                                       | Required. Rendered as the visible label and used to derive a default `name`.           |
| `name`        | `string?`                                                                      | Form field name in the POST payload. Defaults to a slug of `label`.                    |
| `type`        | `"text" \| "email" \| "tel" \| "url" \| "date" \| "time" \| "textarea" \| "number"` | Defaults to `"text"`. `email` and `tel` get format validation.                         |
| `placeholder` | `string?`                                                                      | Placeholder text inside the input.                                                     |
| `required`    | `boolean?`                                                                     | When `true`, the label gets a red `*` and submit is blocked until populated.           |
| `helper_text` | `string?`                                                                      | Inline help text below the input (alias: `helperText`).                                |
| `sensitive`   | `boolean?`                                                                     | On the success recap, the value is masked to `••••<last 4>` instead of shown in clear. |
| `autocomplete`| `string?`                                                                      | Override the inferred [`autocomplete`](https://developer.mozilla.org/docs/Web/HTML/Attributes/autocomplete) token. |
| `width`       | `"full" \| "half"`                                                             | Defaults to `"full"`. Two consecutive `"half"` fields share a row in the form grid.    |

### Inferred attributes

The component infers `autocomplete` and `inputmode` from the field's
`type`, `name`, and `label` so most common patterns work without extra
props. Examples:

| You write…                                          | Component sets…                                                |
|-----------------------------------------------------|----------------------------------------------------------------|
| `{ "label": "Email", "type": "email" }`             | `autocomplete="email"`, `inputmode="email"`                    |
| `{ "label": "First Name", "type": "text" }`         | `autocomplete="given-name"`                                    |
| `{ "label": "Postal Code", "type": "text" }`        | `autocomplete="postal-code"`, `inputmode="numeric"`            |
| `{ "label": "Phone", "type": "tel" }`               | `autocomplete="tel"`, `inputmode="tel"`                        |

Override with `autocomplete: "off"` (or any standard token) if needed.

## Top-level form props

| Property          | Type                | Notes                                                                                                            |
|-------------------|---------------------|------------------------------------------------------------------------------------------------------------------|
| `title`           | `string?`           | Heading at the top of the card.                                                                                  |
| `description`     | `string?`           | Subtitle below the title.                                                                                        |
| `fields`          | `FormField[]`       | The fields, in render order.                                                                                     |
| `submit_text`     | `string?`           | Label on the submit button. Defaults to `"Submit"`. (Alias: `submitText`.)                                       |
| `helper_text`     | `string?`           | Below the submit button: defaults to `"Takes less than 30 seconds."` for forms with > 2 fields. Pass `""` to hide. |
| `success_title`   | `string?`           | Heading on the success recap card. Defaults to `"You're all set!"`.                                              |
| `success_message` | `string?`           | Body copy on the success recap. Falls back to a generic confirmation.                                            |
| `allow_edit`      | `boolean?`          | When `true` (default), the success card shows an "Edit details" button that returns to the form.                 |
| `styles`          | `DynamicFormStyles?`| Per-instance style overrides. Merged on top of `config.formStyles`.                                              |

## Theming with `formStyles`

`formStyles` is a flat token map. Set it on the widget config for global
defaults, or pass it as `props.styles` for one-off overrides. Tokens fall
back to the existing `--persona-*` CSS variables when omitted.

```ts
initAgentWidget({
  target: "#app",
  config: {
    apiUrl: "/api/chat/dispatch",
    formStyles: {
      borderRadius: "16px",
      padding: "1.5rem",
      titleFontSize: "1.25rem",
      buttonBorderRadius: "9999px"
    }
  }
});
```

| Token                  | Default              | Notes                                                            |
|------------------------|----------------------|------------------------------------------------------------------|
| `margin`               | `0.5rem 0`           | Outer margin around the card.                                    |
| `borderRadius`         | `14px`               | Card corner radius.                                              |
| `border`               | `: `                  | Full CSS shorthand. Overrides `borderWidth` + `borderColor`.     |
| `borderWidth`          | `1px`                | Used when `border` is not set.                                   |
| `borderColor`          | theme `--persona-border` | Used when `border` is not set.                                |
| `padding`              | `0.875rem 1rem`      | Card padding.                                                    |
| `maxWidth`             | `460px`              | Card max-width.                                                  |
| `boxShadow`            | subtle stack         | Card drop shadow.                                                |
| `titleFontSize`        | `1rem`               |                                                                  |
| `titleFontWeight`      | `700`                |                                                                  |
| `descriptionFontSize`  | `0.8125rem`          |                                                                  |
| `labelFontSize`        | `0.8125rem`          |                                                                  |
| `labelFontWeight`      | `500`                |                                                                  |
| `inputFontSize`        | `0.8125rem`          |                                                                  |
| `inputPadding`         | `0.4375rem 0.625rem` |                                                                  |
| `inputBorderRadius`    | `0.5rem`             |                                                                  |
| `inputBorder`          | `1px solid …`        | Resting border (focus ring is always shown via box-shadow).      |
| `buttonPadding`        | `0.5rem 1rem`        |                                                                  |
| `buttonBorderRadius`   | `0.5rem`             |                                                                  |
| `buttonFontSize`       | `0.8125rem`          |                                                                  |
| `buttonFontWeight`     | `600`                |                                                                  |
| `successAccentColor`   | theme `--persona-accent` | Color used on the success card.                              |
| `errorColor`           | `#ef4444`            | Required asterisk + invalid input ring.                          |
| `helperFontSize`       | `0.75rem`            | Used by the bottom helper row and per-field helper text.         |
| `successCardPadding`   | `0.5rem 0.25rem`     | Padding on the inner success recap card.                         |

## Layout patterns

### Half-width pairs

Two consecutive fields with `width: "half"` share a row. Useful for
First Name / Last Name, City / Postal Code, Card Number / CVC.

```json
{
  "fields": [
    { "label": "First Name", "type": "text", "width": "half", "required": true },
    { "label": "Last Name",  "type": "text", "width": "half", "required": true },
    { "label": "Email",      "type": "email", "required": true }
  ]
}
```

A trailing single `"half"` (no partner) still spans one column. The grid
gap and column count come from `formStyles`: adjust `inputPadding` and
`labelFontSize` to keep paired fields readable on narrow widgets.

### Auto-growing textarea

Textareas start at single-input height and grow as the user types, up to
`maxHeight: 140px`. No extra props needed: just `type: "textarea"`. This
keeps long forms compact at rest without making the user feel rushed.

### Sensitive masking

Set `sensitive: true` on a field and the **success recap card** will mask
the value to `••••<last 4>`. The form itself still shows the value as
typed (so the user can correct mistakes); only the post-submit summary
masks it. Useful for API keys, account numbers, phone numbers, and
similar identifiers users want kept out of plain view in confirmations.

> **Not for cardholder data.** Collecting credit-card numbers in a
> chat-widget input puts your application in **PCI DSS** scope. Use a
> vendor-hosted iframe (Stripe Elements, Adyen Drop-in, Braintree
> Hosted Fields) instead: masking on the recap is not a substitute for
> keeping PAN out of your DOM and your server payload.

## Submission

On submit, the form POSTs JSON to `config.formEndpoint` (default
`"/form"`). Validation runs first; required fields and the built-in
email/phone format checks block submission and surface errors inline.

Successful submission:

1. Saves the payload to `localStorage` keyed by the assistant message
   ID, via [`user-action-store.ts`](../../../examples/embedded-app/src/user-action-store.ts).
   On reload, the form re-renders into the success state instead of
   re-prompting.
2. Animates to the success recap card showing the submitted values.
3. Optionally shows an "Edit details" button (`allow_edit: true`) that
   restores the form.

Custom submit logic: replace the form's `submit` handler in your fork of
`DynamicForm`, or wire `formEndpoint` to a route that does additional
processing.

## Recipes

### Lead capture (booking)

```json
{
  "title": "Book a demo",
  "description": "Share your details and we'll follow up to confirm.",
  "fields": [
    { "label": "First Name", "type": "text", "required": true, "width": "half" },
    { "label": "Last Name",  "type": "text", "required": true, "width": "half" },
    { "label": "Email",      "type": "email", "required": true },
    { "label": "Company",    "type": "text", "width": "half" },
    { "label": "Headcount",  "type": "number", "width": "half" },
    {
      "label": "What are you trying to solve?",
      "type": "textarea",
      "placeholder": "A few sentences is fine."
    }
  ],
  "submit_text": "Request meeting"
}
```

### Address

```json
{
  "title": "Shipping address",
  "fields": [
    { "label": "Full name",     "type": "text", "required": true },
    { "label": "Street",        "type": "text", "required": true },
    { "label": "City",          "type": "text", "width": "half", "required": true },
    { "label": "Postal Code",   "type": "text", "width": "half", "required": true },
    { "label": "Country",       "type": "text", "required": true }
  ],
  "submit_text": "Save address"
}
```

### Quick survey

```json
{
  "title": "How was your demo?",
  "fields": [
    {
      "label": "On a scale of 1–10, how likely are you to recommend us?",
      "type": "number"
    },
    {
      "label": "What stood out?",
      "type": "textarea"
    }
  ],
  "submit_text": "Submit"
}
```

## Extending the component

The shipped `DynamicForm` is an **example**: fork it. Common extensions:

- **New field types** (`select`, `radio`, `checkbox`, `password`, `file`):
  add a branch in the `if (inputType === "textarea") { … } else { … }`
  switch in the field-rendering loop. Each branch creates the control,
  applies the same focus/hover/error treatment, and pushes a `FieldHandle`
  for validation and submit handling.
- **Conditional fields** (`showIf` / `hideIf`): add an `eval`-style hook
  on the field schema that the component evaluates on every input event,
  toggling `display` on the field's group.
- **Sections / dividers**: extend `FormField` to a discriminated union
  (`{ kind: "field" | "section" | "divider" }`) and render section
  headers as full-width grid rows.
- **Custom submit**: replace the `fetch(formEndpoint, …)` call with a
  callback prop and wire it to your business logic.

Want any of these upstream as defaults? Open an issue with the use case.

## Programmatic preview / debug

Use [`injectComponentDirective`](./MESSAGE-INJECTION.md#component-directive-injection)
to render a form directly from host code without going through the LLM:

```ts
widget.injectComponentDirective({
  component: "DynamicForm",
  props: {
    title: "Book a demo",
    fields: [/* … */],
    submit_text: "Request meeting"
  },
  text: "Share your details to book a demo.",
  llmContent: "[Showed booking form]"
});
```

Useful for design QA, replay, debug toggles, and local tools that
should render a registered component without round-tripping the model.
