import { createElement } from "../utils/dom";
import { AgentWidgetMessage, AgentWidgetConfig } from "../types";
import { AgentWidgetSession } from "../session";

export const formDefinitions: Record<
  string,
  {
    title: string;
    description?: string;
    fields: Array<{
      name: string;
      label: string;
      placeholder?: string;
      type?: "text" | "email" | "textarea";
      required?: boolean;
    }>;
    submitLabel?: string;
  }
> = {
  init: {
    title: "Schedule a Demo",
    description: "Share the basics and we'll follow up with a confirmation.",
    fields: [
      { name: "name", label: "Full name", placeholder: "Jane Doe", required: true },
      { name: "email", label: "Work email", placeholder: "jane@example.com", type: "email", required: true },
      { name: "notes", label: "What would you like to cover?", type: "textarea" }
    ],
    submitLabel: "Submit details"
  },
  followup: {
    title: "Additional Information",
    description: "Provide any extra details to tailor the next steps.",
    fields: [
      { name: "company", label: "Company", placeholder: "Acme Inc." },
      { name: "context", label: "Context", type: "textarea", placeholder: "Share more about your use case" }
    ],
    submitLabel: "Send"
  }
};

export const enhanceWithForms = (
  bubble: HTMLElement,
  message: AgentWidgetMessage,
  config: AgentWidgetConfig,
  session: AgentWidgetSession
) => {
  const placeholders = bubble.querySelectorAll<HTMLElement>("[data-tv-form]");
  if (placeholders.length) {
    placeholders.forEach((placeholder) => {
      if (placeholder.dataset.enhanced === "true") return;
      const type = placeholder.dataset.tvForm ?? "init";
      placeholder.dataset.enhanced = "true";

      const definition = formDefinitions[type] ?? formDefinitions.init;
      placeholder.classList.add("persona-form-card", "persona-space-y-4");

      const heading = createElement("div", "persona-space-y-1");
      const title = createElement(
        "h3",
        "persona-text-base persona-font-semibold persona-text-persona-primary"
      );
      title.textContent = definition.title;
      heading.appendChild(title);
      if (definition.description) {
        const desc = createElement(
          "p",
          "persona-text-sm persona-text-persona-muted"
        );
        desc.textContent = definition.description;
        heading.appendChild(desc);
      }

      const form = document.createElement("form");
      form.className = "persona-form-grid persona-space-y-3";

      definition.fields.forEach((field) => {
        const group = createElement("label", "persona-form-field persona-flex persona-flex-col persona-gap-1");
        group.htmlFor = `${message.id}-${type}-${field.name}`;
        const label = createElement("span", "persona-text-xs persona-font-medium persona-text-persona-muted");
        label.textContent = field.label;
        group.appendChild(label);

        const inputType = field.type ?? "text";
        let control: HTMLInputElement | HTMLTextAreaElement;
        if (inputType === "textarea") {
          control = document.createElement("textarea");
          control.rows = 3;
        } else {
          control = document.createElement("input");
          control.type = inputType;
        }
        control.className =
          "persona-rounded-xl persona-border persona-border-gray-200 persona-bg-white persona-px-3 persona-py-2 persona-text-sm persona-text-persona-primary focus:persona-outline-none focus:persona-border-persona-primary";
        control.id = `${message.id}-${type}-${field.name}`;
        control.name = field.name;
        control.placeholder = field.placeholder ?? "";
        if (field.required) {
          control.required = true;
        }
        group.appendChild(control);
        form.appendChild(group);
      });

      const actions = createElement(
        "div",
        "persona-flex persona-items-center persona-justify-between persona-gap-2"
      );
      const status = createElement(
        "div",
        "persona-text-xs persona-text-persona-muted persona-min-h-[1.5rem]"
      );
      const submit = createElement(
        "button",
        "persona-inline-flex persona-items-center persona-rounded-full persona-bg-persona-primary persona-px-4 persona-py-2 persona-text-sm persona-font-semibold persona-text-white disabled:persona-opacity-60 persona-cursor-pointer"
      ) as HTMLButtonElement;
      submit.type = "submit";
      submit.textContent = definition.submitLabel ?? "Submit";
      actions.appendChild(status);
      actions.appendChild(submit);
      form.appendChild(actions);

      placeholder.replaceChildren(heading, form);

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formEndpoint = config.formEndpoint ?? "/form";
        const formData = new FormData(form as HTMLFormElement);
        const payload: Record<string, unknown> = {};
        formData.forEach((value, key) => {
          payload[key] = value;
        });
        payload["type"] = type;

        submit.disabled = true;
        status.textContent = "Submitting…";

        try {
          const response = await fetch(formEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });
          if (!response.ok) {
            throw new Error(`Form submission failed (${response.status})`);
          }
          const data = await response.json();
          status.textContent = data.message ?? "Thanks! We'll be in touch soon.";
          if (data.success && data.nextPrompt) {
            await session.sendMessage(String(data.nextPrompt));
          }
        } catch (error) {
          status.textContent =
            error instanceof Error ? error.message : "Something went wrong. Please try again.";
        } finally {
          submit.disabled = false;
        }
      });
    });
  }
};








