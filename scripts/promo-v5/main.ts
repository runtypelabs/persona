import "@runtypelabs/persona/widget.css";
import "./fonts.css";
import "./style.css";
import { initAgentWidget, registerIcons, type AgentWidgetConfig, type AgentWidgetMessage } from "@runtypelabs/persona";
import { assistantIcons, assistantPresets, createAssistantPreset } from "../../apps/web/src/assistant-presets";
import { personaLogoSvg } from "./logo";

registerIcons(assistantIcons);

// ── math ────────────────────────────────────────────────────────────────────
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut3 = (p: number) => 1 - (1 - p) ** 3;
const easeIn3 = (p: number) => p ** 3;
const easeInOut3 = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const easeOutExpo = (p: number) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
const easeOutBack = (p: number) => { const c = 1.9; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; };

/** Monotone cubic (Fritsch–Carlson) through [time, value] keys. */
function track(keys: [number, number][]) {
  const n = keys.length, xs = keys.map(k => k[0]), ys = keys.map(k => k[1]);
  const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]));
  const m = ys.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  // Flat ends so the camera settles instead of drifting.
  m[0] = 0; m[n - 1] = 0;
  return (t: number) => {
    if (t <= xs[0]) return ys[0];
    if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], s = (t - xs[i]) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
  };
}
const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mixHex = (a: string, b: string, p: number) => { const x = hex(a), y = hex(b); return x.map((v, i) => Math.round(lerp(v, y[i], p))); };

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const el = (tag: string, cls = "", html = "") => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

// ── logo ────────────────────────────────────────────────────────────────────
$("#intro-logo").innerHTML = personaLogoSvg;
$("#outro-logo").innerHTML = personaLogoSvg;

// ── scene 2: one conversation, five configurations ─────────────────────────
type Brand = NonNullable<AgentWidgetConfig["brand"]>;
type State = { name: string; v5: boolean; brand?: Brand; glow: string };
const states: State[] = [
  { name: "v4", v5: false, glow: "#26fedc" },
  { name: "v5", v5: true, glow: "#26fedc" },
  { name: "editorial", v5: true, glow: "#b9a68a", brand: { accent: "#b9a68a", neutral: "#171715", font: "Newsreader, serif", radius: "md", density: "comfortable", elevation: "flat" } },
  { name: "studio", v5: true, glow: "#7c3aed", brand: { accent: "#7c3aed", neutral: "#f5f3ff", font: "Inter, sans-serif", radius: "lg", density: "spacious", elevation: "raised" } },
  { name: "terminal", v5: true, glow: "#22c55e", brand: { accent: "#22c55e", neutral: "#101916", font: "JetBrains Mono", radius: "none", density: "compact", elevation: "subtle" } },
];
// Code edit for state k starts at CHANGE[k]; the widget wipe follows WIPE_LAG later.
const CHANGE = [0, 1.62, 2.5, 3.38, 4.26];
const WIPE_LAG = 0.3, WIPE_DUR = 0.4;
const T = { s2In: 1.0, s2Out: 5.3, s3In: 5.28, s3Out: 8.42, outroIn: 8.5 };

function defaultsConfig(s: State): AgentWidgetConfig {
  return {
    apiUrl: "/promo-local", persistState: false,
    future: { v5Defaults: s.v5 },
    ...(s.brand ? { brand: s.brand } : { colorScheme: "dark" as const }),
    launcher: { enabled: false, fullHeight: true, title: "Docs assistant", subtitle: "Persona · sample data" },
    welcome: { variant: "none" }, suggestions: { starters: { items: [] } },
    copy: { inputPlaceholder: "Ask about theming…" },
    features: { showToolCalls: true, showReasoning: true },
  };
}

type Controller = ReturnType<typeof initAgentWidget>;
function seed(widget: Controller) {
  const epoch = Date.parse("2026-10-21T16:00:00Z");
  let sequence = 0;
  const inject = (m: Partial<AgentWidgetMessage> & Pick<AgentWidgetMessage, "id">) => widget.injectTestMessage({
    type: "message", message: { role: "assistant", content: "", createdAt: new Date(epoch + sequence * 100).toISOString(), sequence: sequence++, ...m },
  });
  const tool = (id: string, name: string, args: Record<string, unknown>, result: string) =>
    inject({ id, variant: "tool", toolCall: { id, name, status: "complete", success: true, startedAt: epoch, durationMs: 1200, args, result } });
  inject({ id: "user", role: "user", content: "Find the theme guide and tell me what I can change." });
  inject({ id: "reason", variant: "reasoning", reasoning: { id: "reason", status: "complete", startedAt: epoch, durationMs: 6500, chunks: ["Checking the documentation.\nComparing the available options."] } });
  tool("search", "search_docs", { query: "Persona theme configuration" }, "Found the theme guide and three examples.");
  tool("read", "read_file", { path: "docs/theme-guide.md" }, "Read the relevant configuration examples.");
  inject({ id: "final", content: "Six **brand** fields restyle everything:\n\n- `accent` and `neutral` set the palette\n- `font` sets the typography\n- `radius`, `density` and `elevation` set the shape\n\nActivity, approvals and the composer follow along." });
}

