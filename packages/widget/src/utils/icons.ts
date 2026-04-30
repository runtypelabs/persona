import type { IconNode } from "lucide";
import {
  // ---------- Mandatory (referenced as string literals in widget source) ----------
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Bot,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Check,
  Clipboard,
  ClipboardCopy,
  Copy,
  File as FileIcon,
  FileCode,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Loader,
  LoaderCircle,
  Mic,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Square,
  ThumbsDown,
  ThumbsUp,
  Upload,
  Volume2,
  X,
  // ---------- Forms / inputs ----------
  User,
  Mail,
  Phone,
  Calendar,
  Clock,
  Building,
  MapPin,
  Lock,
  Key,
  CreditCard,
  AtSign,
  Hash,
  Globe,
  Link,
  // ---------- Status / feedback ----------
  CircleCheck,
  CircleX,
  TriangleAlert,
  Info,
  Ban,
  Shield,
  // ---------- Navigation ----------
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Ellipsis,
  EllipsisVertical,
  Menu,
  House,
  // ---------- Actions ----------
  Plus,
  Minus,
  Pencil,
  Trash,
  Trash2,
  Save,
  Download,
  Share,
  Funnel,
  Settings,
  RotateCw,
  Maximize,
  Minimize,
  // ---------- Commerce ----------
  ShoppingCart,
  ShoppingBag,
  Package,
  Truck,
  Tag,
  Gift,
  Receipt,
  Wallet,
  Store,
  DollarSign,
  Percent,
  // ---------- Media ----------
  Play,
  Pause,
  VolumeX,
  Camera,
  Image as ImageIcon,
  Film,
  Headphones,
  // ---------- Social / Comms ----------
  MessageCircle,
  MessageSquare,
  Bell,
  Heart,
  Star,
  Eye,
  EyeOff,
  Bookmark,
  // ---------- Time ----------
  CalendarDays,
  History,
  Timer,
  // ---------- Files ----------
  Folder,
  FolderOpen,
  Files,
  // ---------- Decorative ----------
  Sparkles,
  Zap,
  Sun,
  Moon,
  Flag,
} from "lucide";

/**
 * Curated registry of lucide icons available to `renderLucideIcon`.
 *
 * The widget used to do `import * as icons from "lucide"` and look up
 * icons dynamically by string. That defeated tree-shaking, so the IIFE
 * (CDN/script-tag) bundle shipped all 1640 lucide icons (~400KB of icon
 * data) regardless of which we actually used. This explicit registry
 * lets the bundler drop any icon not listed here.
 *
 * Trade-off: `renderLucideIcon(name)` is now a *closed set*. Names not
 * in this map return `null` and log a warning, exactly as a typo did
 * before. The registry is intentionally generous (~110 icons) so that
 * custom `ComponentRenderer` authors rarely hit a missing-icon dead end.
 *
 * To add icons: add a named import above and a row in `LUCIDE_ICONS`,
 * keyed by the lucide kebab-case name (matches their filename and
 * https://lucide.dev/icons).
 *
 * See `packages/widget/docs/icon-registry-shortlist.md` for the full
 * curation rationale and which icons were considered but excluded.
 */
const LUCIDE_ICONS = {
  // Mandatory
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
  // Forms / inputs
  "user": User,
  "mail": Mail,
  "phone": Phone,
  "calendar": Calendar,
  "clock": Clock,
  "building": Building,
  "map-pin": MapPin,
  "lock": Lock,
  "key": Key,
  "credit-card": CreditCard,
  "at-sign": AtSign,
  "hash": Hash,
  "globe": Globe,
  "link": Link,
  // Status / feedback
  "circle-check": CircleCheck,
  "circle-x": CircleX,
  "triangle-alert": TriangleAlert,
  "info": Info,
  "ban": Ban,
  "shield": Shield,
  // Navigation
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "external-link": ExternalLink,
  "ellipsis": Ellipsis,
  "ellipsis-vertical": EllipsisVertical,
  "menu": Menu,
  "house": House,
  // Actions
  "plus": Plus,
  "minus": Minus,
  "pencil": Pencil,
  "trash": Trash,
  "trash-2": Trash2,
  "save": Save,
  "download": Download,
  "share": Share,
  "funnel": Funnel,
  "settings": Settings,
  "rotate-cw": RotateCw,
  "maximize": Maximize,
  "minimize": Minimize,
  // Commerce
  "shopping-cart": ShoppingCart,
  "shopping-bag": ShoppingBag,
  "package": Package,
  "truck": Truck,
  "tag": Tag,
  "gift": Gift,
  "receipt": Receipt,
  "wallet": Wallet,
  "store": Store,
  "dollar-sign": DollarSign,
  "percent": Percent,
  // Media
  "play": Play,
  "pause": Pause,
  "volume-x": VolumeX,
  "camera": Camera,
  "image": ImageIcon,
  "film": Film,
  "headphones": Headphones,
  // Social / Comms
  "message-circle": MessageCircle,
  "message-square": MessageSquare,
  "bell": Bell,
  "heart": Heart,
  "star": Star,
  "eye": Eye,
  "eye-off": EyeOff,
  "bookmark": Bookmark,
  // Time
  "calendar-days": CalendarDays,
  "history": History,
  "timer": Timer,
  // Files
  "folder": Folder,
  "folder-open": FolderOpen,
  "files": Files,
  // Decorative
  "sparkles": Sparkles,
  "zap": Zap,
  "sun": Sun,
  "moon": Moon,
  "flag": Flag,
} as const satisfies Record<string, IconNode>;

/**
 * Names of lucide icons that ship with the widget. Names not in this
 * union return `null` from `renderLucideIcon` (with a console warning).
 */
export type IconName = keyof typeof LUCIDE_ICONS;

/**
 * Renders a lucide icon as an inline SVG element. Works inside Shadow
 * DOM and requires no CSS.
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
  const iconData = (LUCIDE_ICONS as Record<string, IconNode | undefined>)[iconName];
  if (!iconData) {
    console.warn(
      `Lucide icon "${iconName}" is not in the Persona registry. ` +
      `Add it to packages/widget/src/utils/icons.ts (see docs/icon-registry-shortlist.md).`
    );
    return null;
  }
  return createSvgFromIconData(iconData, size, color, strokeWidth);
};

function createSvgFromIconData(
  iconData: IconNode,
  size: number | string,
  color: string,
  strokeWidth: number
): SVGElement | null {
  if (!Array.isArray(iconData)) return null;

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

  // IconNode shape: [["path", {"d": "..."}], ["circle", {"cx": "..."}], ...]
  iconData.forEach((elementData) => {
    if (!Array.isArray(elementData) || elementData.length < 2) return;
    const tagName = elementData[0] as string;
    const attrs = elementData[1] as Record<string, string> | undefined;
    if (!attrs) return;
    const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    Object.entries(attrs).forEach(([key, value]) => {
      // Skip 'stroke' so the parent SVG's stroke attribute drives color uniformly
      if (key !== "stroke") element.setAttribute(key, String(value));
    });
    svg.appendChild(element);
  });

  return svg;
}
