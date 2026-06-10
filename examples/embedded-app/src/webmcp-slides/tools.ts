import type { DeckStore } from "./store";
import type { Deck, Slide, SlideElement, SlideLayout } from "./types";
import { SLIDE_H, SLIDE_W, clamp, makeId } from "./types";
import { THEMES, getTheme } from "./themes";

// WebMCP tool surface for the slide editor. Three tool sets share two
// AbortController owners (the calendar demo's re-registration pattern):
//
//   1. the static editing set (18 tools) — registered while mode === 'edit';
//   2. the presenter set (4 tools) — replaces the editing set wholesale while
//      mode === 'present', so the agent only sees show controls mid-show;
//   3. the selection-scoped set (2 tools) — registered only while 2+ elements
//      are selected, debounced so shift-click sprees don't thrash the registry.
//
// Every tool returns structured JSON including the ids it created or touched,
// so the model can chain calls without re-reading the deck.

const EDIT_OWNER = "__webmcpSlidesEditAbort";
const SELECTION_OWNER = "__webmcpSlidesSelectionAbort";
const SELECTION_DEBOUNCE_MS = 150;
const FLASH_MS = 1200;

declare global {
  interface Window {
    [EDIT_OWNER]?: AbortController;
    [SELECTION_OWNER]?: AbortController;
  }
}

// Only destructive or deck-wide tools raise Persona's approval bubble —
// ordinary writes (add_element, update_element, …) auto-approve so the user
// can watch the agent build slides without clicking through every step.
export const APPROVAL_REQUIRED_TOOL_NAMES = new Set([
  "delete_slide",
  "delete_elements",
  "apply_theme",
]);

export const READ_ONLY_TOOL_NAMES = new Set([
  "get_deck_overview",
  "get_slide",
  "get_selection",
  "list_themes",
  "goto_slide",
  "enter_presenter_mode",
  "next_slide",
  "prev_slide",
  "jump_to_slide",
  "exit_presenter_mode",
]);

type ToolDescriptor = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => unknown | Promise<unknown>;
};

type RegisterableModelContext = {
  registerTool: (
    tool: ToolDescriptor & { annotations?: Record<string, unknown> },
    options?: { signal?: AbortSignal },
  ) => void;
};

const getModelContext = (): RegisterableModelContext | undefined =>
  (document as unknown as { modelContext?: RegisterableModelContext })
    .modelContext ??
  (navigator as unknown as { modelContext?: RegisterableModelContext })
    .modelContext;

const toolResult = (data: unknown, summary?: string): unknown => ({
  content: [
    {
      type: "text",
      text: `${summary ? `${summary}\n\n` : ""}${JSON.stringify(data, null, 2)}`,
    },
  ],
  structuredContent: data,
});

const registerTool = (
  modelContext: RegisterableModelContext,
  tool: ToolDescriptor,
  signal: AbortSignal,
): void => {
  try {
    // The WebMCP spec carries the display title on the descriptor itself, but
    // the current @mcp-b SDK only surfaces annotations.title to consumers
    // (Persona approval bubbles, Chrome DevTools MCP) — mirror it there.
    const descriptor = tool.title
      ? { ...tool, annotations: { title: tool.title, ...tool.annotations } }
      : tool;
    modelContext.registerTool(descriptor, { signal });
  } catch (error) {
    console.warn(`[Slides] Failed to register ${tool.name}`, error);
  }
};

// ---------------------------------------------------------------------------
// Lookup + serialization helpers

const slidePosition = (deck: Deck, slideId: string): number =>
  deck.slides.findIndex((s) => s.id === slideId) + 1;

/** Resolve a slide from `slideId` or 1-based `position`; default current. */
const resolveSlide = (
  store: DeckStore,
  args: Record<string, unknown>,
): Slide => {
  if (typeof args.slideId === "string" && args.slideId) {
    const slide = store.findSlide(args.slideId);
    if (!slide) throw new Error(`No slide with id "${args.slideId}". Call get_deck_overview for valid ids.`);
    return slide;
  }
  if (typeof args.position === "number") {
    const slide = store.deck.slides[args.position - 1];
    if (!slide) throw new Error(`No slide at position ${args.position} (deck has ${store.deck.slides.length} slides).`);
    return slide;
  }
  return store.currentSlide;
};

const publicElement = (el: SlideElement): Record<string, unknown> => {
  const out: Record<string, unknown> = {
    id: el.id,
    type: el.type,
    x: el.x,
    y: el.y,
    w: el.w,
    h: el.h,
    rotation: el.rotation,
    z: el.z,
  };
  for (const key of [
    "text",
    "fontSize",
    "fontFamily",
    "fontWeight",
    "color",
    "align",
    "fill",
    "stroke",
    "strokeWidth",
    "src",
  ] as const) {
    if (el[key] !== undefined) out[key] = el[key];
  }
  return out;
};

