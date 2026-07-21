// Shared model-picker wiring for the on-device LiteRT demo pages. Every demo
// renders the same toolbar chrome (styles in ./litert-chrome.css):
//   #lr-model-select   — dropdown filled from the MODELS registry
//   #lr-load-button    — kicks off the weights download + GPU warm-up
//   #lr-status         — one-line status text
//   #lr-webgpu-warning — [hidden] warning revealed when WebGPU is missing
// A page may omit any of these; missing elements are tolerated.

import { MODELS, type LiteRtPersonaEngine, type ModelId } from "./litert-engine";

export interface WireModelLoaderOptions {
  engine: LiteRtPersonaEngine;
  /** Demo-specific tail of the "<label> ready (warmed up) — …" status line. */
  readyHint: string;
  /** Pre-selected model (default "e2b" — the fastest first impression). */
  defaultModel?: ModelId;
}

export interface ModelLoaderHandle {
  /** Write the toolbar status line (for demo-specific messages). */
  setStatus(text: string): void;
}

export function wireModelLoader(options: WireModelLoaderOptions): ModelLoaderHandle {
  const { engine, readyHint } = options;
  const modelSelect = document.querySelector<HTMLSelectElement>("#lr-model-select");
  const loadButton = document.querySelector<HTMLButtonElement>("#lr-load-button");
  const statusEl = document.querySelector<HTMLElement>("#lr-status");
  const webgpuWarning = document.querySelector<HTMLElement>("#lr-webgpu-warning");

  const setStatus = (text: string): void => {
    if (statusEl) statusEl.textContent = text;
  };

  if (modelSelect) {
    for (const id of Object.keys(MODELS) as ModelId[]) {
      const info = MODELS[id];
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `${info.label} (${info.approxSize})`;
      option.title = info.blurb;
      modelSelect.appendChild(option);
    }
    modelSelect.value = options.defaultModel ?? "e2b";
  }

  async function loadSelectedModel(): Promise<void> {
    if (!modelSelect || !loadButton) return;
    const modelId = modelSelect.value as ModelId;
    loadButton.disabled = true;
    modelSelect.disabled = true;
    // loadModel downloads the weights, then warms up the GPU with a throwaway
    // generation so the first real prompt is fast — that warm-up can take a
    // few minutes on first run. Set the expectation up front.
    setStatus(
      `Loading ${MODELS[modelId].label}… the first load downloads ${MODELS[modelId].approxSize} (cached for next time), then warms up the GPU — the first run can take a few minutes.`,
    );
    try {
      await engine.loadModel(modelId);
      setStatus(`${MODELS[modelId].label} ready (warmed up) — ${readyHint}`);
      loadButton.textContent = "Reload";
    } catch (err) {
      setStatus(`Load failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      loadButton.disabled = false;
      modelSelect.disabled = false;
    }
  }

  const webgpuSupported = typeof navigator !== "undefined" && "gpu" in navigator;
  if (!webgpuSupported) {
    webgpuWarning?.removeAttribute("hidden");
    if (loadButton) loadButton.disabled = true;
    if (modelSelect) modelSelect.disabled = true;
    setStatus("WebGPU unavailable");
  } else {
    loadButton?.addEventListener("click", () => void loadSelectedModel());
    setStatus("Pick a model and press Load to start (runs fully on-device).");
  }

  return { setStatus };
}
