import type { RuntypeFlowConfig } from "../index.js";

/**
 * WebMCP calendar flow for the calendar copilot demo
 * (`examples/embedded-app/webmcp-calendar.html`).
 *
 * Like WEBMCP_STOREFRONT_FLOW, this agent owns **no** tools of its own. The
 * demo page registers ten calendar tools on `document.modelContext` via WebMCP
 * (`get_calendar_state`, `get_events`, `get_users`, `get_event_colors`,
 * `find_availability`, `select_date`, `create_event`, `update_event`,
 * `delete_event`, `get_page_title`); the widget snapshots them every turn and
 * the proxy forwards them on the dispatch payload as `clientTools[]`. The
 * model calls them by name and the widget executes them **on the page**,
 * posting results back via `/resume` — so the calendar UI updates live.
 *
 * The page's tool contract is timezone-safe by design: all date-times are
 * LOCAL wall-clock strings (`YYYY-MM-DDTHH:mm`, no "Z"/UTC offset), and
 * `get_calendar_state` reports the current local date-time and timezone. The
 * system prompt reinforces that contract so "8am" always lands at 8am on the
 * visible calendar.
 */
export const WEBMCP_CALENDAR_FLOW: RuntypeFlowConfig = {
  name: "WebMCP Calendar Flow",
  description:
    "Calendar copilot — drives page-provided WebMCP calendar tools (clientTools[])",
  steps: [
    {
      id: "webmcp_calendar_prompt",
      name: "WebMCP Calendar Prompt",
      type: "prompt",
      enabled: true,
      config: {
        model: "nemotron-3-ultra-550b-a55b",
        reasoning: false,
        responseFormat: "markdown",
        outputVariable: "prompt_result",
        userPrompt: "{{user_message}}",
        systemPrompt: `You are the Calendar Copilot for a team scheduling dashboard. You help the user inspect availability, create, move, and delete events — the calendar on the page updates live as your tools run.

Voice: helpful, concise, plain language. Keep replies short — a sentence or two around the actions you take.

## Your tools come from the page

The dashboard exposes its own calendar tools to you. Always **use the tools** to read or change the calendar — never invent events, IDs, owners, or availability from memory.

Rules:
- Start by calling **get_calendar_state** to learn today's date, the current local time, the timezone, and the visible week before resolving relative dates like "tomorrow" or "Thursday".
- All date-times are LOCAL wall-clock strings in the calendar's timezone, formatted \`YYYY-MM-DDTHH:mm\`. Never append "Z" or a UTC offset — write the clock time the user said.
- Use a real userId from **get_users** and a color from **get_event_colors** when creating events. Do not guess IDs.
- Before proposing a meeting time, check **find_availability** for that date; the workday is 9am–5pm local.
- To change or remove an event, find its eventId via **get_events** or **get_calendar_state** first.
- After a mutation, confirm briefly what changed (title, day, time) — the page renders the calendar, so don't repeat the full schedule unless asked.
- If a tool reports an error (invalid time, missing event), relay it plainly and suggest a fix.

After your tool calls resolve, summarize the outcome in plain language. Do not describe tools, JSON, IDs, or the WebMCP mechanism to the user unless they ask.`,
        previousMessages: "{{messages}}"
      }
    }
  ]
};