const publicSlide = (deck: Deck, slide: Slide): Record<string, unknown> => ({
  id: slide.id,
  position: slidePosition(deck, slide.id),
  title: slide.title ?? null,
  background: slide.background ?? null,
  elements: [...slide.elements]
    .sort((a, b) => a.z - b.z)
    .map(publicElement),
});

const NUMERIC_PROPS = new Set(["x", "y", "w", "h", "rotation", "z", "fontSize", "fontWeight", "strokeWidth"]);
const STRING_PROPS = new Set(["text", "fontFamily", "color", "align", "fill", "stroke", "src"]);

const applyElementPatch = (
  el: SlideElement,
  patch: Record<string, unknown>,
): void => {
  const target = el as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    if (NUMERIC_PROPS.has(key) && typeof value === "number") {
      target[key] = value;
    } else if (STRING_PROPS.has(key) && typeof value === "string") {
      target[key] = value;
    }
  }
  el.x = clamp(Math.round(el.x), -el.w + 8, SLIDE_W - 8);
  el.y = clamp(Math.round(el.y), -el.h + 8, SLIDE_H - 8);
  el.w = Math.max(4, Math.round(el.w));
  el.h = Math.max(4, Math.round(el.h));
};

// ---------------------------------------------------------------------------
// Agent-touch affordance: the user should SEE what the agent changed. After a
// mutation we jump to the touched slide (if needed) and pulse an outline on
// the touched elements + the slide's sorter thumbnail.

const flashAgentTouch = (
  store: DeckStore,
  slideId: string,
  elementIds: string[] = [],
): void => {
  const index = store.deck.slides.findIndex((s) => s.id === slideId);
  if (index >= 0 && store.mode === "edit") store.setCurrentSlide(index);

  // Subscribers re-render synchronously inside commit()/setCurrentSlide(),
  // so the fresh nodes are already in the DOM.
  const targets: Element[] = [];
  const thumb = document.querySelector(`.wm-thumb[data-slide-id="${slideId}"]`);
  if (thumb) targets.push(thumb);
  for (const id of elementIds) {
    document
      .querySelectorAll(`.wm-canvas [data-element-id="${id}"]`)
      .forEach((node) => targets.push(node));
  }
  for (const node of targets) {
    node.classList.add("wm-agent-flash");
    window.setTimeout(() => node.classList.remove("wm-agent-flash"), FLASH_MS);
  }
};

// ---------------------------------------------------------------------------
// Slide layouts for add_slide

const layoutElements = (
  layout: SlideLayout,
  title: string,
  body: string,
): SlideElement[] => {
  const base = (overrides: Partial<SlideElement>): SlideElement => ({
    id: makeId("el"),
    type: "text",
    x: 60,
    y: 50,
    w: 840,
    h: 60,
    rotation: 0,
    z: 1,
    fontSize: 40,
    fontFamily: "theme.heading",
    fontWeight: 700,
    color: "theme.text",
    align: "left",
    text: title,
    ...overrides,
  });

  switch (layout) {
    case "title":
      return [
        base({ y: 190, h: 90, fontSize: 56, align: "center" }),
        base({
          y: 300, h: 50, fontSize: 24, fontWeight: 400,
          fontFamily: "theme.body", color: "theme.accent", align: "center",
          text: body,
        }),
      ];
    case "title-body":
      return [
        base({}),
        base({
          y: 150, h: 330, fontSize: 20, fontWeight: 400,
          fontFamily: "theme.body", text: body,
        }),
      ];
    case "two-col":
      return [
        base({}),
        base({
          y: 150, w: 400, h: 330, fontSize: 18, fontWeight: 400,
          fontFamily: "theme.body", text: body,
        }),
        base({
          x: 500, y: 150, w: 400, h: 330, fontSize: 18, fontWeight: 400,
          fontFamily: "theme.body", text: "",
        }),
      ];
    case "blank":
    default:
      return [];
  }
};

// ---------------------------------------------------------------------------
// Shared geometry for align/distribute (used by both the static id-based
// tools and the selection-scoped dynamic ones)

type Alignment = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";

