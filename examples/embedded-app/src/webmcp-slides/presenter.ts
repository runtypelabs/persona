import type { DeckStore } from "./store";
import { SLIDE_H, SLIDE_W } from "./types";
import { getTheme } from "./themes";
import { renderSlide } from "./render";

// Presenter mode: a full-viewport overlay reusing the pure renderSlide().
// Entering/leaving flips store.mode, which also swaps the WebMCP tool set
// (see tools.ts) — the agent can drive the show with next/prev/jump tools.

export const createPresenter = (store: DeckStore): void => {
  let overlay: HTMLElement | null = null;

  const renderCurrent = (): void => {
    if (!overlay) return;
    const frame = overlay.querySelector<HTMLElement>(".wm-present-frame");
    const counter = overlay.querySelector<HTMLElement>(".wm-present-counter");
    if (!frame || !counter) return;
    frame.innerHTML = "";
    const slide = renderSlide(store.currentSlide, getTheme(store.deck.themeId));
    const scale = Math.min(
      window.innerWidth / SLIDE_W,
      window.innerHeight / SLIDE_H,
    );
    slide.style.transform = `scale(${scale})`;
    slide.style.transformOrigin = "center center";
    frame.appendChild(slide);
    counter.textContent = `${store.currentSlideIndex + 1} / ${store.deck.slides.length}`;
  };

  const onKey = (event: KeyboardEvent): void => {
    if (store.mode !== "present") return;
    if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
      event.preventDefault();
      store.setCurrentSlide(store.currentSlideIndex + 1);
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      store.setCurrentSlide(store.currentSlideIndex - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      store.setMode("edit");
    }
  };

  const open = (): void => {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "wm-present-overlay";
    overlay.innerHTML = `
      <div class="wm-present-frame"></div>
      <div class="wm-present-bar">
        <span class="wm-present-counter"></span>
        <span class="wm-present-hint">← → to navigate · Esc to exit</span>
        <button type="button" class="wm-present-exit">Exit</button>
      </div>`;
    overlay
      .querySelector(".wm-present-exit")
      ?.addEventListener("click", () => store.setMode("edit"));
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", renderCurrent);
    renderCurrent();
  };

  const close = (): void => {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", renderCurrent);
  };

  store.subscribe(() => {
    if (store.mode === "present") {
      open();
      renderCurrent();
    } else {
      close();
    }
  });
};
