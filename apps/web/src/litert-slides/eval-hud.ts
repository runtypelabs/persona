// Eval HUD: a small instrumentation panel for judging how well on-device Gemma 4
// drives the page's WebMCP tools. It subscribes to the engine's MetricEvent
// stream and renders model-load, latency, throughput, and tool-call stats. Pure
// DOM, no deps — styles live in litert-slides.css (`.lr-hud*`).

import type { MetricEvent, ModelId, WeightsPhase } from "./litert-engine";
import { MODELS } from "./litert-engine";

const fmtMs = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
const fmtBytes = (n: number): string => {
  if (n <= 0) return "—";
  const mb = n / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
};

interface Stats {
  modelId: ModelId | null;
  loadMs: number | null;
  loadReceived: number;
  loadTotal: number;
  loading: boolean;
  loadPhase: WeightsPhase;
  loadError: string | null;
  fromCache: boolean;
  warming: boolean;
  warmupMs: number | null;
  // Per last turn
  lastTtft: number | null;
  lastTokensPerSec: number | null;
  lastTurnMs: number | null;
  // Aggregates
  runs: number;
  turns: number;
  toolCalls: number;
  toolCallsPerRun: number;
  tpsSamples: number[];
  recentTools: string[];
}

export interface EvalHud {
  onMetric: (event: MetricEvent) => void;
}