const alignElements = (
  elements: SlideElement[],
  alignment: Alignment,
  relativeTo: "slide" | "selection-bounds",
): void => {
  let minX = 0;
  let minY = 0;
  let maxX = SLIDE_W;
  let maxY = SLIDE_H;
  if (relativeTo === "selection-bounds") {
    minX = Math.min(...elements.map((el) => el.x));
    minY = Math.min(...elements.map((el) => el.y));
    maxX = Math.max(...elements.map((el) => el.x + el.w));
    maxY = Math.max(...elements.map((el) => el.y + el.h));
  }
  for (const el of elements) {
    switch (alignment) {
      case "left": el.x = minX; break;
      case "center-x": el.x = Math.round(minX + (maxX - minX - el.w) / 2); break;
      case "right": el.x = maxX - el.w; break;
      case "top": el.y = minY; break;
      case "center-y": el.y = Math.round(minY + (maxY - minY - el.h) / 2); break;
      case "bottom": el.y = maxY - el.h; break;
    }
  }
};

const distributeElements = (
  elements: SlideElement[],
  axis: "horizontal" | "vertical",
): void => {
  if (elements.length < 3) {
    throw new Error("distribute needs at least 3 elements.");
  }
  const horizontal = axis === "horizontal";
  const sorted = [...elements].sort((a, b) =>
    horizontal ? a.x - b.x : a.y - b.y,
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const start = horizontal ? first.x + first.w / 2 : first.y + first.h / 2;
  const end = horizontal ? last.x + last.w / 2 : last.y + last.h / 2;
  const step = (end - start) / (sorted.length - 1);
  sorted.forEach((el, i) => {
    const center = start + step * i;
    if (horizontal) el.x = Math.round(center - el.w / 2);
    else el.y = Math.round(center - el.h / 2);
  });
};

const positionsOf = (
  elements: SlideElement[],
): { elementId: string; x: number; y: number }[] =>
  elements.map((el) => ({ elementId: el.id, x: el.x, y: el.y }));

// ---------------------------------------------------------------------------
// Schema fragments

const COLOR_DESC =
  "CSS color (e.g. '#0f172a') or a theme token: 'theme.background', 'theme.surface', 'theme.text', 'theme.accent', 'theme.accentText'. Prefer tokens so the deck restyles when the theme changes.";
const FONT_DESC =
  "Font stack, or a theme token: 'theme.heading' / 'theme.body'. Prefer tokens.";
const GEOMETRY_DESC =
  "Slide units; the canvas is 960 wide x 540 tall, origin at the top-left.";

const ELEMENT_PATCH_PROPS = {
  x: { type: "number", description: GEOMETRY_DESC },
  y: { type: "number" },
  w: { type: "number" },
  h: { type: "number" },
  rotation: { type: "number", description: "Degrees clockwise." },
  z: { type: "number", description: "Stacking order; higher renders on top." },
  text: { type: "string", description: "Text elements only. Use \\n for line breaks." },
  fontSize: { type: "number" },
  fontFamily: { type: "string", description: FONT_DESC },
  fontWeight: { type: "number", description: "400 normal, 700 bold." },
  color: { type: "string", description: COLOR_DESC },
  align: { type: "string", enum: ["left", "center", "right"] },
  fill: { type: "string", description: COLOR_DESC },
  stroke: { type: "string", description: COLOR_DESC },
  strokeWidth: { type: "number" },
  src: { type: "string", description: "Image URL, or 'placeholder' for a styled placeholder block." },
} as const;

// ---------------------------------------------------------------------------
// Static editing tool set

const buildEditingTools = (store: DeckStore): ToolDescriptor[] => [
  {
    name: "get_deck_overview",
    title: "Read deck overview",
    description:
      "Read the deck: title, active theme, slide count, and per-slide {id, position, title, elementCount}. Call this first to orient yourself; positions are 1-based.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute() {
      const data = {
        deckTitle: store.deck.title,
        themeId: store.deck.themeId,
        slideCount: store.deck.slides.length,
        currentSlide: {
          id: store.currentSlide.id,
          position: store.currentSlideIndex + 1,
        },
        slides: store.deck.slides.map((slide, i) => ({
          id: slide.id,
          position: i + 1,
          title: slide.title ?? null,
          elementCount: slide.elements.length,
        })),
      };
      return toolResult(data, `Deck "${store.deck.title}" — ${data.slideCount} slides.`);
    },
  },
  {
    name: "get_slide",
    title: "Read a slide",
    description:
      "Read one slide's full contents — every element with its id, geometry, and style. Call this before editing a slide's elements. Defaults to the slide open in the editor.",
    inputSchema: {
      type: "object",
      properties: {
        slideId: { type: "string", description: "Slide id from get_deck_overview." },
        position: { type: "number", description: "1-based slide position (alternative to slideId)." },
      },
    },
    annotations: { readOnlyHint: true },
    execute(args) {
      const slide = resolveSlide(store, args);
      return toolResult(publicSlide(store.deck, slide));
    },
  },
  {
    name: "get_selection",
    title: "Read the user's selection",
    description:
      "Read the elements the user currently has selected on the canvas: ids, types, geometry, and styles. Use this whenever the user says 'this', 'these', or refers to something they clicked.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute() {
      const selected = store.selectedElements();
      return toolResult(
        {
          slideId: store.currentSlide.id,
          slidePosition: store.currentSlideIndex + 1,
          count: selected.length,
          elements: selected.map(publicElement),
        },
        selected.length
          ? `${selected.length} element(s) selected.`
          : "Nothing is selected.",
      );
    },
  },
  {
    name: "list_themes",
    title: "List themes",
    description: "List the available deck themes with their palettes and fonts.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute() {
      return toolResult({
        activeThemeId: store.deck.themeId,
        themes: THEMES.map((t) => ({
          id: t.id,
          name: t.name,
          fonts: t.fonts,
          colors: t.colors,
        })),
      });
    },
  },
  {
    name: "goto_slide",
    title: "Go to a slide",
    description: "Open a slide in the editor (navigation only — changes nothing).",
    inputSchema: {
      type: "object",
      properties: {
        slideId: { type: "string" },
        position: { type: "number", description: "1-based slide position." },
      },
    },
    annotations: { readOnlyHint: true },
    execute(args) {
      const slide = resolveSlide(store, args);
      store.setCurrentSlide(store.deck.slides.indexOf(slide));
      return toolResult({
        slideId: slide.id,
        position: slidePosition(store.deck, slide.id),
      });
    },
  },
  {
    name: "add_slide",
    title: "Add a slide",
    description:
      "Insert a new slide from a layout. 'title' = centered title + subtitle; 'title-body' = heading + body text; 'two-col' = heading + two text columns (body fills the left, right starts empty); 'blank' = empty. Returns the new slide id and its element ids so you can refine them with update_element.",
    inputSchema: {
      type: "object",
      required: ["layout"],
      properties: {
        layout: { type: "string", enum: ["title", "title-body", "two-col", "blank"] },
        title: { type: "string", description: "Slide heading text." },
        body: { type: "string", description: "Body text. Use \\n for line breaks, • for bullets." },
        position: {
          type: "number",
          description: "1-based position to insert at; defaults to the end of the deck.",
        },
      },
    },
    execute(args) {
      const layout = String(args.layout ?? "blank") as SlideLayout;
      const title = typeof args.title === "string" ? args.title : "";
      const body = typeof args.body === "string" ? args.body : "";
      const slide: Slide = {
        id: makeId("slide"),
        title: title || `Slide ${store.deck.slides.length + 1}`,
        elements: layoutElements(layout, title, body),
      };
      const index =
        typeof args.position === "number"
          ? clamp(Math.round(args.position) - 1, 0, store.deck.slides.length)
          : store.deck.slides.length;
      store.commit((deck) => {
        deck.slides.splice(index, 0, structuredClone(slide));
      });
      flashAgentTouch(store, slide.id, slide.elements.map((el) => el.id));
      return toolResult({
        slideId: slide.id,
        position: index + 1,
        elementIds: slide.elements.map((el) => el.id),
      }, `Added slide ${index + 1} ("${slide.title}").`);
    },
  },
  {
    name: "duplicate_slide",
    title: "Duplicate a slide",
    description: "Copy a slide (and all its elements) right after the original. Returns the new slide id.",
    inputSchema: {
      type: "object",
      properties: {
        slideId: { type: "string" },
        position: { type: "number", description: "1-based position of the slide to copy." },
      },
    },
    execute(args) {
      const source = resolveSlide(store, args);
      const copy: Slide = structuredClone(source);
      copy.id = makeId("slide");
      copy.title = `${source.title ?? "Untitled"} (copy)`;
      copy.elements = copy.elements.map((el) => ({ ...el, id: makeId("el") }));
      const at = store.deck.slides.indexOf(source) + 1;
      store.commit((deck) => {
        deck.slides.splice(at, 0, structuredClone(copy));
      });
      flashAgentTouch(store, copy.id);
      return toolResult({ slideId: copy.id, position: at + 1 });
    },
  },
  {
    name: "delete_slide",
    title: "Delete a slide",
    description: "Permanently remove a slide and all its elements.",
    inputSchema: {
      type: "object",
      properties: {
        slideId: { type: "string" },
        position: { type: "number", description: "1-based slide position." },
      },
    },
    annotations: { destructiveHint: true },
    execute(args) {
      const slide = resolveSlide(store, args);
      if (store.deck.slides.length === 1) {
        throw new Error("Cannot delete the only slide in the deck.");
      }
      const position = slidePosition(store.deck, slide.id);
      store.commit((deck) => {
        deck.slides = deck.slides.filter((s) => s.id !== slide.id);
      });
      return toolResult(
        { deletedSlideId: slide.id, slideCount: store.deck.slides.length },
        `Deleted slide ${position} ("${slide.title ?? "Untitled"}").`,
      );
    },
  },
  {
    name: "reorder_slides",
    title: "Reorder slides",
    description: "Move a slide to a new 1-based position. Returns the resulting slide order.",
    inputSchema: {
      type: "object",
      required: ["slideId", "position"],
      properties: {
        slideId: { type: "string" },
        position: { type: "number", description: "1-based target position." },
      },
    },
    execute(args) {
      const slide = resolveSlide(store, { slideId: args.slideId });
      const to = clamp(
        Math.round(Number(args.position)) - 1,
        0,
        store.deck.slides.length - 1,
      );
      store.commit((deck) => {
        const from = deck.slides.findIndex((s) => s.id === slide.id);
        const [moved] = deck.slides.splice(from, 1);
        deck.slides.splice(to, 0, moved);
      });
      flashAgentTouch(store, slide.id);
      return toolResult({
        order: store.deck.slides.map((s, i) => ({
          id: s.id,
          position: i + 1,
          title: s.title ?? null,
        })),
      });
    },
  },
  {
    name: "set_slide_props",
    title: "Update slide settings",
    description: "Update a slide's title and/or background color.",
    inputSchema: {
      type: "object",
      properties: {
        slideId: { type: "string" },
        position: { type: "number", description: "1-based slide position." },
        title: { type: "string" },
        background: { type: "string", description: COLOR_DESC },
      },
    },
    execute(args) {
      const slide = resolveSlide(store, args);
      store.commit((deck) => {
        const target = deck.slides.find((s) => s.id === slide.id);
        if (!target) return;
        if (typeof args.title === "string") target.title = args.title;
        if (typeof args.background === "string") target.background = args.background;
      });
      flashAgentTouch(store, slide.id);
      const fresh = store.findSlide(slide.id);
      return toolResult({
        slideId: slide.id,
        title: fresh?.title ?? null,
        background: fresh?.background ?? null,
      });
    },
  },
  {
    name: "add_element",
    title: "Add an element",
    description:
      "Add one element (text box, rectangle, ellipse, line, or image) to a slide. Lines draw from the top-left to the bottom-right corner of their bounding box. Returns the new element id.",
    inputSchema: {
      type: "object",
      required: ["type"],
      properties: {
        slideId: {
          type: "string",
          description: "Target slide id; defaults to the slide open in the editor.",
        },
        type: { type: "string", enum: ["text", "rect", "ellipse", "line", "image"] },
        ...ELEMENT_PATCH_PROPS,
      },
    },
    execute(args) {
      const slide = resolveSlide(store, args);
      const type = String(args.type) as SlideElement["type"];
      if (!["text", "rect", "ellipse", "line", "image"].includes(type)) {
        throw new Error(`Unknown element type "${type}".`);
      }
      const el: SlideElement = {
        id: makeId("el"),
        type,
        x: 80,
        y: 80,
        w: type === "text" ? 400 : 200,
        h: type === "text" ? 50 : type === "line" ? 4 : 120,
        rotation: 0,
        z: store.nextZ(slide),
        ...(type === "text"
          ? { text: "", fontSize: 18, fontFamily: "theme.body", color: "theme.text", align: "left" as const }
          : {}),
        ...(type === "rect" || type === "ellipse" ? { fill: "theme.accent" } : {}),
        ...(type === "line" ? { stroke: "theme.text", strokeWidth: 2 } : {}),
        ...(type === "image" ? { src: "placeholder" } : {}),
      };
      applyElementPatch(el, args);
      store.commit((deck) => {
        const target = deck.slides.find((s) => s.id === slide.id);
        target?.elements.push(structuredClone(el));
      });
      flashAgentTouch(store, slide.id, [el.id]);
      return toolResult(
        {
          elementId: el.id,
          slideId: slide.id,
          bounds: { x: el.x, y: el.y, w: el.w, h: el.h },
        },
        `Added ${type} to slide ${slidePosition(store.deck, slide.id)}.`,
      );
    },
  },
  {
    name: "update_element",
    title: "Update an element",
    description:
      "Merge a partial patch into one element — position, size, text, and style in a single call. Omitted keys are unchanged. Returns the updated element.",
    inputSchema: {
      type: "object",
      required: ["elementId", "patch"],
      properties: {
        elementId: { type: "string" },
        patch: {
          type: "object",
          description: "Partial element properties to merge; omitted keys are unchanged.",
          properties: ELEMENT_PATCH_PROPS,
        },
      },
    },
    execute(args) {
      const elementId = String(args.elementId ?? "");
      const found = store.findElement(elementId);
      if (!found) {
        throw new Error(`No element with id "${elementId}". Call get_slide to list element ids.`);
      }
      const patch = (args.patch ?? {}) as Record<string, unknown>;
      store.commit((deck) => {
        for (const slide of deck.slides) {
          const el = slide.elements.find((e) => e.id === elementId);
          if (el) applyElementPatch(el, patch);
        }
      });
      flashAgentTouch(store, found.slide.id, [elementId]);
      const fresh = store.findElement(elementId);
      return toolResult(fresh ? publicElement(fresh.element) : { elementId });
    },
  },
  {
    name: "delete_elements",
    title: "Delete elements",
    description: "Permanently remove one or more elements by id.",
    inputSchema: {
      type: "object",
      required: ["elementIds"],
      properties: {
        elementIds: { type: "array", items: { type: "string" }, minItems: 1 },
      },
    },
    annotations: { destructiveHint: true },
    execute(args) {
      const ids = Array.isArray(args.elementIds)
        ? args.elementIds.map(String)
        : [];
      if (!ids.length) throw new Error("elementIds is required.");
      const touched = new Set<string>();
      store.commit((deck) => {
        for (const slide of deck.slides) {
          const before = slide.elements.length;
          slide.elements = slide.elements.filter((el) => !ids.includes(el.id));
          if (slide.elements.length !== before) touched.add(slide.id);
        }
      });
      return toolResult(
        { deletedElementIds: ids, slideIds: [...touched] },
        `Deleted ${ids.length} element(s).`,
      );
    },
  },
  {
    name: "align_elements",
    title: "Align elements",
    description:
      "Align elements to the slide or to their shared bounding box. Returns the new positions.",
    inputSchema: {
      type: "object",
      required: ["elementIds", "alignment"],
      properties: {
        elementIds: { type: "array", items: { type: "string" }, minItems: 1 },
        alignment: {
          type: "string",
          enum: ["left", "center-x", "right", "top", "center-y", "bottom"],
        },
        relativeTo: {
          type: "string",
          enum: ["slide", "selection-bounds"],
          description:
            "Default 'slide'. 'selection-bounds' aligns within the group's own bounding box.",
        },
      },
    },
    execute(args) {
      const ids = Array.isArray(args.elementIds) ? args.elementIds.map(String) : [];
      if (!ids.length) throw new Error("elementIds is required.");
      const first = store.findElement(ids[0]);
      if (!first) throw new Error(`No element with id "${ids[0]}".`);
      store.commit((deck) => {
        const slide = deck.slides.find((s) => s.id === first.slide.id);
        if (!slide) return;
        const targets = slide.elements.filter((el) => ids.includes(el.id));
        alignElements(
          targets,
          String(args.alignment) as Alignment,
          args.relativeTo === "selection-bounds" ? "selection-bounds" : "slide",
        );
      });
      flashAgentTouch(store, first.slide.id, ids);
      const fresh = store.findSlide(first.slide.id);
      return toolResult({
        positions: positionsOf(
          fresh?.elements.filter((el) => ids.includes(el.id)) ?? [],
        ),
      });
    },
  },
  {
    name: "distribute_elements",
    title: "Distribute elements",
    description:
      "Space three or more elements evenly along an axis (their first/last stay put). Returns the new positions.",
    inputSchema: {
      type: "object",
      required: ["elementIds", "axis"],
      properties: {
        elementIds: { type: "array", items: { type: "string" }, minItems: 3 },
        axis: { type: "string", enum: ["horizontal", "vertical"] },
      },
    },
    execute(args) {
      const ids = Array.isArray(args.elementIds) ? args.elementIds.map(String) : [];
      const first = store.findElement(ids[0] ?? "");
      if (!first) throw new Error("elementIds must reference existing elements.");
      store.commit((deck) => {
        const slide = deck.slides.find((s) => s.id === first.slide.id);
        if (!slide) return;
        const targets = slide.elements.filter((el) => ids.includes(el.id));
        distributeElements(
          targets,
          args.axis === "vertical" ? "vertical" : "horizontal",
        );
      });
      flashAgentTouch(store, first.slide.id, ids);
      const fresh = store.findSlide(first.slide.id);
      return toolResult({
        positions: positionsOf(
          fresh?.elements.filter((el) => ids.includes(el.id)) ?? [],
        ),
      });
    },
  },
  {
    name: "set_deck_title",
    title: "Rename the deck",
    description: "Set the deck's title.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: { title: { type: "string" } },
    },
    execute(args) {
      const title = String(args.title ?? "").trim();
      if (!title) throw new Error("title is required.");
      store.commit((deck) => {
        deck.title = title;
      });
      return toolResult({ deckTitle: title });
    },
  },
  {
    name: "apply_theme",
    title: "Apply a theme to the whole deck",
    description:
      "Switch the deck's theme. Every element using theme tokens ('theme.accent', 'theme.heading', …) restyles across ALL slides.",
    inputSchema: {
      type: "object",
      required: ["themeId"],
      properties: {
        themeId: { type: "string", description: "A theme id from list_themes." },
      },
    },
    execute(args) {
      const themeId = String(args.themeId ?? "");
      if (!THEMES.some((t) => t.id === themeId)) {
        throw new Error(
          `Unknown theme "${themeId}". Valid: ${THEMES.map((t) => t.id).join(", ")}.`,
        );
      }
      store.commit((deck) => {
        deck.themeId = themeId;
      });
      flashAgentTouch(store, store.currentSlide.id);
      return toolResult(
        { themeId, theme: getTheme(themeId).name },
        `Applied the ${getTheme(themeId).name} theme to all ${store.deck.slides.length} slides.`,
      );
    },
  },
  {
    name: "enter_presenter_mode",
    title: "Start presenting",
    description:
      "Enter full-screen presenter mode. NOTE: this replaces your editing tools with presentation controls (next_slide, prev_slide, jump_to_slide, exit_presenter_mode) until the show ends.",
    inputSchema: {
      type: "object",
      properties: {
        position: { type: "number", description: "1-based slide to start from; defaults to slide 1." },
      },
    },
    execute(args) {
      if (typeof args.position === "number") {
        store.setCurrentSlide(Math.round(args.position) - 1);
      } else {
        store.setCurrentSlide(0);
      }
      store.setMode("present");
      return toolResult({
        mode: "present",
        slidePosition: store.currentSlideIndex + 1,
        slideCount: store.deck.slides.length,
      });
    },
  },
];