const stack = $("#wstack");
const layers = states.map((s) => {
  const layer = el("div", "wlayer"); const host = el("div", "whost");
  layer.append(host); stack.append(layer);
  const widget = initAgentWidget({ target: host, config: defaultsConfig(s) });
  seed(widget);
  return layer;
});

// Code card: stable line ids; values type over when the state changes.
type Seg = [cls: string, text: string];
type CodeLine = { id: string; brand?: boolean; prefix: Seg[]; value?: (s: State) => string; kind?: "bool" | "str"; suffix?: Seg[] };
const P = (t: string): Seg => ["tk-punc", t];
const K = (t: string): Seg => ["tk-key", t];
const brandLine = (key: keyof Brand): CodeLine => ({ id: key, brand: true, prefix: [["", "      "], K(key), P(": ")], value: s => String(s.brand?.[key] ?? ""), kind: "str", suffix: [P(",")] });
const code: CodeLine[] = [
  { id: "open", prefix: [["tk-fn", "initAgentWidget"], P("({")] },
  { id: "target", prefix: [["", "  "], K("target"), P(": "), ["tk-str", '"#chat"'], P(",")] },
  { id: "config", prefix: [["", "  "], K("config"), P(": {")] },
  { id: "future", prefix: [["", "    "], K("future"), P(": { "), K("v5Defaults"), P(": ")], value: s => String(s.v5), kind: "bool", suffix: [P(" },")] },
  { id: "brand", brand: true, prefix: [["", "    "], K("brand"), P(": {")] },
  brandLine("accent"), brandLine("neutral"), brandLine("font"), brandLine("radius"), brandLine("density"), brandLine("elevation"),
  { id: "brand-close", brand: true, prefix: [["", "    "], P("},")] },
  { id: "config-close", prefix: [["", "  "], P("},")] },
  { id: "close", prefix: [P("});")] },
];
const card = $("#code");
card.append(el("div", "bar", '<i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span>chat.ts</span>'));
const lineEls = code.map(line => {
  const row = el("div", "code-line"); const hl = el("div", "hl"); const txt = el("span", "txt");
  row.append(hl, txt); card.append(row);
  return { line, row, hl, txt };
});
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const segHtml = (segs: Seg[]) => segs.map(([c, t]) => (c ? `<span class="${c}">${esc(t)}</span>` : esc(t))).join("");

function stateAt(t: number) { let k = 0; for (let i = 1; i < CHANGE.length; i++) if (t >= CHANGE[i]) k = i; return k; }

function renderCode(t: number) {
  const k = stateAt(t);
  const brandOpen = prog(t, CHANGE[2], CHANGE[2] + 0.22);
  lineEls.forEach(({ line, row, hl, txt }, index) => {
    // Brand block unfolds once, staggered, when the first brand lands.
    const order = line.brand ? index - 4 : 0;
    const open = line.brand ? easeOut3(clamp(brandOpen * 1.6 - order * 0.08)) : 1;
    row.style.height = `${(1.62 * open).toFixed(4)}em`;
    row.style.opacity = String(line.brand ? clamp(open * 1.4 - 0.2) : 1);
    if (!line.value) { txt.innerHTML = segHtml(line.prefix); return; }
    const now = line.value(states[k]);
    const before = k > 0 ? line.value(states[k - 1]) : now;
    // Type-over: delete the old value, then type the new one, staggered by line.
    const start = CHANGE[k] + (line.brand ? 0.05 + (index - 5) * 0.035 : 0);
    const p = k > 0 && now !== before ? prog(t, start, start + 0.3) : 1;
    let shown = now, typing = false;
    if (p < 1) {
      typing = p > 0;
      shown = p < 0.35 ? before.slice(0, Math.round(before.length * (1 - p / 0.35))) : now.slice(0, Math.round(now.length * ((p - 0.35) / 0.65)));
    }
    const valueCls = line.kind === "bool" ? "tk-bool" : "tk-str";
    const isColor = /^#[0-9a-f]{6}$/i.test(shown) && shown.length === 7;
    const swatch = line.kind === "str" && isColor ? `<span class="swatch" style="background:${shown}"></span>` : "";
    const quote = line.kind === "str" ? '"' : "";
    txt.innerHTML = segHtml(line.prefix) + swatch + `<span class="${valueCls}">${quote}${esc(shown)}${p >= 1 || p >= 0.35 ? quote : ""}</span>` + (typing ? '<span class="caret"></span>' : "") + segHtml(line.suffix ?? []);
    const changedAt = k > 0 && now !== before ? start : -9;
    hl.style.opacity = String(t >= changedAt ? clamp(1 - (t - changedAt - 0.3) / 0.6) * 0.9 : 0);
  });
}

