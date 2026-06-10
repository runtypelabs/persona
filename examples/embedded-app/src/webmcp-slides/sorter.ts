import type { DeckStore } from "./store";
import { SLIDE_H, SLIDE_W, makeId } from "./types";
import { getTheme } from "./themes";
import { renderSlide } from "./render";

// Slide sorter rail: scaled-down thumbnails rendered with the same pure
// renderSlide() the canvas uses, so thumbnails are always pixel-faithful.
// Reordering is via per-slide up/down buttons (drag-reorder is intentionally
// out of scope — the agent's reorder_slides tool covers the rich case).

const THUMB_SCALE = 0.16;

export const createSorter = (
  store: DeckStore,
  container: HTMLElement,
): void => {
  container.classList.add("wm-sorter");

  const moveSlide = (from: number, to: number): void => {
    if (to < 0 || to >= store.deck.slides.length) return;
    store.commit((deck) => {
      const [slide] = deck.slides.splice(from, 1);
      deck.slides.splice(to, 0, slide);
    });
    store.setCurrentSlide(to);
  };

  const render = (): void => {
    const theme = getTheme(store.deck.themeId);
    container.innerHTML = "";

    store.deck.slides.forEach((slide, index) => {
      const item = document.createElement("div");
      item.className = "wm-thumb";
      item.dataset.slideId = slide.id;
      if (index === store.currentSlideIndex) item.classList.add("is-current");

      const frame = document.createElement("div");
      frame.className = "wm-thumb-frame";
      frame.style.width = `${SLIDE_W * THUMB_SCALE}px`;
      frame.style.height = `${SLIDE_H * THUMB_SCALE}px`;
      const inner = renderSlide(slide, theme);
      inner.style.transform = `scale(${THUMB_SCALE})`;
      inner.style.transformOrigin = "top left";
      frame.appendChild(inner);

      const label = document.createElement("div");
      label.className = "wm-thumb-label";
      label.textContent = `${index + 1}. ${slide.title ?? "Untitled"}`;

      const actions = document.createElement("div");
      actions.className = "wm-thumb-actions";
      const up = document.createElement("button");
      up.type = "button";
      up.textContent = "↑";
      up.title = "Move slide up";
      up.disabled = index === 0;
      up.addEventListener("click", (event) => {
        event.stopPropagation();
        moveSlide(index, index - 1);
      });
      const down = document.createElement("button");
      down.type = "button";
      down.textContent = "↓";
      down.title = "Move slide down";
      down.disabled = index === store.deck.slides.length - 1;
      down.addEventListener("click", (event) => {
        event.stopPropagation();
        moveSlide(index, index + 1);
      });
      actions.append(up, down);

      item.append(frame, label, actions);
      item.addEventListener("click", () => store.setCurrentSlide(index));
      container.appendChild(item);
    });

    const add = document.createElement("button");
    add.type = "button";
    add.className = "wm-thumb-add";
    add.textContent = "+ New slide";
    add.addEventListener("click", () => {
      store.commit((deck) => {
        deck.slides.push({
          id: makeId("slide"),
          title: `Slide ${deck.slides.length + 1}`,
          elements: [],
        });
      });
      store.setCurrentSlide(store.deck.slides.length - 1);
    });
    container.appendChild(add);
  };

  store.subscribe(render);
  render();
};
