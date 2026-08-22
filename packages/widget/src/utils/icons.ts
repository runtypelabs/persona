import type { IconNode } from "lucide";
import { renderIconNode } from "./icon-node";
import { loadIconsExtra } from "../icons-extra-loader";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  AtSign,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clipboard,
  ClipboardCopy,
  CodeXml,
  Copy,
  Download,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  Eye,
  File as FileIcon,
  FileCode,
  FileSpreadsheet,
  FileText,
  History,
  ImagePlus,
  Loader,
  LoaderCircle,
  Maximize,
  Menu,
  MessageSquare,
  Mic,
  Minimize,
  Minus,
  PanelLeft,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Square,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide";

/**
 * Curated icon registry for `renderLucideIcon` (host-suppliable name strings).
 *
 * Two tiers keep the payload honest:
 *  - CORE (55 names, below): every name the widget itself can emit —
 *    config DEFAULTS (bot, send, mic, x, …) plus the chrome names routed
 *    through `utils/buttons` / `utils/dropdown`. Always resolves synchronously.
 *  - EXTRA (63 names, `src/icons-extra.ts`): the config-only tail
 *    (forms, commerce, media, …). The DATA ships in the lazy `icons-extra.js`
 *    sibling chunk; the first request for one of these names kicks the fetch
 *    and returns a correctly-sized empty placeholder SVG that fills in place
 *    when the chunk lands. Surfaces that clone/morph rendered icons should
 *    subscribe to `onExtraIconsReady` and re-render (ui.ts does this for the
 *    transcript, mirroring the markdown-parsers heal).
 *
 * Statically-known icons in widget code do NOT use this registry: they import
 * icon data directly and call `renderIconNode` (see utils/icon-node.ts).
 *
 * Hosts can extend the registry with custom or non-curated lucide icons via
 * `registerIcons` (public API).
 *
 * See `packages/widget/docs/icon-registry-shortlist.md` for curation rationale.
 */
const CORE_LUCIDE_ICONS = {
  "activity": Activity,
  "arrow-down": ArrowDown,
  "arrow-up": ArrowUp,
  "arrow-up-right": ArrowUpRight,
  "bot": Bot,
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  "chevron-right": ChevronRight,
  "chevron-left": ChevronLeft,
  "check": Check,
  "clipboard": Clipboard,
  "clipboard-copy": ClipboardCopy,
  "code-xml": CodeXml,
  "copy": Copy,
  "file": FileIcon,
  "file-code": FileCode,
  "file-spreadsheet": FileSpreadsheet,
  "file-text": FileText,
  "image-plus": ImagePlus,
  "loader": Loader,
  "loader-circle": LoaderCircle,
  "mic": Mic,
  "paperclip": Paperclip,
  "refresh-cw": RefreshCw,
  "search": Search,
  "send": Send,
  "shield-alert": ShieldAlert,
  "shield-check": ShieldCheck,
  "shield-x": ShieldX,
  "square": Square,
  "thumbs-down": ThumbsDown,
  "thumbs-up": ThumbsUp,
  "upload": Upload,
  "volume-2": Volume2,
  "x": X,
  "at-sign": AtSign,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "external-link": ExternalLink,
  "ellipsis": Ellipsis,
  "ellipsis-vertical": EllipsisVertical,
  "menu": Menu,
  "panel-left": PanelLeft,
  "plus": Plus,
  "minus": Minus,
  "pencil": Pencil,
  "trash": Trash,
  "trash-2": Trash2,
  "download": Download,
  "maximize": Maximize,
  "minimize": Minimize,
  "message-square": MessageSquare,
  "star": Star,
  "eye": Eye,
  "history": History,
} as const satisfies Record<string, IconNode>;

/**
 * Names whose data lives in the lazy icons-extra chunk. Kept as a runtime
 * list (~0.8 kB) so an unknown-name typo warns immediately instead of
 * triggering a pointless chunk fetch. MUST stay in sync with the keys of
 * `EXTRA_LUCIDE_ICONS` in `src/icons-extra.ts` (asserted by
 * `icons-partition.test.ts`).
 */
export const EXTRA_ICON_NAMES = [
  "user",
  "mail",
  "phone",
  "calendar",
  "clock",
  "building",
  "map-pin",
  "lock",
  "key",
  "credit-card",
  "hash",
  "globe",
  "link",
  "circle-check",
  "circle-x",
  "triangle-alert",
  "info",
  "ban",
  "shield",
  "house",
  "pen-line",
  "save",
  "share",
  "funnel",
  "settings",
  "rotate-cw",
  "shopping-cart",
  "shopping-bag",
  "package",
  "truck",
  "tag",
  "gift",
  "receipt",
  "wallet",
  "store",
  "dollar-sign",
  "percent",
  "play",
  "pause",
  "volume-x",
  "camera",
  "image",
  "film",
  "headphones",
  "message-circle",
  "bell",
  "heart",
  "eye-off",
  "bookmark",
  "calendar-days",
  "timer",
  "folder",
  "folder-open",
  "files",
  "chart-column",
  "sparkles",
  "zap",
  "sun",
  "moon",
  "flag",
  "lightbulb",
  "monitor",
  "smartphone",
] as const;

/**
 * Names of lucide icons that ship with the widget (core + lazy extra). Names
 * not in this union return `null` from `renderLucideIcon` (with a console
 * warning) unless first added via `registerIcons`.
 */