function renderLayers(t: number) {
  const sl = $("#scanline");
  let scan = 0, scanP = 0;
  layers.forEach((layer, k) => {
    if (k === 0) { layer.style.display = t < CHANGE[2] + WIPE_LAG + WIPE_DUR ? "" : "none"; return; }
    const ws = CHANGE[k] + WIPE_LAG, p = easeInOut3(prog(t, ws, ws + WIPE_DUR));
    const next = k + 1 < layers.length ? CHANGE[k + 1] + WIPE_LAG + WIPE_DUR : Infinity;
    layer.style.display = p > 0 && t < next ? "" : "none";
    layer.style.clipPath = p >= 1 ? "none" : `inset(0 ${((1 - p) * 100).toFixed(3)}% 0 0)`;
    if (p > 0 && p < 1) { scan = Math.sin(Math.PI * p); scanP = p; }
  });
  sl.style.opacity = String(scan);
  sl.style.left = `${(scanP * 100).toFixed(3)}%`;
}

function glowColor(t: number) {
  const k = stateAt(t);
  const ws = CHANGE[k] + WIPE_LAG;
  const p = k > 0 ? easeInOut3(prog(t, ws, ws + WIPE_DUR)) : 1;
  return mixHex(states[Math.max(0, k - 1)].glow, states[k].glow, p);
}

// ── scene 3: five assistant styles ─────────────────────────────────────────
const PANEL_GAP = 1100;
const prompts: Record<string, string> = {
  chatgpt: "Plan a launch for Persona v5",
  claude: "Draft the v5 announcement",
  gemini: "Summarize the release notes",
  copilot: "Compare chat widget options",
  perplexity: "What’s new in Persona v5?",
};
const cam3 = $("#cam3");
const panels = assistantPresets.map((preset, i) => {
  const panel = el("div", "panel");
  const frame = el("div", "panel-frame"); const host = el("div", "whost");
  frame.style.background = preset.canvas;
  frame.append(host);
  panel.append(el("div", "panel-label", `<i></i>${preset.name.toUpperCase()} <em>STYLE</em>`), frame);
  cam3.append(panel);
  const config = createAssistantPreset(preset.id, () => {});
  initAgentWidget({ target: host, config });
  return { panel, host, id: preset.id, x: i * PANEL_GAP, z: i % 2 ? -90 : 0 };
});

const s3Focus = track([[5.28, -1500], [5.78, 0], [6.22, 1 * PANEL_GAP], [6.64, 2 * PANEL_GAP], [7.06, 3 * PANEL_GAP], [7.5, 4 * PANEL_GAP], [8.42, 2 * PANEL_GAP]]);
const s3Z = track([[5.28, -520], [5.8, -130], [7.5, -170], [8.42, -4300]]);
const s3RY = track([[5.28, -30], [5.85, -16], [7.5, -13], [8.4, -2]]);
const s3RX = track([[5.28, 9], [7.5, 6], [8.4, 2]]);
const typeAt = [5.62, 6.08, 6.5, 6.92, 7.34];

