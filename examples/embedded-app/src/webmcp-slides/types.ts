// Data model for the WebMCP slide-deck editor demo. All element geometry is in
// logical slide units on a fixed 960x540 stage — the canvas scales the stage
// with a CSS transform, so coordinates never depend on viewport size.

export const SLIDE_W = 960;
export const SLIDE_H = 540;

export type ElementType = "text" | "rect" | "ellipse" | "line" | "image";

export type SlideElement = {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees clockwise. */
  rotation: number;
  z: number;
  // Text props
  text?: string;
  fontSize?: number;
  /** Literal font stack or a theme token: 'theme.heading' | 'theme.body'. */
  fontFamily?: string;
  fontWeight?: number;
  /** Literal CSS color or a theme token like 'theme.text' / 'theme.accent'. */
  color?: string;
  align?: "left" | "center" | "right";
  // Shape props (rect/ellipse/line)
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  // Image props
  /** Image URL, or 'placeholder' for a styled placeholder block. */
  src?: string;
};

export type Slide = {
  id: string;
  title?: string;
  /** Literal CSS color or theme token; defaults to 'theme.background'. */
  background?: string;
  elements: SlideElement[];
};

export type Deck = {
  id: string;
  title: string;
  themeId: string;
  slides: Slide[];
};

export type Theme = {
  id: string;
  name: string;
  fonts: { heading: string; body: string };
  colors: {
    background: string;
    surface: string;
    text: string;
    accent: string;
    accentText: string;
  };
};

export type SlideLayout = "title" | "title-body" | "two-col" | "blank";

let idCounter = 0;

/** Short unique id, readable in tool output (e.g. "el-kf3a9x-7"). */
export const makeId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
