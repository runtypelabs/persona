/**
 * Blueprint B: pre-chat form.
 *
 * First open shows a short identity form in place of the welcome card and a
 * disabled composer underneath it. On submit the plugin stores the identity,
 * injects a compact identity line into the transcript, unlocks the composer,
 * and hands the welcome surface back to Persona's default renderer. Returning
 * visitors skip the form.
 *
 * Built purely on public surface: `renderWelcome`, `renderComposer` (with its
 * `requestRender()` re-entry), `ctx.storage`, `contextProviders`, and the
 * host-closure controller pattern (`plugin.attach(controller)`).
 *
 * Privacy: `ctx.storage` is plain `localStorage`. A host capturing data it
 * considers sensitive passes its own `storage` implementation instead.
 */

import type {
  AgentWidgetConfig,
  AgentWidgetContextProvider,
  AgentWidgetController,
  AgentWidgetPlugin,
  AgentWidgetPluginStorage,
} from "@runtypelabs/persona";
import { injectStyles } from "@runtypelabs/persona/plugin-kit";

export type PreChatFieldType = "text" | "email" | "tel" | "select";

export type PreChatField = {
  /** Key in the captured identity object and in the request context. */
  name: string;
  label: string;
  /** Defaults to "text". "select" renders a dropdown over `options`. */
  type?: PreChatFieldType;
  required?: boolean;
  /** Choices for `type: "select"`. */
  options?: string[];
  placeholder?: string;
};

export type PreChatIdentity = Record<string, string>;

export type PreChatPluginOptions = {
  /** Field set, mirroring the commercial widgets' field pickers. */
  fields?: PreChatField[];
  title?: string;
  description?: string;
  submitLabel?: string;
  /** Note rendered under the gated composer. */
  gateNote?: string;
  /** Key the identity lands under in the request `context`. */
  contextKey?: string;
  /** Compact transcript line. Defaults to "Visitor details: name …, email …". */
  identityLine?: (identity: PreChatIdentity) => string;
  /** Escape hatch for hosts that will not put identity in `localStorage`. */
  storage?: AgentWidgetPluginStorage;
  onSubmit?: (identity: PreChatIdentity) => void;
};

export type PreChatPlugin = AgentWidgetPlugin & {
  /** Host-closure controller pattern: call once with the init handle. */
  attach: (controller: AgentWidgetController) => void;
  /** Register in `config.contextProviders` so every dispatch carries identity. */
  contextProvider: AgentWidgetContextProvider;
  getIdentity: () => PreChatIdentity | null;
  /** Drop the stored identity and re-gate on the next render. */
  reset: () => void;
};

const IDENTITY_KEY = "identity";

export const DEFAULT_PRE_CHAT_FIELDS: PreChatField[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  {
    name: "topic",
    label: "Topic",
    type: "select",
    options: ["Billing", "Technical help", "Something else"],
  },
];

const PRE_CHAT_CSS = `
.pre-chat {
  display: grid;
  gap: 14px;
  width: 100%;
  /* Plugin welcome content is full-bleed (overlay host); the widget root
     publishes the column vars so plugins match without config access. */
  max-width: var(--persona-welcome-max-width, 640px);
  margin-inline: auto;
  text-align: left;
}

.pre-chat__title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--persona-text, #111827);
}

.pre-chat__description {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--persona-text-muted, #6b7280);
}

.pre-chat__fields {
  display: grid;
  gap: 12px;
}

.pre-chat__field {
  display: grid;
  gap: 5px;
}

.pre-chat__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--persona-text-muted, #6b7280);
}

.pre-chat__optional {
  font-weight: 400;
  text-transform: none;
}

.pre-chat__control {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: 14px;
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid var(--persona-border, #e5e7eb);
  background: var(--persona-surface, #ffffff);
  color: var(--persona-text, #111827);
}

.pre-chat__control:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--persona-accent, #171717) 40%, transparent);
  outline-offset: 1px;
}

.pre-chat__control[aria-invalid="true"] {
  border-color: var(--persona-danger, #dc2626);
}

.pre-chat__error {
  font-size: 12px;
  color: var(--persona-danger, #dc2626);
}

.pre-chat__error:empty {
  display: none;
}

.pre-chat__submit {
  appearance: none;
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: var(--persona-accent, #171717);
  color: var(--persona-text-inverse, #ffffff);
}

.pre-chat-gate {
  display: grid;
  gap: 8px;
  /* Match the default composer's centered content column. */
  width: 100%;
  max-width: var(--persona-content-max-width, 768px);
  margin-inline: auto;
}

.pre-chat-gate__row {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 14px;
  border: 1px solid var(--persona-border, #e5e7eb);
  background: color-mix(in srgb, var(--persona-surface, #ffffff) 92%, var(--persona-border, #e5e7eb));
  padding: 8px 8px 8px 12px;
  opacity: 0.75;
}

.pre-chat-gate__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  resize: none;
  font: inherit;
  font-size: 14px;
  color: var(--persona-text-muted, #6b7280);
}

.pre-chat-gate__send {
  border: none;
  border-radius: 10px;
  padding: 7px 12px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  background: var(--persona-border, #e5e7eb);
  color: var(--persona-text-muted, #6b7280);
}

.pre-chat-gate__note {
  font-size: 12px;
  color: var(--persona-text-muted, #6b7280);
}
`;

