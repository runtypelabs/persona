/**
 * A shareable "slash-commands" experience.
 *
 * Self-contained factory that returns a `{ triggers: [...] }` FRAGMENT you spread
 * into `config.contextMentions` next to your `@` mention `sources`. It wires a
 * `/` channel (line-start, args-aware) whose source is the in-package
 * `createSlashCommandsSource`. Depends ONLY on `@runtypelabs/persona`, so you can
 * copy this file into any project (or publish it) and wire it in one line:
 *
 * ```ts
 * initAgentWidget({
 *   contextMentions: {
 *     enabled: true,
 *     sources: [ ...myMentionSources ],           // @ context (nouns)
 *     ...createSlashCommandsExperience({          // / commands (verbs)
 *       commands: [
 *         { name: "summarize", kind: "prompt", prompt: "Please summarize.", submitOnSelect: true },
 *         { name: "clear", kind: "action", action: () => controller.clearChat() },
 *         { name: "lookup", kind: "server", data: (args) => ({ query: args }) },
 *       ],
 *     }),
 *   },
 * });
 * ```
 *
 * Like the mentions experience, this is a config factory — the widget's plugin
 * registry is render-only and cannot carry sources/config.
 */
import {
  createSlashCommandsSource,
  type AgentWidgetMentionTriggerChannel,
  type AgentWidgetMentionTriggerPosition,
  type SlashCommandDefinition,
} from "@runtypelabs/persona";

export interface SlashCommandsExperienceOptions {
  /** The commands to expose. */
  commands: SlashCommandDefinition[];
  /** Trigger character. @default "/" */
  trigger?: string;
  /** Where the trigger may open. @default "line-start" */
  triggerPosition?: AgentWidgetMentionTriggerPosition;
  /** Group header + source label shown in the menu. @default "Commands" */
  label?: string;
  /** Source id (namespaces server-command context under this key). @default "commands" */
  sourceId?: string;
  /** Show a composer affordance button for the `/` channel. @default false (typed-trigger only) */
  showButton?: boolean;
  /** Icon for the affordance button (when shown). */
  buttonIconName?: string;
  /** Tooltip for the affordance button (when shown). @default "Commands" */
  buttonTooltipText?: string;
  /** Picker search-field placeholder. @default "Search commands…" */
  searchPlaceholder?: string;
}

/**
 * Build a `{ triggers: [channel] }` fragment for `config.contextMentions`. Spread
 * it alongside your `@` config; the `/` channel is args-aware (`allowSpaces`) so
 * `/deploy staging` reaches the command as `args: "staging"`.
 */
export function createSlashCommandsExperience(
  opts: SlashCommandsExperienceOptions
): { triggers: AgentWidgetMentionTriggerChannel[] } {
  const channel: AgentWidgetMentionTriggerChannel = {
    trigger: opts.trigger ?? "/",
    triggerPosition: opts.triggerPosition ?? "line-start",
    // Slash commands take multi-word args, so the query may span spaces.
    allowSpaces: true,
    showButton: opts.showButton ?? false,
    buttonIconName: opts.buttonIconName,
    buttonTooltipText: opts.buttonTooltipText ?? "Commands",
    searchPlaceholder: opts.searchPlaceholder ?? "Search commands…",
    sources: [
      createSlashCommandsSource({
        id: opts.sourceId ?? "commands",
        label: opts.label ?? "Commands",
        commands: opts.commands,
      }),
    ],
  };
  return { triggers: [channel] };
}