export function createEvalHud(mount: HTMLElement): EvalHud {
  const stats: Stats = {
    modelId: null,
    loadMs: null,
    loadReceived: 0,
    loadTotal: 0,
    loading: false,
    loadPhase: "download",
    loadError: null,
    fromCache: false,
    warming: false,
    warmupMs: null,
    lastTtft: null,
    lastTokensPerSec: null,
    lastTurnMs: null,
    runs: 0,
    turns: 0,
    toolCalls: 0,
    toolCallsPerRun: 0,
    tpsSamples: [],
    recentTools: [],
  };

  mount.classList.add("lr-hud");
  mount.innerHTML = `
    <div class="lr-hud-head">
      <span class="lr-hud-title">On-device eval</span>
      <button type="button" class="lr-hud-toggle" aria-label="Collapse">–</button>
    </div>
    <div class="lr-hud-body">
      <div class="lr-hud-model" data-role="model"></div>
      <div class="lr-hud-grid">
        <div class="lr-hud-cell"><span class="lr-hud-k">TTFT</span><span class="lr-hud-v" data-role="ttft">—</span></div>
        <div class="lr-hud-cell"><span class="lr-hud-k">Tokens/s</span><span class="lr-hud-v" data-role="tps">—</span></div>
        <div class="lr-hud-cell"><span class="lr-hud-k">Last turn</span><span class="lr-hud-v" data-role="turnms">—</span></div>
        <div class="lr-hud-cell"><span class="lr-hud-k">Avg tok/s</span><span class="lr-hud-v" data-role="avgtps">—</span></div>
        <div class="lr-hud-cell"><span class="lr-hud-k">Runs</span><span class="lr-hud-v" data-role="runs">0</span></div>
        <div class="lr-hud-cell"><span class="lr-hud-k">Tool calls</span><span class="lr-hud-v" data-role="tools">0</span></div>
      </div>
      <div class="lr-hud-recent" data-role="recent"></div>
    </div>`;

  const el = (role: string): HTMLElement =>
    mount.querySelector(`[data-role="${role}"]`) as HTMLElement;
  const toggle = mount.querySelector(".lr-hud-toggle") as HTMLButtonElement;
  toggle.addEventListener("click", () => {
    const collapsed = mount.classList.toggle("lr-hud-collapsed");
    toggle.textContent = collapsed ? "+" : "–";
  });

  const render = (): void => {
    // Model line / progress
    const modelEl = el("model");
    if (stats.loadError) {
      modelEl.innerHTML = `<span class="lr-hud-err">Load failed: ${escapeHtml(stats.loadError)}</span>`;
    } else if (stats.loading) {
      const pct = stats.loadTotal > 0 ? Math.round((stats.loadReceived / stats.loadTotal) * 100) : 0;
      const label = stats.modelId ? MODELS[stats.modelId].label : "model";
      modelEl.innerHTML = `
        <div class="lr-hud-loadrow">
          <span>${stats.loadPhase === "cache-read" ? "Reading cached weights" : "Downloading"} ${escapeHtml(label)}…</span>
          <span class="lr-hud-mono">${fmtBytes(stats.loadReceived)}${stats.loadTotal ? ` / ${fmtBytes(stats.loadTotal)}` : ""}</span>
        </div>
        <div class="lr-hud-bar"><div class="lr-hud-bar-fill" style="width:${pct}%"></div></div>`;
    } else if (stats.warming && stats.modelId) {
      modelEl.innerHTML = `<span class="lr-hud-ok">● ${escapeHtml(MODELS[stats.modelId].label)}</span>
        <span class="lr-hud-mono">warming up the GPU…</span>`;
    } else if (stats.modelId) {
      const warm = stats.warmupMs != null ? ` · warmup ${fmtMs(stats.warmupMs)}` : "";
      const src = stats.fromCache ? " · weights from cache" : "";
      modelEl.innerHTML = `<span class="lr-hud-ok">● ${escapeHtml(MODELS[stats.modelId].label)}</span>
        <span class="lr-hud-mono">ready in ${stats.loadMs != null ? fmtMs(stats.loadMs) : "—"}${src}${warm}</span>`;
    } else {
      modelEl.innerHTML = `<span class="lr-hud-idle">No model loaded</span>`;
    }

    el("ttft").textContent = stats.lastTtft != null ? fmtMs(stats.lastTtft) : "—";
    el("tps").textContent = stats.lastTokensPerSec != null ? `${stats.lastTokensPerSec}` : "—";
    el("turnms").textContent = stats.lastTurnMs != null ? fmtMs(stats.lastTurnMs) : "—";
    const avg = stats.tpsSamples.length
      ? Math.round(stats.tpsSamples.reduce((a, b) => a + b, 0) / stats.tpsSamples.length)
      : null;
    el("avgtps").textContent = avg != null ? `${avg}` : "—";
    el("runs").textContent = `${stats.runs}`;
    el("tools").textContent = `${stats.toolCalls}`;

    const recent = el("recent");
    if (stats.recentTools.length) {
      recent.innerHTML = stats.recentTools
        .slice(-8)
        .map((n) => `<span class="lr-hud-chip">${escapeHtml(n)}</span>`)
        .join("");
    } else {
      recent.innerHTML = `<span class="lr-hud-hint">Tool calls will appear here.</span>`;
    }
  };

  const onMetric = (event: MetricEvent): void => {
    switch (event.type) {
      case "load_start":
        stats.modelId = event.modelId;
        stats.loading = true;
        stats.loadError = null;
        stats.loadReceived = 0;
        stats.loadTotal = 0;
        break;
      case "load_progress":
        stats.loadReceived = event.received;
        stats.loadTotal = event.total;
        stats.loadPhase = event.phase;
        break;
      case "load_ready":
        stats.loading = false;
        stats.loadMs = event.loadMs;
        stats.modelId = event.modelId;
        stats.fromCache = event.fromCache;
        break;
      case "load_error":
        stats.loading = false;
        stats.warming = false;
        stats.loadError = event.message;
        break;
      case "warmup_start":
        stats.warming = true;
        break;
      case "warmup_done":
        stats.warming = false;
        stats.warmupMs = event.ms;
        break;
      case "turn_start":
        stats.turns += 1;
        break;
      case "ttft":
        stats.lastTtft = event.ms;
        break;
      case "turn_end":
        stats.lastTokensPerSec = event.tokensPerSec;
        stats.lastTurnMs = event.ms;
        if (event.tokensPerSec > 0) stats.tpsSamples.push(event.tokensPerSec);
        break;
      case "tool_calls":
        stats.toolCalls += event.names.length;
        stats.recentTools.push(...event.names);
        break;
      case "run_complete":
        stats.runs += 1;
        break;
      case "error":
        stats.loadError = event.message;
        break;
    }
    render();
  };

  render();
  return { onMetric };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
