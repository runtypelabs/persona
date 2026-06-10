import type { Deck, Slide, SlideElement } from "./types";
import { clamp, makeId } from "./types";

const STORAGE_KEY = "persona-webmcp-slides-v1";
const UNDO_CAP = 100;
const PERSIST_DEBOUNCE_MS = 400;

export type EditorMode = "edit" | "present";

export type FindElementResult = { slide: Slide; element: SlideElement };

/**
 * Single source of truth for the deck, shared by human gestures and agent
 * tools. Undo is a snapshot stack: `commit()` clones the deck, applies the
 * mutator, and pushes the previous deck — decks are a few KB of JSON so
 * snapshots are effectively free and trivially correct, and because tools and
 * UI handlers go through the same `commit()`, Cmd+Z reverses agent edits too.
 *
 * Selection, current slide, and mode are UI state outside the undo stack;
 * they're re-clamped after undo/redo so they never dangle.
 */
export class DeckStore {
  deck: Deck;
  currentSlideIndex = 0;
  selection = new Set<string>();
  mode: EditorMode = "edit";

  private undoStack: Deck[] = [];
  private redoStack: Deck[] = [];
  private listeners = new Set<(store: DeckStore) => void>();
  private persistTimer: number | undefined;

  constructor(seed: () => Deck) {
    this.deck = loadDeck() ?? seed();
  }

  get currentSlide(): Slide {
    return this.deck.slides[this.currentSlideIndex];
  }

  subscribe(listener: (store: DeckStore) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** All mutations — human or agent — enter here. One call = one undo step. */
  commit(mutate: (deck: Deck) => void): void {
    const previous = structuredClone(this.deck);
    const next = structuredClone(this.deck);
    mutate(next);
    this.undoStack.push(previous);
    if (this.undoStack.length > UNDO_CAP) this.undoStack.shift();
    this.redoStack = [];
    this.deck = next;
    this.afterChange();
  }

  undo(): boolean {
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push(this.deck);
    this.deck = previous;
    this.afterChange();
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.deck);
    this.deck = next;
    this.afterChange();
    return true;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  setSelection(ids: string[]): void {
    const valid = new Set(this.currentSlide.elements.map((el) => el.id));
    this.selection = new Set(ids.filter((id) => valid.has(id)));
    this.notify();
  }

  toggleSelected(id: string): void {
    if (this.selection.has(id)) {
      this.selection.delete(id);
    } else if (this.currentSlide.elements.some((el) => el.id === id)) {
      this.selection.add(id);
    }
    this.notify();
  }

  setCurrentSlide(index: number): void {
    const next = clamp(index, 0, this.deck.slides.length - 1);
    if (next === this.currentSlideIndex) return;
    this.currentSlideIndex = next;
    this.selection.clear();
    this.notify();
  }

  setMode(mode: EditorMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === "present") this.selection.clear();
    this.notify();
  }

  findSlide(slideId: string): Slide | undefined {
    return this.deck.slides.find((s) => s.id === slideId);
  }

  findElement(elementId: string): FindElementResult | undefined {
    for (const slide of this.deck.slides) {
      const element = slide.elements.find((el) => el.id === elementId);
      if (element) return { slide, element };
    }
    return undefined;
  }

  selectedElements(): SlideElement[] {
    return this.currentSlide.elements.filter((el) => this.selection.has(el.id));
  }

  nextZ(slide: Slide): number {
    return slide.elements.reduce((max, el) => Math.max(max, el.z), 0) + 1;
  }

  resetDeck(seed: () => Deck): void {
    this.deck = seed();
    this.undoStack = [];
    this.redoStack = [];
    this.currentSlideIndex = 0;
    this.selection.clear();
    this.afterChange();
  }

  private afterChange(): void {
    this.currentSlideIndex = clamp(
      this.currentSlideIndex,
      0,
      this.deck.slides.length - 1,
    );
    const valid = new Set(this.currentSlide.elements.map((el) => el.id));
    this.selection = new Set([...this.selection].filter((id) => valid.has(id)));
    this.schedulePersist();
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this));
  }

  private schedulePersist(): void {
    window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.deck));
      } catch {
        // Storage may be unavailable (private mode, quota) — demo keeps working.
      }
    }, PERSIST_DEBOUNCE_MS);
  }
}

const loadDeck = (): Deck | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const deck = JSON.parse(raw) as Deck;
    if (!deck?.slides?.length) return null;
    return deck;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Seed deck — a fictional startup pitch so demo prompts have material.

const text = (
  props: Partial<SlideElement> & Pick<SlideElement, "x" | "y" | "w" | "h">,
): SlideElement => ({
  id: makeId("el"),
  type: "text",
  rotation: 0,
  z: 1,
  fontSize: 18,
  fontFamily: "theme.body",
  color: "theme.text",
  align: "left",
  text: "",
  ...props,
});

const shape = (
  type: SlideElement["type"],
  props: Partial<SlideElement> & Pick<SlideElement, "x" | "y" | "w" | "h">,
): SlideElement => ({
  id: makeId("el"),
  type,
  rotation: 0,
  z: 0,
  fill: "theme.accent",
  ...props,
});

