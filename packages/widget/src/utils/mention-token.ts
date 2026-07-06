/**
 * Shared builder for the inline mention TOKEN — the atomic styled pill that sits
 * inside the sentence (Slack/Linear/Cursor style), used by both the contenteditable
 * composer (inline chunk) and the read-only sent bubble (`message-bubble`, core).
 *
 * The default is a tinted pill: icon + `@label`, colored by
 * `--persona-mention-token-accent` (from `ref.color`, else the theme accent), with
 * a `data-mention-source` attribute so hosts can theme per source/type in CSS
 * (`.persona-mention-token[data-mention-source="files"] { … }`). A host can replace
 * the whole element via `render` (the `renderMentionToken` config hook).
 *
 * Display-only: no document model, safe to bundle in both the core and the inline
 * chunk (a small duplicate, like other shared helpers).
 */

import { createElement, createNode, cx } from "./dom";
import { renderLucideIcon } from "./icons";
import type { AgentWidgetContextMentionRef } from "../types";

export interface AgentWidgetContextMentionTokenRenderContext {
  ref: AgentWidgetContextMentionRef;
  readonly: boolean;
}

export interface CreateMentionTokenOptions {
  /** True in the sent bubble (adds `persona-mention-token-readonly`). */
  readonly?: boolean;
  /** Full-custom token DOM (the `renderMentionToken` config hook). */
  render?: (ctx: AgentWidgetContextMentionTokenRenderContext) => HTMLElement;
}

export function createMentionTokenElement(
  ref: AgentWidgetContextMentionRef,
  opts: CreateMentionTokenOptions = {}
): HTMLElement {
  if (opts.render) return opts.render({ ref, readonly: !!opts.readonly });

  const token = createNode("span", {
    className: cx(
      "persona-mention-token",
      opts.readonly && "persona-mention-token-readonly"
    ),
    // role="img" + aria-label makes the icon + `@label` announce as one atomic
    // unit ("App.tsx mention") instead of the icon and text being read
    // separately; the resolve-status hook may later swap this label (see
    // composer-contenteditable `setMentionStatus`).
    attrs: {
      "data-mention-source": ref.sourceId,
      title: ref.label,
      role: "img",
      "aria-label": `${ref.label} mention`,
    },
  });
  // Per-item / per-type accent recolors the whole pill (bg tint + icon + text).
  if (ref.color) {
    token.style.setProperty("--persona-mention-token-accent", ref.color);
  }

  const iconEl = renderLucideIcon(ref.iconName ?? "at-sign", 13, "currentColor", 2);
  if (iconEl) {
    const iconHost = createElement("span", "persona-mention-token-icon");
    iconHost.appendChild(iconEl);
    token.appendChild(iconHost);
  }
  token.appendChild(
    createNode("span", {
      className: "persona-mention-token-label",
      text: `@${ref.label}`,
    })
  );
  return token;
}