// ---------------------------------------------------------------------------
// Presenter tool set (replaces the editing set while presenting)

const buildPresenterTools = (store: DeckStore): ToolDescriptor[] => {
  const state = (): Record<string, unknown> => ({
    mode: store.mode,
    slidePosition: store.currentSlideIndex + 1,
    slideCount: store.deck.slides.length,
    slideTitle: store.currentSlide.title ?? null,
  });
  return [
    {
      name: "next_slide",
      title: "Next slide",
      description: "Advance the presentation to the next slide.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute() {
        store.setCurrentSlide(store.currentSlideIndex + 1);
        return toolResult(state());
      },
    },
    {
      name: "prev_slide",
      title: "Previous slide",
      description: "Go back to the previous slide.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute() {
        store.setCurrentSlide(store.currentSlideIndex - 1);
        return toolResult(state());
      },
    },
    {
      name: "jump_to_slide",
      title: "Jump to a slide",
      description: "Jump to a 1-based slide position.",
      inputSchema: {
        type: "object",
        required: ["position"],
        properties: { position: { type: "number" } },
      },
      annotations: { readOnlyHint: true },
      execute(args) {
        store.setCurrentSlide(Math.round(Number(args.position)) - 1);
        return toolResult(state());
      },
    },
    {
      name: "exit_presenter_mode",
      title: "End the show",
      description: "Leave presenter mode and return to the editor (restores the editing tools).",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute() {
        store.setMode("edit");
        return toolResult({ mode: "edit" });
      },
    },
  ];
};