export type IconName =
  | keyof typeof CORE_LUCIDE_ICONS
  | (typeof EXTRA_ICON_NAMES)[number];

/** Runtime registry: core map + lazily-registered extra/custom icons. */
const runtimeIcons = new Map<string, IconNode>(
  Object.entries(CORE_LUCIDE_ICONS)
);

// ---------------------------------------------------------------------------
// Extra-chunk heal machinery: placeholders fill in place; cloning surfaces
// re-render via onExtraIconsReady.
// ---------------------------------------------------------------------------

type PendingIcon = {
  el: SVGElement;
  name: string;
  size: number | string;
  color: string;
  strokeWidth: number;
};
const pendingIcons = new Set<PendingIcon>();

let extraIconsLoaded = false;
const extraReadySubscribers = new Set<() => void>();

const notifyExtraIconsReady = (): void => {
  // Snapshot + clear: fire-once semantics (mirrors onMarkdownParsersReady).
  const subs = [...extraReadySubscribers];
  extraReadySubscribers.clear();
  for (const cb of subs) {
    try {
      cb();
    } catch {
      /* one bad subscriber must not starve the others */
    }
  }
};

/**
 * Register `cb` to run once the icons-extra chunk has been adopted (or
 * `registerIcons` supplied names that were pending). For surfaces whose
 * rendered icons get CLONED (fingerprint cache + idiomorph): a clone of a
 * pending placeholder never self-fills, so those surfaces must re-render.
 * Subscribing is passive — it never kicks the fetch (the first extra-name
 * render does). No-op when the extra icons are already registered.
 */
export const onExtraIconsReady = (cb: () => void): (() => void) => {
  if (extraIconsLoaded) return () => {};
  extraReadySubscribers.add(cb);
  return () => {
    extraReadySubscribers.delete(cb);
  };
};

const fillPendingIcons = (): void => {
  for (const pending of [...pendingIcons]) {
    const data = runtimeIcons.get(pending.name);
    if (!data) continue;
    pendingIcons.delete(pending);
    const real = renderIconNode(data, pending.size, pending.color, pending.strokeWidth);
    if (!real) continue;
    // Fill IN PLACE: the placeholder already carries the correct svg attrs,
    // so adopting the real children swaps nothing the layout depends on.
    pending.el.removeAttribute("data-persona-icon-pending");
    while (real.firstChild) pending.el.appendChild(real.firstChild);
  }
};

/**
 * Extend the registry at runtime with custom icons (or non-curated lucide
 * data). Later registrations win. Pending placeholders for the added names
 * fill immediately. Public API.
 */
export const registerIcons = (icons: Record<string, IconNode>): void => {
  for (const [name, data] of Object.entries(icons)) {
    runtimeIcons.set(name, data);
  }
  fillPendingIcons();
};

let extraIconsKickFailedRetry = false;
const kickExtraIcons = (): void => {
  void loadIconsExtra()
    .then((mod) => {
      if (extraIconsLoaded) return;
      for (const [name, data] of Object.entries(mod.EXTRA_LUCIDE_ICONS)) {
        runtimeIcons.set(name, data);
      }
      extraIconsLoaded = true;
      fillPendingIcons();
      notifyExtraIconsReady();
    })
    .catch(() => {
      // Failed fetch (ad blocker, offline): placeholders stay empty; the next
      // extra-name render retries via the chunk loader's rejection-retry.
      extraIconsKickFailedRetry = true;
    });
};

const createPlaceholderSvg = (
  size: number | string,
  color: string,
  strokeWidth: number
): SVGElement => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", color);
  svg.setAttribute("stroke-width", String(strokeWidth));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("data-persona-icon-pending", "true");
  return svg;
};

/**
 * Renders a lucide icon as an inline SVG element. Works inside Shadow
 * DOM and requires no CSS.
 *
 * Core names resolve synchronously. Extra-tier names (see EXTRA_ICON_NAMES)
 * return a correctly-sized empty placeholder on first use and fill in place
 * once the lazy icons-extra chunk lands. Unknown names return `null` and log
 * a warning.
 *
 * @param iconName - A lucide kebab-case name from the registry. See
 *   `IconName` for the full list, or `docs/icon-registry-shortlist.md`
 *   for rationale.
 * @param size - The size in pixels (number) or any CSS length string.
 * @param color - Stroke color (default: "currentColor").
 * @param strokeWidth - Stroke width (default: 2).
 * @returns SVGElement, or null if the name is not in the registry.
 */
export const renderLucideIcon = (
  iconName: IconName | (string & {}),
  size: number | string = 24,
  color: string = "currentColor",
  strokeWidth: number = 2
): SVGElement | null => {
  const iconData = runtimeIcons.get(iconName);
  if (iconData) return renderIconNode(iconData, size, color, strokeWidth);

  if ((EXTRA_ICON_NAMES as readonly string[]).includes(iconName)) {
    if (extraIconsKickFailedRetry) extraIconsKickFailedRetry = false;
    const el = createPlaceholderSvg(size, color, strokeWidth);
    pendingIcons.add({ el, name: iconName, size, color, strokeWidth });
    kickExtraIcons();
    return el;
  }

  console.warn(
    `Lucide icon "${iconName}" is not in the Persona registry. ` +
    `Register it via registerIcons(), or add it to packages/widget/src/utils/icons.ts ` +
    `(see docs/icon-registry-shortlist.md).`
  );
  return null;
};