export const createSeedDeck = (): Deck => ({
  id: makeId("deck"),
  title: "Lumen Labs — Seed Pitch",
  themeId: "paper",
  slides: [
    {
      id: makeId("slide"),
      title: "Title",
      elements: [
        shape("rect", { x: 0, y: 430, w: 960, h: 110, fill: "theme.accent", z: 0 }),
        text({
          x: 80, y: 170, w: 800, h: 90,
          text: "Lumen Labs",
          fontSize: 64, fontFamily: "theme.heading", fontWeight: 700, align: "center",
        }),
        text({
          x: 160, y: 280, w: 640, h: 40,
          text: "Daylight analytics for commercial buildings",
          fontSize: 24, color: "theme.accent", align: "center",
        }),
      ],
    },
    {
      id: makeId("slide"),
      title: "Problem",
      elements: [
        text({
          x: 60, y: 50, w: 840, h: 60,
          text: "Buildings waste light",
          fontSize: 40, fontFamily: "theme.heading", fontWeight: 700,
        }),
        text({
          x: 60, y: 150, w: 500, h: 280, fontSize: 20,
          text: "Commercial buildings spend 17% of their energy budget on lighting — most of it during daylight hours.\n\nFacility teams have no per-room visibility into natural light, so fixtures run at full power all day.",
        }),
        shape("ellipse", { x: 640, y: 170, w: 240, h: 240, fill: "theme.accent" }),
        text({
          x: 640, y: 260, w: 240, h: 60,
          text: "17%", fontSize: 48, fontWeight: 700,
          color: "theme.accentText", align: "center", z: 2,
        }),
      ],
    },
    {
      id: makeId("slide"),
      title: "Solution",
      elements: [
        text({
          x: 60, y: 50, w: 840, h: 60,
          text: "Sense the daylight, dim the grid",
          fontSize: 40, fontFamily: "theme.heading", fontWeight: 700,
        }),
        shape("rect", { x: 60, y: 160, w: 260, h: 240, fill: "theme.surface", stroke: "theme.accent", strokeWidth: 2 }),
        text({ x: 80, y: 180, w: 220, h: 40, text: "Sensors", fontSize: 22, fontWeight: 700, color: "theme.accent", z: 2 }),
        text({ x: 80, y: 230, w: 220, h: 150, fontSize: 16, text: "Peel-and-stick lux sensors, 5-year battery, zero wiring.", z: 2 }),
        shape("rect", { x: 350, y: 160, w: 260, h: 240, fill: "theme.surface", stroke: "theme.accent", strokeWidth: 2 }),
        text({ x: 370, y: 180, w: 220, h: 40, text: "Platform", fontSize: 22, fontWeight: 700, color: "theme.accent", z: 2 }),
        text({ x: 370, y: 230, w: 220, h: 150, fontSize: 16, text: "Room-level daylight maps with dimming recommendations.", z: 2 }),
        shape("rect", { x: 640, y: 160, w: 260, h: 240, fill: "theme.surface", stroke: "theme.accent", strokeWidth: 2 }),
        text({ x: 660, y: 180, w: 220, h: 40, text: "Savings", fontSize: 22, fontWeight: 700, color: "theme.accent", z: 2 }),
        text({ x: 660, y: 230, w: 220, h: 150, fontSize: 16, text: "Cuts lighting spend 30-40% with no fixture replacement.", z: 2 }),
      ],
    },
    {
      id: makeId("slide"),
      title: "Market",
      elements: [
        text({
          x: 60, y: 50, w: 840, h: 60,
          text: "A $14B retrofit market",
          fontSize: 40, fontFamily: "theme.heading", fontWeight: 700,
        }),
        shape("rect", { x: 100, y: 360, w: 140, h: 80, fill: "theme.accent" }),
        shape("rect", { x: 300, y: 280, w: 140, h: 160, fill: "theme.accent" }),
        shape("rect", { x: 500, y: 200, w: 140, h: 240, fill: "theme.accent" }),
        text({ x: 100, y: 460, w: 140, h: 30, text: "2024", fontSize: 16, align: "center" }),
        text({ x: 300, y: 460, w: 140, h: 30, text: "2026", fontSize: 16, align: "center" }),
        text({ x: 500, y: 460, w: 140, h: 30, text: "2028", fontSize: 16, align: "center" }),
        text({
          x: 680, y: 220, w: 220, h: 180, fontSize: 18,
          text: "Lighting retrofits grow 18% YoY as energy codes tighten across the US and EU.",
        }),
      ],
    },
    {
      id: makeId("slide"),
      title: "The Ask",
      elements: [
        text({
          x: 60, y: 50, w: 840, h: 60,
          text: "Raising $2.5M seed",
          fontSize: 40, fontFamily: "theme.heading", fontWeight: 700,
        }),
        text({
          x: 60, y: 160, w: 520, h: 240, fontSize: 20,
          text: "• 12 pilot buildings signed, 3 paying\n• $180k ARR, 9 months runway\n• Funds: 2 firmware engineers, UL certification, 50-building rollout",
        }),
        shape("rect", { x: 640, y: 160, w: 260, h: 240, fill: "theme.accent" }),
        text({
          x: 660, y: 230, w: 220, h: 110,
          text: "hello@lumenlabs.example", fontSize: 18,
          color: "theme.accentText", align: "center", z: 2,
        }),
      ],
    },
  ],
});
