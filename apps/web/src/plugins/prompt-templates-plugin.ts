import type {
  AgentWidgetPlugin,
  ComposerActionRenderContext,
} from "@runtypelabs/persona";
import { injectStyles } from "@runtypelabs/persona/plugin-kit";

/**
 * Coexistence example 2: an end-cluster custom action plus an async button
 * action, contributed by a second plugin that also never claims
 * `renderComposer`.
 *
 * The custom action returns its own `<select>` as the accessible root; the
 * registry places it as-is and calls the returned `destroy()` on removal,
 * composer rebuild, plugin removal, and widget destroy. The button action
 * returns a promise, so the registry holds it in a busy state (`aria-busy`)
 * and ignores repeat activation until it settles.
 */

const STYLE_ID = "persona-prompt-templates";
const STYLES = `
.prompt-templates-select {
  height: 2rem;
  max-width: 9.5rem;
  padding: 0 0.4rem;
  font-size: 0.78rem;
  border-radius: 0.4rem;
  border: 1px solid var(--persona-border, rgba(0, 0, 0, 0.14));
  background: transparent;
  color: var(--persona-text, #111827);
  cursor: pointer;
}
.prompt-templates-select[aria-disabled="true"] {
  opacity: 0.5;
  cursor: default;
}
`;

export type PromptTemplate = {
  id: string;
  label: string;
  prompt: string;
};

const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: "status",
    label: "Order status",
    prompt: "Where is my most recent order, and when will it arrive?",
  },
  {
    id: "return",
    label: "Start a return",
    prompt: "I would like to return an item from my last order. What are the steps?",
  },
  {
    id: "billing",
    label: "Billing question",
    prompt: "Can you explain the charges on my latest invoice?",
  },
];

export type PromptTemplatesOptions = {
  templates?: PromptTemplate[];
  /** Milliseconds the "expand draft" action pretends to work. */
  expandDelayMs?: number;
};

export function createPromptTemplatesPlugin(
  options: PromptTemplatesOptions = {}
): AgentWidgetPlugin {
  const templates = options.templates ?? DEFAULT_TEMPLATES;
  const expandDelayMs = options.expandDelayMs ?? 600;

  // Hoisted so the registry sees a stable renderer identity and keeps the live
  // <select> across re-resolves instead of rebuilding it.
  const renderTemplateSelect = (ctx: ComposerActionRenderContext) => {
    const select = document.createElement("select");
    select.className = "prompt-templates-select";
    select.setAttribute("aria-label", "Prompt templates");
    injectStyles(select, STYLE_ID, STYLES);

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Templates";
    select.appendChild(placeholder);
    for (const template of templates) {
      const option = document.createElement("option");
      option.value = template.id;
      option.textContent = template.label;
      select.appendChild(option);
    }

    const onChange = () => {
      const chosen = templates.find((item) => item.id === select.value);
      if (!chosen) return;
      ctx.setValue(chosen.prompt);
      select.value = "";
      // The draft is ready to edit, so put the caret back in the composer.
      const input = select
        .closest("[data-persona-composer-form]")
        ?.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]");
      input?.focus();
    };
    select.addEventListener("change", onChange);

    return {
      element: select,
      destroy: () => select.removeEventListener("change", onChange),
    };
  };

  return {
    id: "prompt-templates",
    contributeComposerActions: () => [
      {
        id: "picker",
        kind: "custom",
        placement: "end",
        order: 600,
        label: "Prompt templates",
        disableWhenStreaming: true,
        render: renderTemplateSelect,
      },
      {
        id: "expand",
        placement: "end",
        order: 700,
        label: "Expand the draft into a fuller question",
        tooltipText: "Expand the draft",
        iconName: "sparkles",
        disableWhenStreaming: true,
        // Async: the registry shows a busy state and ignores repeat clicks
        // until this settles.
        onSelect: async (ctx) => {
          const draft = ctx.getValue().trim();
          await new Promise((resolve) => setTimeout(resolve, expandDelayMs));
          ctx.setValue(
            draft
              ? `${draft}\n\nPlease include the relevant policy and the next step I should take.`
              : "Please walk me through my options, including the relevant policy and the next step I should take."
          );
        },
      },
    ],
  };
}