const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const parseIdentity = (raw: string | null): PreChatIdentity | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    return entries.length ? Object.fromEntries(entries) : null;
  } catch {
    return null;
  }
};

const defaultIdentityLine = (
  identity: PreChatIdentity,
  fields: PreChatField[],
): string => {
  const parts = fields
    .filter((field) => identity[field.name])
    .map((field) => `${field.label.toLowerCase()} ${identity[field.name]}`);
  return parts.length
    ? `Visitor details: ${parts.join(", ")}`
    : "Visitor details captured";
};

export const createPreChatPlugin = (
  options: PreChatPluginOptions = {},
): PreChatPlugin => {
  const fields = options.fields ?? DEFAULT_PRE_CHAT_FIELDS;
  const contextKey = options.contextKey ?? "visitor";

  let controller: AgentWidgetController | null = null;
  // Captured on the first hook call; `options.storage` wins when the host
  // supplied its own store.
  let store: AgentWidgetPluginStorage | null = options.storage ?? null;
  let identity: PreChatIdentity | null = null;
  let welcomeRequestRender: (() => void) | null = null;
  let composerRequestRender: (() => void) | null = null;
  // In-progress input survives a re-render triggered by `controller.update()`.
  const draft: PreChatIdentity = {};

  const adoptStorage = (ctxStorage: AgentWidgetPluginStorage) => {
    if (!options.storage) store = ctxStorage;
  };

  const readIdentity = (): PreChatIdentity | null => {
    if (!identity) identity = parseIdentity(store?.get(IDENTITY_KEY) ?? null);
    return identity;
  };

  const submit = (values: PreChatIdentity) => {
    identity = values;
    store?.set(IDENTITY_KEY, JSON.stringify(values));
    const line =
      options.identityLine?.(values) ?? defaultIdentityLine(values, fields);
    controller?.injectSystemMessage({ content: line });
    options.onSubmit?.(values);
    composerRequestRender?.();
    welcomeRequestRender?.();
  };

  const buildForm = (onCleanup: (fn: () => void) => void): HTMLElement => {
    const root = document.createElement("form");
    root.className = "pre-chat";
    root.noValidate = true;
    injectStyles(root, "persona-pre-chat-plugin", PRE_CHAT_CSS);

    const title = document.createElement("h2");
    title.className = "pre-chat__title";
    title.textContent = options.title ?? "Before we start";

    const description = document.createElement("p");
    description.className = "pre-chat__description";
    description.textContent =
      options.description ??
      "Share a few details so the assistant can follow up with you.";

    const fieldset = document.createElement("div");
    fieldset.className = "pre-chat__fields";

    const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
    const errors = new Map<string, HTMLElement>();

    fields.forEach((field, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "pre-chat__field";

      const controlId = `pre-chat-${field.name}-${index}`;
      const label = document.createElement("label");
      label.className = "pre-chat__label";
      label.htmlFor = controlId;
      label.textContent = field.label;
      if (!field.required) {
        const optional = document.createElement("span");
        optional.className = "pre-chat__optional";
        optional.textContent = " (optional)";
        label.appendChild(optional);
      }

      let control: HTMLInputElement | HTMLSelectElement;
      if (field.type === "select") {
        const select = document.createElement("select");
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = field.placeholder ?? "Choose one";
        select.appendChild(blank);
        (field.options ?? []).forEach((option) => {
          const node = document.createElement("option");
          node.value = option;
          node.textContent = option;
          select.appendChild(node);
        });
        control = select;
      } else {
        const input = document.createElement("input");
        input.type = field.type ?? "text";
        if (field.placeholder) input.placeholder = field.placeholder;
        control = input;
      }
      control.id = controlId;
      control.name = field.name;
      control.className = "pre-chat__control";
      control.value = draft[field.name] ?? "";
      if (field.required) control.required = true;

      const error = document.createElement("p");
      error.className = "pre-chat__error";

      const onInput = () => {
        draft[field.name] = control.value;
        control.removeAttribute("aria-invalid");
        error.textContent = "";
      };
      control.addEventListener("input", onInput);
      control.addEventListener("change", onInput);
      onCleanup(() => {
        control.removeEventListener("input", onInput);
        control.removeEventListener("change", onInput);
      });

      controls.set(field.name, control);
      errors.set(field.name, error);
      wrapper.append(label, control, error);
      fieldset.appendChild(wrapper);
    });

    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.className = "pre-chat__submit";
    submitButton.textContent = options.submitLabel ?? "Start chatting";

    const onSubmitEvent = (event: Event) => {
      event.preventDefault();
      const values: PreChatIdentity = {};
      let firstInvalid: HTMLElement | null = null;

      for (const field of fields) {
        const control = controls.get(field.name);
        const error = errors.get(field.name);
        if (!control || !error) continue;
        const value = control.value.trim();
        let message = "";
        if (field.required && !value) {
          message = `${field.label} is required.`;
        } else if (field.type === "email" && value && !isEmail(value)) {
          message = "Enter a valid email address.";
        }
        error.textContent = message;
        if (message) {
          control.setAttribute("aria-invalid", "true");
          firstInvalid = firstInvalid ?? control;
          continue;
        }
        control.removeAttribute("aria-invalid");
        if (value) values[field.name] = value;
      }

      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }
      submit(values);
    };
    root.addEventListener("submit", onSubmitEvent);
    onCleanup(() => root.removeEventListener("submit", onSubmitEvent));

    root.append(title, description, fieldset, submitButton);
    return root;
  };

  const buildGatedComposer = (config: AgentWidgetConfig): HTMLElement => {
    const footer = document.createElement("div");
    footer.className = "persona-widget-footer persona-p-4";
    injectStyles(footer, "persona-pre-chat-plugin", PRE_CHAT_CSS);

    const shell = document.createElement("div");
    shell.className = "pre-chat-gate";

    const row = document.createElement("div");
    row.className = "pre-chat-gate__row";

    // Real composer refs so the core binds to a live element; `disabled` is the
    // gate, and no `data-persona-composer-disable-when-streaming` so the
    // streaming toggle never re-enables it.
    const input = document.createElement("textarea");
    input.setAttribute("data-persona-composer-input", "");
    input.className = "pre-chat-gate__input";
    input.rows = 1;
    input.disabled = true;
    input.placeholder =
      config.copy?.inputPlaceholder ?? "How can I help...";

    const send = document.createElement("button");
    send.type = "button";
    send.className = "pre-chat-gate__send";
    send.disabled = true;
    send.textContent = config.copy?.sendButtonLabel ?? "Send";

    const note = document.createElement("p");
    note.className = "pre-chat-gate__note";
    note.textContent =
      options.gateNote ?? "Submit the form above to start the conversation.";

    row.append(input, send);
    shell.append(row, note);
    footer.appendChild(shell);
    return footer;
  };

  return {
    id: "demo-pre-chat",

    attach: (next: AgentWidgetController) => {
      controller = next;
    },

    contextProvider: () => {
      const current = readIdentity();
      return current ? { [contextKey]: current } : undefined;
    },

    getIdentity: () => readIdentity(),

    reset: () => {
      identity = null;
      store?.remove(IDENTITY_KEY);
      Object.keys(draft).forEach((key) => delete draft[key]);
      composerRequestRender?.();
      welcomeRequestRender?.();
    },

    // Runs at panel construction, before the first welcome arbitration, so the
    // gate decision is made on this very first invocation.
    renderComposer: ({ config, storage, requestRender }) => {
      adoptStorage(storage);
      composerRequestRender = requestRender;
      if (readIdentity()) return null;
      return buildGatedComposer(config);
    },

    renderWelcome: ({ storage, requestRender, onCleanup }) => {
      adoptStorage(storage);
      welcomeRequestRender = requestRender;
      if (readIdentity()) return null;
      return buildForm(onCleanup);
    },
  };
};