function renderS3(t: number) {
  const f = s3Focus(t);
  cam3.style.transform = `translate3d(0, 70px, ${s3Z(t).toFixed(2)}px) rotateX(${s3RX(t).toFixed(3)}deg) rotateY(${s3RY(t).toFixed(3)}deg) translate3d(${(-f).toFixed(2)}px, 0, 0)`;
  panels.forEach((p, i) => {
    p.panel.style.transform = `translate3d(${p.x}px, 0, ${p.z}px) translate(-50%, -50%)`;
    // Type the prompt as the camera arrives; the send button appears with the draft.
    const input = p.host.querySelector<HTMLTextAreaElement>("textarea");
    if (!input) return;
    const text = prompts[p.id];
    const n = Math.round(text.length * prog(t, typeAt[i], typeAt[i] + 0.5));
    const want = text.slice(0, n);
    if (input.value !== want) { input.value = want; input.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  return f;
}

// ── master timeline ────────────────────────────────────────────────────────
const cam2 = $("#cam2"), device = $("#device");
const s2RY = track([[1.0, 40], [1.5, 26], [5.0, 13], [5.35, 6]]);
const s2RX = track([[1.0, 14], [1.5, 9], [5.35, 4]]);
const s2Z = track([[1.0, -900], [1.55, -330], [5.0, -170], [5.35, -110]]);
const s2X = track([[1.0, 260], [1.55, 120], [5.0, -40], [5.32, 1800]]);
const s2Y = track([[1.0, 40], [5.35, -10]]);

function setOpacity(sel: string, o: number) { const e = $(sel); e.style.opacity = String(clamp(o)); e.style.visibility = o <= 0.001 ? "hidden" : "visible"; }

function renderIntro(t: number) {
  const root = $("#intro");
  const lock = root.querySelector<HTMLElement>(".intro-lockup")!;
  const exit = easeIn3(prog(t, 0.95, 1.22));
  lock.style.transform = `scale(${lerp(0.94, 1.0, easeOut3(prog(t, 0, 1.0))) * lerp(1, 1.9, exit)})`;
  lock.style.filter = exit > 0 ? `blur(${(exit * 10).toFixed(2)}px)` : "none";
  setOpacity("#intro", 1 - exit);
  const svg = root.querySelector("svg")!;
  svg.querySelector<SVGPathElement>(".logo-bubble")!.style.strokeDashoffset = String(1 - easeOut3(prog(t, 0.02, 0.42)));
  svg.querySelector<SVGLineElement>(".logo-bar")!.style.strokeDashoffset = String(1 - easeOut3(prog(t, 0.18, 0.42)));
  svg.querySelectorAll<SVGCircleElement>(".logo-dot").forEach((d, i) => {
    const p = prog(t, 0.3 + i * 0.05, 0.48 + i * 0.05);
    d.style.transformBox = "fill-box"; d.style.transformOrigin = "center";
    d.style.transform = `scale(${p <= 0 ? 0 : easeOutBack(p)})`;
  });
  for (const sel of [".logo-spark", ".logo-js"]) svg.querySelector<SVGElement>(sel)!.style.opacity = String(easeOut3(prog(t, 0.4, 0.6)));
  const wp = easeOutExpo(prog(t, 0.12, 0.62));
  const word = svg.querySelector<SVGPathElement>(".logo-word")!;
  word.style.opacity = String(wp);
  word.style.transform = `translateX(${lerp(-3, 0, wp)}px)`;
  const pill = $("#intro-pill"), pp = easeOutExpo(prog(t, 0.5, 0.85));
  pill.style.opacity = String(pp);
  pill.style.transform = `translateY(${lerp(30, 0, pp)}px)`;
}

function renderS2(t: number) {
  const vis = easeOut3(prog(t, T.s2In, T.s2In + 0.3)) * (1 - easeIn3(prog(t, T.s2Out - 0.1, T.s2Out + 0.2)));
  setOpacity("#s2", vis);
  if (vis <= 0) return;
  cam2.style.transform = `translate3d(0, 0, ${s2Z(t).toFixed(2)}px) rotateX(${s2RX(t).toFixed(3)}deg) rotateY(${s2RY(t).toFixed(3)}deg) translate3d(${(-s2X(t)).toFixed(2)}px, ${s2Y(t).toFixed(2)}px, 0)`;
  // Anchored at the top so the brand block unfolds downward, away from the headline.
  card.style.transform = `translate3d(-500px, -230px, 170px) translate(-50%, 0)`;
  device.style.transform = `translate3d(400px, 90px, 0) rotateY(-6deg) translate(-50%, -50%)`;
  renderCode(t);
  renderLayers(t);
}

function renderHud(sel: string, t: number, a: number, b: number) {
  const block = $(sel);
  const pin = easeOutExpo(prog(t, a, a + 0.45)), pout = easeIn3(prog(t, b - 0.2, b));
  block.style.opacity = String(pin * (1 - pout));
  block.style.transform = `translateY(${lerp(26, 0, pin) - pout * 16}px)`;
  const h1 = block.querySelector<HTMLElement>("h1")!;
  const hp = easeOutExpo(prog(t, a + 0.08, a + 0.6));
  h1.style.clipPath = `inset(0 ${((1 - hp) * 100).toFixed(2)}% -20% 0)`;
}

function renderOutro(t: number) {
  const vis = easeOut3(prog(t, T.outroIn, T.outroIn + 0.3));
  setOpacity("#outro", vis);
  if (vis <= 0) return;
  const logo = $("#outro-logo");
  const lp = easeOutExpo(prog(t, T.outroIn, T.outroIn + 0.7));
  logo.style.transform = `scale(${lerp(1.25, 1, lp)})`;
  logo.style.filter = lp < 1 ? `blur(${((1 - lp) * 8).toFixed(2)}px)` : "none";
  const svg = logo.querySelector("svg")!;
  svg.querySelector<SVGPathElement>(".logo-bubble")!.style.strokeDashoffset = "0";
  svg.querySelector<SVGLineElement>(".logo-bar")!.style.strokeDashoffset = "0";
  const reveal = (sel: string, a: number) => {
    const e = $(sel), p = easeOutExpo(prog(t, a, a + 0.5));
    e.style.opacity = String(p); e.style.transform = `translateY(${lerp(24, 0, p)}px)`;
  };
  reveal("#outro-row", T.outroIn + 0.25);
  reveal("#outro-url", T.outroIn + 0.38);
  reveal("#built-by", T.outroIn + 0.5);
  // Slow push-in through the hold.
  $("#outro").querySelector<HTMLElement>(".outro-lockup")!.style.transform = `scale(${lerp(1, 1.035, prog(t, T.outroIn, 10))})`;
}

function renderBg(t: number, focus: number) {
  const floor = $("#floor");
  const s3 = clamp(prog(t, T.s3In, T.s3In + 0.4));
  floor.style.backgroundPosition = `${(-focus * 0.35 * s3 - s2X(t) * 0.35 * (1 - s3)).toFixed(1)}px ${(t * 140).toFixed(1)}px`;
  const [r, g, b] = t < T.s3In ? glowColor(t) : [38, 254, 220];
  const glow = $("#glow");
  const amp = 0.18 + 0.05 * Math.sin(t * 2.2);
  glow.style.background = `radial-gradient(closest-side, rgba(${r},${g},${b},${amp}), rgba(${r},${g},${b},0.04) 55%, transparent)`;
  glow.style.transform = `translate(${t < T.s3In ? 160 : 0}px, 0) scale(${lerp(0.9, 1.15, (Math.sin(t * 0.9) + 1) / 2)})`;
}

// Persona's own CSS animations/transitions run on virtual time: each one is
// paused and pinned to (now - first time we saw it), so frames are repeatable.
const firstSeen = new WeakMap<Animation, number>();
function syncAnimations(t: number) {
  for (const anim of document.getAnimations()) {
    if (!firstSeen.has(anim)) firstSeen.set(anim, t);
    anim.pause();
    anim.currentTime = (t - firstSeen.get(anim)!) * 1000;
  }
}

function seek(t: number) {
  renderIntro(t);
  renderS2(t);
  const s3vis = easeOut3(prog(t, T.s3In, T.s3In + 0.2)) * (1 - easeIn3(prog(t, T.s3Out - 0.15, T.s3Out + 0.12)));
  setOpacity("#s3", s3vis);
  const focus = renderS3(t);
  renderHud("#hud2", t, 1.18, 3.7);
  renderHud("#hud3", t, 5.6, 7.55);
  renderOutro(t);
  renderBg(t, focus);
  syncAnimations(t);
}

declare global { interface Window { __seek: (t: number) => Promise<void>; __ready: boolean } }
window.__seek = async (t: number) => {
  seek(t);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
};
document.fonts.ready.then(() => { seek(0); window.__ready = true; });

// Preview mode: ?play scrubs in real time; ?t=3.2 freezes on a frame.
const params = new URLSearchParams(location.search);
if (params.has("t")) document.fonts.ready.then(() => setTimeout(() => window.__seek(Number(params.get("t"))), 600));
if (params.has("play")) {
  const t0 = performance.now();
  const loop = () => { seek(((performance.now() - t0) / 1000) % 10); requestAnimationFrame(loop); };
  document.fonts.ready.then(() => setTimeout(loop, 600));
}