// ---------------------------------------------------------------------------
// Selection-scoped dynamic tool set — exists only while 2+ elements are
// selected. These act on the LIVE selection, so no ids are needed.

const buildSelectionTools = (store: DeckStore): ToolDescriptor[] => [
  {
    name: "style_selection",
    title: "Style the selected elements",
    description:
      "Apply shared style properties to every element the user has selected. Acts on the live selection — no ids needed.",
    inputSchema: {
      type: "object",
      required: ["patch"],
      properties: {
        patch: {
          type: "object",
          description: "Style properties to apply to all selected elements.",
          properties: {
            fontSize: { type: "number" },
            fontFamily: { type: "string", description: FONT_DESC },
            fontWeight: { type: "number" },
            color: { type: "string", description: COLOR_DESC },
            align: { type: "string", enum: ["left", "center", "right"] },
            fill: { type: "string", description: COLOR_DESC },
            stroke: { type: "string", description: COLOR_DESC },
            strokeWidth: { type: "number" },
            w: { type: "number" },
            h: { type: "number" },
          },
        },
      },
    },
    execute(args) {
      const ids = [...store.selection];
      if (ids.length < 2) throw new Error("Fewer than 2 elements are selected now.");
      const slideId = store.currentSlide.id;
      const patch = (args.patch ?? {}) as Record<string, unknown>;
      store.commit((deck) => {
        const slide = deck.slides.find((s) => s.id === slideId);
        for (const el of slide?.elements ?? []) {
          if (ids.includes(el.id)) applyElementPatch(el, patch);
        }
      });
      flashAgentTouch(store, slideId, ids);
      const fresh = store.findSlide(slideId);
      return toolResult({
        styled: fresh?.elements.filter((el) => ids.includes(el.id)).map(publicElement) ?? [],
      });
    },
  },
  {
    name: "align_selection",
    title: "Align the selected elements",
    description:
      "Align or distribute the elements the user has selected. Acts on the live selection — no ids needed.",
    inputSchema: {
      type: "object",
      properties: {
        alignment: {
          type: "string",
          enum: ["left", "center-x", "right", "top", "center-y", "bottom"],
        },
        distribute: { type: "string", enum: ["horizontal", "vertical"] },
        relativeTo: {
          type: "string",
          enum: ["slide", "selection-bounds"],
          description: "Default 'selection-bounds' (line the group up with itself).",
        },
      },
    },
    execute(args) {
      const ids = [...store.selection];
      if (ids.length < 2) throw new Error("Fewer than 2 elements are selected now.");
      if (!args.alignment && !args.distribute) {
        throw new Error("Provide alignment and/or distribute.");
      }
      const slideId = store.currentSlide.id;
      store.commit((deck) => {
        const slide = deck.slides.find((s) => s.id === slideId);
        if (!slide) return;
        const targets = slide.elements.filter((el) => ids.includes(el.id));
        if (args.alignment) {
          alignElements(
            targets,
            String(args.alignment) as Alignment,
            args.relativeTo === "slide" ? "slide" : "selection-bounds",
          );
        }
        if (args.distribute) {
          distributeElements(
            targets,
            args.distribute === "vertical" ? "vertical" : "horizontal",
          );
        }
      });
      flashAgentTouch(store, slideId, ids);
      const fresh = store.findSlide(slideId);
      return toolResult({
        positions: positionsOf(
          fresh?.elements.filter((el) => ids.includes(el.id)) ?? [],
        ),
      });
    },
  },
];

