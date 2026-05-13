/**
 * Field reference demo. One page, three tabs — each pre-injects a
 * DynamicForm directive showcasing a different aspect of the field schema:
 *
 *   1. all field types (text, email, tel, url, number, date, time, textarea)
 *      — also demonstrates `sensitive: true` masking via the phone field
 *   2. layout widths (full + half pairs)
 *   3. helper text + required marking
 *
 * Each tab shows the directive `props` on the left and the rendered form
 * on the right. Useful as a copy-paste template for prompt authors and
 * as a smoke test when tweaking themes.
 */

import "@runtypelabs/persona/widget.css";
import "./index.css";
import "./App.css";

import {
  createAgentExperience,
  componentRegistry,
  createLocalStorageAdapter,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetInitHandle
} from "@runtypelabs/persona";

import { DynamicForm } from "./components";

componentRegistry.register("DynamicForm", DynamicForm);

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-directive`
  : `http://localhost:${proxyPort}/api/chat/dispatch-directive`;

function mountReferenceWidget(mountId: string, storageKey: string): AgentWidgetInitHandle | null {
  const mount = document.getElementById(mountId);
  if (!mount) return null;

  const config: AgentWidgetConfig = {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    storageAdapter: createLocalStorageAdapter(storageKey),
    parserType: "json",
    enableComponentStreaming: true,
    wrapComponentDirectiveInBubble: false,
    launcher: { enabled: false, width: "100%" },
    formEndpoint: "/form",
    theme: {
      ...DEFAULT_WIDGET_CONFIG.theme,
      primary: "#111827",
      accent: "#6366f1",
      surface: "#ffffff",
      muted: "#64748b"
    },
    layout: {
      ...DEFAULT_WIDGET_CONFIG.layout,
      header: { layout: "minimal", showCloseButton: false }
    },
    statusIndicator: { visible: false },
    suggestionChips: [],
    postprocessMessage: ({ text }) => markdownPostprocessor(text)
  };

  return createAgentExperience(mount, config) as AgentWidgetInitHandle;
}

type TabConfig = {
  id: string;
  mountId: string;
  storageKey: string;
  directiveId: string;
  props: Record<string, unknown>;
};

const TABS: TabConfig[] = [
  {
    id: "types",
    mountId: "field-types-mount",
    storageKey: "persona-state-form-fields-types",
    directiveId: "field-types-form",
    props: {
      title: "Every field type",
      description: "One of each — see the rendered control for each `type`.",
      fields: [
        { label: "Full Name", name: "name", type: "text", required: true },
        { label: "Email", name: "email", type: "email", required: true },
        {
          label: "Phone",
          name: "phone",
          type: "tel",
          sensitive: true,
          helper_text: "Sensitive — masked on success recap."
        },
        { label: "Website", name: "website", type: "url", placeholder: "https://…" },
        { label: "Headcount", name: "headcount", type: "number" },
        { label: "Preferred date", name: "date", type: "date" },
        { label: "Preferred time", name: "time", type: "time" },
        {
          label: "Notes",
          name: "notes",
          type: "textarea",
          placeholder: "Auto-grows up to ~140px as you type"
        }
      ],
      submit_text: "Submit"
    }
  },
  {
    id: "widths",
    mountId: "field-widths-mount",
    storageKey: "persona-state-form-fields-widths",
    directiveId: "field-widths-form",
    props: {
      title: "Width: full vs half",
      description:
        "Two consecutive half-width fields share a row. A full-width field spans the grid.",
      fields: [
        { label: "First Name", type: "text", width: "half", required: true },
        { label: "Last Name", type: "text", width: "half", required: true },
        { label: "Email", type: "email", required: true },
        { label: "City", type: "text", width: "half" },
        { label: "Postal Code", type: "text", width: "half" },
        { label: "Country", type: "text" }
      ],
      submit_text: "Save address"
    }
  },
  {
    id: "helpers",
    mountId: "field-helpers-mount",
    storageKey: "persona-state-form-fields-helpers",
    directiveId: "field-helpers-form",
    props: {
      title: "Helpers + required",
      description: "Inline guidance per field; required fields show a red *.",
      fields: [
        {
          label: "Project name",
          type: "text",
          required: true,
          helper_text: "Visible to your team only."
        },
        {
          label: "Slug",
          type: "text",
          required: true,
          helper_text: "Lowercase letters, numbers, and dashes."
        },
        {
          label: "Description",
          type: "textarea",
          helper_text: "Optional — a one-liner is fine."
        },
        { label: "Domain", type: "url", placeholder: "https://example.com" }
      ],
      submit_text: "Create project"
    }
  }
];

TABS.forEach((tab) => {
  const widget = mountReferenceWidget(tab.mountId, tab.storageKey);
  widget?.injectComponentDirective({
    id: tab.directiveId,
    component: "DynamicForm",
    text: "",
    props: tab.props
  });

  const defEl = document.getElementById(`fields-def-${tab.id}`);
  if (defEl) defEl.textContent = JSON.stringify(tab.props, null, 2);
});

setupTabs("fields-tabs");

/**
 * Minimal accessible tabs. Click or arrow-key to switch; Home/End jump to
 * first/last. All panels stay mounted (so widget state survives tab swaps);
 * we only toggle `hidden` and `aria-selected`.
 */
function setupTabs(rootId: string): void {
  const root = document.getElementById(rootId);
  if (!root) return;

  const tabs = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  );
  const panels = Array.from(
    root.querySelectorAll<HTMLElement>('[role="tabpanel"]')
  );

  function activate(tabId: string): void {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tabId === tabId;
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });
    panels.forEach((panel) => {
      const isActive = panel.dataset.tabPanel === tabId;
      panel.hidden = !isActive;
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.dataset.tabId;
      if (id) activate(id);
    });

    tab.addEventListener("keydown", (event) => {
      const idx = tabs.indexOf(tab);
      let nextIdx: number | null = null;
      if (event.key === "ArrowRight") nextIdx = (idx + 1) % tabs.length;
      else if (event.key === "ArrowLeft") nextIdx = (idx - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") nextIdx = 0;
      else if (event.key === "End") nextIdx = tabs.length - 1;
      if (nextIdx === null) return;
      event.preventDefault();
      const next = tabs[nextIdx];
      const id = next.dataset.tabId;
      if (id) {
        activate(id);
        next.focus();
      }
    });
  });
}
