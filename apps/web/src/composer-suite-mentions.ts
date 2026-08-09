/**
 * Mention sources and slash commands for the composer suite demo.
 *
 * Kept out of `composer-suite.ts` so the page module stays readable: this file
 * is only the catalog plus the `contextMentions` config factory. Every item is
 * fake and resolves in memory, so the page stays keyless.
 */

import {
  createSlashCommandsSource,
  createStaticMentionSource,
  type AgentWidgetContextMentionConfig,
  type SlashCommandDefinition,
} from "@runtypelabs/persona";

export type MentionsWiringOptions = {
  display: "chip" | "inline";
  log: (message: string, tone?: "info" | "error" | "session") => void;
  /** Injects the command list for `/help`. */
  listCommands: () => string;
};

/**
 * Five fake docs, each with a distinct `llmAppend` body so the echo's payload
 * dump shows exactly which mention rode along.
 */
const DOC_BODIES: Record<string, string> = {
  "pricing-page":
    "Pricing page: three plans. Free is 100 messages a month, Team is 29 dollars a seat, Enterprise is custom.",
  "returns-policy":
    "Returns policy: 30 days from delivery, unopened items only, refunds land 5 to 7 business days after we receive the parcel.",
  "shipping-faq":
    "Shipping FAQ: standard is 3 to 5 business days, express is next day before 2pm, we do not ship to PO boxes.",
  "api-quickstart":
    "API quickstart: create a key in the dashboard, POST to /v1/dispatch with a bearer token, read the response as server sent events.",
  "status-page":
    "Status page: all systems operational. Last incident was a 12 minute search degradation two weeks ago.",
};

export const createDocsMentionSource = (
  options: Pick<MentionsWiringOptions, "log">,
) =>
  createStaticMentionSource({
    id: "docs",
    label: "Docs",
    items: [
      {
        id: "pricing-page",
        label: "Pricing page",
        description: "Plans, seats, and billing periods",
        iconName: "dollar-sign",
      },
      {
        id: "returns-policy",
        label: "Returns policy",
        description: "Windows, conditions, and refund timing",
        iconName: "package",
      },
      {
        id: "shipping-faq",
        label: "Shipping FAQ",
        description: "Delivery speeds and exclusions",
        iconName: "truck",
      },
      {
        id: "api-quickstart",
        label: "API quickstart",
        description: "Keys, dispatch, and streaming",
        iconName: "code-xml",
      },
      {
        id: "status-page",
        label: "Status page",
        description: "Current uptime and recent incidents",
        iconName: "activity",
      },
    ],
    resolve: (item) => {
      options.log(`mention resolved: ${item.label}`);
      return { llmAppend: DOC_BODIES[item.id] ?? item.label };
    },
  });

/**
 * Three commands, one per behavior worth QA-ing next to the composer systems:
 * an expanding prompt macro, an auto-sending prompt macro, and a client action
 * that only touches the composer capability it was handed.
 */
export const buildSlashCommands = (
  options: Pick<MentionsWiringOptions, "log" | "listCommands">,
): SlashCommandDefinition[] => [
  {
    name: "summarize",
    description: "Expand a summary prompt into the draft, then edit before sending",
    iconName: "file-text",
    kind: "prompt",
    prompt:
      "Summarize everything above in five bullets, then flag anything that still needs a decision.",
  },
  {
    name: "help",
    description: "Ask what this composer can do, and send it right away",
    iconName: "info",
    kind: "prompt",
    submitOnSelect: true,
    prompt: () => {
      options.log("slash command: /help expanded and auto sent");
      return `What can this composer do? For reference, it currently offers:\n${options.listCommands()}`;
    },
  },
  {
    name: "clear",
    description: "Clear the draft without sending anything",
    iconName: "x",
    kind: "action",
    action: ({ composer }) => {
      composer.setValue("");
      options.log("slash command: /clear emptied the draft");
    },
  },
];

/** The `contextMentions` config, or undefined when the section is toggled off. */
export function buildContextMentions(
  options: MentionsWiringOptions,
): AgentWidgetContextMentionConfig {
  return {
    enabled: true,
    display: options.display,
    buttonIconName: "at-sign",
    buttonTooltipText: "Add context",
    searchPlaceholder: "Search docs…",
    sources: [createDocsMentionSource(options)],
    triggers: [
      {
        trigger: "/",
        triggerPosition: "line-start",
        // Commands take free-text args, so the query may span spaces.
        allowSpaces: true,
        showButton: false,
        searchPlaceholder: "Search commands…",
        sources: [
          createSlashCommandsSource({
            id: "commands",
            label: "Commands",
            commands: buildSlashCommands(options),
          }),
        ],
      },
    ],
    onMentionResolveError: (item, error) =>
      options.log(`mention resolve failed for ${item.label}: ${String(error)}`, "error"),
  };
}