// ---------------------------------------------------------------------------
// Registration lifecycle

export const setupSlidesTools = (store: DeckStore): boolean => {
  const modelContext = getModelContext();
  if (!modelContext?.registerTool) {
    console.warn("[Slides] WebMCP unavailable — no modelContext found on this page.");
    return false;
  }

  const registerSet = (
    owner: typeof EDIT_OWNER | typeof SELECTION_OWNER,
    tools: ToolDescriptor[],
  ): void => {
    window[owner]?.abort?.();
    const controller = new AbortController();
    window[owner] = controller;
    for (const tool of tools) {
      registerTool(modelContext, tool, controller.signal);
    }
  };

  let registeredMode: "edit" | "present" | null = null;
  let selectionRegistered = false;
  let selectionTimer: number | undefined;

  const syncSelectionTools = (): void => {
    const want = store.mode === "edit" && store.selection.size >= 2;
    if (want === selectionRegistered) return;
    // Debounced: shift-click sprees and marquee-style adjustments shouldn't
    // thrash the registry (the widget re-snapshots tools every turn anyway).
    window.clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(() => {
      const stillWant = store.mode === "edit" && store.selection.size >= 2;
      if (stillWant === selectionRegistered) return;
      selectionRegistered = stillWant;
      if (stillWant) {
        registerSet(SELECTION_OWNER, buildSelectionTools(store));
      } else {
        window[SELECTION_OWNER]?.abort?.();
      }
    }, SELECTION_DEBOUNCE_MS);
  };

  const syncModeTools = (): void => {
    if (store.mode === registeredMode) return;
    registeredMode = store.mode;
    if (store.mode === "present") {
      window[SELECTION_OWNER]?.abort?.();
      selectionRegistered = false;
      registerSet(EDIT_OWNER, buildPresenterTools(store));
    } else {
      registerSet(EDIT_OWNER, buildEditingTools(store));
    }
  };

  store.subscribe(() => {
    syncModeTools();
    syncSelectionTools();
  });
  syncModeTools();
  syncSelectionTools();
  return true;
};
