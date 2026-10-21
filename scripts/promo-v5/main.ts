import "@runtypelabs/persona/widget.css";
import "./fonts.css";
import "./style.css";
import { initAgentWidget, registerIcons, type AgentWidgetConfig, type AgentWidgetMessage } from "@runtypelabs/persona";
import { assistantIcons, assistantPresets, createAssistantPreset } from "../../apps/web/src/assistant-presets";
import { personaLogoSvg } from "./logo";
import { frameworks } from "./frameworks";

registerIcons(assistantIcons);

// ?format=portrait renders the 4:5 (1080×1350) LinkedIn cut; layouts below branch on it.
const PORTRAIT = new URLSearchParams(location.search).get("format") === "portrait";
document.documentElement.dataset.format = PORTRAIT ? "portrait" : "landscape";

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
const CHANGE = [0, 3.2, 4.3, 5.35, 6.4];
const WIPE_LAG = 0.3, WIPE_DUR = 0.45;
const DURATION = 20;
const T = { introOut: 2.55, s2In: 2.35, s2Out: 7.6, s3In: 7.55, s3Out: 14.5, s4In: 14.4, s4Out: 17.05, outroIn: 17.0 };

function defaultsConfig(s: State): AgentWidgetConfig {
  return {
    apiUrl: "/promo-local", persistState: false,
    future: { v5Defaults: s.v5 },
    ...(s.brand ? { brand: s.brand } : { colorScheme: "dark" as const }),
    // Off-screen workaround (not in the code card): brand `elevation` currently
    // gives V5's flat, unpadded assistant replies a card shadow and border.
    ...(s.brand && s.v5 ? { theme: { components: { message: { assistant: { shadow: "none", border: "transparent" } } } } } : {}),
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

// Intro / thumbnail widget: V5 defaults, untouched, mid-conversation.
const introWidget = initAgentWidget({ target: $("#intro-host"), config: { ...defaultsConfig(states[1]), launcher: { enabled: false, fullHeight: true, title: "Assistant" }, copy: { inputPlaceholder: "Ask anything…" } } });
{
  const epoch = Date.parse("2026-10-21T16:00:00Z");
  let sequence = 0;
  const inject = (m: Partial<AgentWidgetMessage> & Pick<AgentWidgetMessage, "id">) => introWidget.injectTestMessage({
    type: "message", message: { role: "assistant", content: "", createdAt: new Date(epoch + sequence * 100).toISOString(), sequence: sequence++, ...m },
  });
  const tool = (id: string, name: string, args: Record<string, unknown>, result: string) =>
    inject({ id, variant: "tool", toolCall: { id, name, status: "complete", success: true, startedAt: epoch, durationMs: 900, args, result } });
  inject({ id: "user", role: "user", content: "What is possible?" });
  inject({ id: "reason", variant: "reasoning", reasoning: { id: "reason", status: "complete", startedAt: epoch, durationMs: 3200, chunks: ["Exploring what Persona can do."] } });
  tool("t1", "search_docs", { query: "Persona capabilities" }, "Streaming, tools, approvals, artifacts, voice.");
  tool("t2", "list_examples", { framework: "any" }, "Found 35 live demos.");
  tool("t3", "render_component", { name: "Showcase" }, "Rendered.");
  inject({ id: "final", content: "Anything is possible." });
  // Open the grouped tool calls with the real disclosure, as a reader would.
  // Messages render asynchronously, so retry until the group header exists.
  const openGroup = (tries: number) => {
    const header = $("#intro-host").querySelector<HTMLButtonElement>('button[aria-controls^="activity-details-tool-group"]');
    if (header?.getAttribute("aria-expanded") === "false") header.click();
    else if (!header && tries > 0) setTimeout(() => openGroup(tries - 1), 100);
  };
  openGroup(30);
}

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

// ── scene 3: five assistant styles, each sending a prompt ───────────────────
const PANEL_GAP = PORTRAIT ? 1000 : 1100;
const chats: Record<string, { prompt: string; reply: string }> = {
  chatgpt: { prompt: "Plan a launch for Persona v5", reply: "Here’s a tight plan:\n\n1. **Tease** it with a short demo video\n2. **Point** people at the v5 preview\n3. **Ship** `v5Defaults` to everyone" },
  claude: { prompt: "Draft the v5 announcement", reply: "**The Persona v5 preview is here.** Quieter activity, a refreshed composer, and six brand fields that restyle everything." },
  gemini: { prompt: "Summarize the release notes", reply: "Three highlights: compact tool activity, clear approval outcomes, and brand presets in six fields." },
  copilot: { prompt: "Compare chat widget options", reply: "Persona is plain JavaScript, so it drops into any stack without framework lock-in." },
  perplexity: { prompt: "What’s new in Persona v5?", reply: "The v5 preview adds new defaults, a refreshed composer, approval outcomes and one-line brand theming." },
};
// The camera arrives at panel i at ARRIVE[i], drifts while it types, sends and replies, then moves on.
const ARRIVE = [8.1, 9.3, 10.5, 11.7, 12.9];
const DWELL = 0.72;
const cam3 = $("#cam3");
const panels = assistantPresets.map((preset, i) => {
  const panel = el("div", "panel");
  const frame = el("div", "panel-frame"); const host = el("div", "whost");
  frame.style.background = preset.canvas;
  frame.append(host);
  panel.append(el("div", "panel-label", `<i></i>${preset.name.toUpperCase()} <em>STYLE</em>`), frame);
  cam3.append(panel);
  const widget = initAgentWidget({ target: host, config: createAssistantPreset(preset.id, () => {}) });
  return { panel, host, widget, id: preset.id, x: i * PANEL_GAP, z: i % 2 ? -90 : 0, sent: false, replyLen: -1 };
});

const focusKeys: [number, number][] = [[7.55, -1500]];
ARRIVE.forEach((a, i) => focusKeys.push([a, i * PANEL_GAP - 30], [a + DWELL, i * PANEL_GAP + 30]));
const lastDwell = ARRIVE[4] + DWELL;
focusKeys.push([14.25, 2 * PANEL_GAP]);
const s3Focus = track(focusKeys);
const s3Z = track([[7.55, -520], [8.1, -130], [lastDwell, -170], [14.25, PORTRAIT ? -2600 : -4300]]);
const s3RY = track([[7.55, -30], [8.15, -16], [lastDwell, -12], [14.25, -2]]);
const s3RX = track([[7.55, 9], [lastDwell, 6], [14.25, 2]]);

function renderS3(t: number) {
  const f = s3Focus(t);
  cam3.style.transform = `translate3d(0, ${PORTRAIT ? 110 : 70}px, ${s3Z(t).toFixed(2)}px) rotateX(${s3RX(t).toFixed(3)}deg) rotateY(${s3RY(t).toFixed(3)}deg) translate3d(${(-f).toFixed(2)}px, 0, 0)`;
  panels.forEach((p, i) => {
    p.panel.style.transform = `translate3d(${p.x}px, 0, ${p.z}px) translate(-50%, -50%)`;
    const { prompt, reply } = chats[p.id];
    const typeAt = ARRIVE[i] - 0.22, sendAt = ARRIVE[i] + 0.3, replyAt = sendAt + 0.1;
    const input = p.host.querySelector<HTMLTextAreaElement>("textarea");
    if (input) {
      // Type the prompt as the camera arrives; the send button appears with the draft.
      const want = t >= sendAt ? "" : prompt.slice(0, Math.round(prompt.length * prog(t, typeAt, typeAt + 0.45)));
      if (input.value !== want) { input.value = want; input.dispatchEvent(new Event("input", { bubbles: true })); }
    }
    const epoch = Date.parse("2026-10-21T16:00:00Z");
    if (t >= sendAt && !p.sent) {
      p.sent = true;
      p.widget.injectTestMessage({ type: "message", message: { id: "u", role: "user", content: prompt, createdAt: new Date(epoch).toISOString(), sequence: 0 } });
    }
    if (t >= replyAt) {
      // Stream the reply word by word on the virtual clock.
      const words = reply.split(/(?<=\s)/);
      const n = Math.round(words.length * easeOut3(prog(t, replyAt, replyAt + 0.75)));
      if (n !== p.replyLen) {
        p.replyLen = n;
        p.widget.injectTestMessage({ type: "message", message: { id: "a", role: "assistant", content: words.slice(0, n).join(""), streaming: n < words.length, createdAt: new Date(epoch + 100).toISOString(), sequence: 1 } });
      }
    }
  });
  return f;
}

// ── scene 4: any framework ─────────────────────────────────────────────────
const cam4 = $("#cam4");
const TILE_W = 236, TILE_H = 220, TILE_GAP = 26;
const TILE_COLS = PORTRAIT ? 3 : 6, TILE_ROWS = PORTRAIT ? 4 : 2;
const tiles = [...frameworks.map(fw => ({ html: `${fw.svg}<span>${fw.name}</span>`, cls: fw.id === "eve" ? "tile wide" : fw.id === "mastra" ? "tile mastra" : "tile" })),
  { html: "<b>+</b><span>any SSE<br />backend</span>", cls: "tile more" }].map((spec, i) => {
  const tile = el("div", spec.cls, spec.html);
  cam4.append(tile);
  const c = i % TILE_COLS, r = Math.floor(i / TILE_COLS);
  return { tile, c, r, x: (c - (TILE_COLS - 1) / 2) * (TILE_W + TILE_GAP), y: (r - (TILE_ROWS - 1) / 2) * (TILE_H + TILE_GAP) + (PORTRAIT ? 120 : 70) };
});
const s4RY = track(PORTRAIT ? [[T.s4In, 18], [T.s4Out, -8]] : [[T.s4In, 26], [T.s4Out, -10]]);
const s4RX = track([[T.s4In, 24], [15.2, 15], [T.s4Out, 10]]);
const s4Z = track([[T.s4In, -700], [15.1, -260], [T.s4Out, -60]]);

function renderS4(t: number) {
  const vis = easeOut3(prog(t, T.s4In, T.s4In + 0.25)) * (1 - easeIn3(prog(t, T.s4Out - 0.2, T.s4Out + 0.05)));
  setOpacity("#s4", vis);
  if (vis <= 0) return;
  cam4.style.transform = `translate3d(0, 0, ${s4Z(t).toFixed(2)}px) rotateX(${s4RX(t).toFixed(3)}deg) rotateY(${s4RY(t).toFixed(3)}deg)`;
  // A teal highlight sweeps across the grid once the tiles have landed.
  const sweep = lerp(-1.5, PORTRAIT ? 6.5 : 7.5, prog(t, 15.5, 16.6));
  tiles.forEach(({ tile, c, r, x, y }, i) => {
    const d = T.s4In + 0.15 + (c + r) * 0.07;
    const p = prog(t, d, d + 0.55), e = easeOutBack(p);
    const float = Math.sin(t * 2.1 + i * 0.9) * 10;
    tile.style.transform = `translate3d(${x}px, ${y}px, ${(lerp(-500, 0, easeOut3(p)) + float).toFixed(2)}px) rotateX(${lerp(-95, 0, e).toFixed(2)}deg) translate(-50%, -50%)`;
    tile.style.opacity = String(clamp(p * 2.5));
    const glow = clamp(1 - Math.abs(c + r * (PORTRAIT ? 1 : 0.5) - sweep) / 1.2);
    tile.style.borderColor = glow > 0.01 ? `rgba(38, 254, 220, ${(0.12 + 0.75 * glow).toFixed(3)})` : "";
    tile.style.color = glow > 0.01 ? `rgb(${mixHex("#fef9f1", "#26fedc", glow).join(",")})` : "";
  });
}

// ── master timeline ────────────────────────────────────────────────────────
const cam2 = $("#cam2"), device = $("#device");
const s2RY = track(PORTRAIT ? [[2.35, 26], [2.85, 18], [7.25, 9], [7.62, 4]] : [[2.35, 40], [2.85, 26], [7.25, 13], [7.62, 6]]);
const s2RX = track([[2.35, 14], [2.85, 9], [7.62, 4]]);
const s2Z = track([[2.35, -900], [2.9, -330], [7.25, -170], [7.62, -110]]);
const s2X = track(PORTRAIT ? [[2.35, 100], [2.9, 50], [7.25, -20], [7.6, 1400]] : [[2.35, 260], [2.9, 120], [7.25, -40], [7.6, 1800]]);
const s2Y = track([[2.35, 40], [7.62, -10]]);

function setOpacity(sel: string, o: number) { const e = $(sel); e.style.opacity = String(clamp(o)); e.style.visibility = o <= 0.001 ? "hidden" : "visible"; }
const reveal = (sel: string, t: number, a: number, dy = 24) => {
  const e = $(sel), p = easeOutExpo(prog(t, a, a + 0.5));
  e.style.opacity = String(p); e.style.transform = `translateY(${lerp(dy, 0, p)}px)`;
};

const cam1 = $("#cam1"), introDevice = $("#intro-device");
// Fully composed from frame 0 so the first frame works as the thumbnail; only the camera drifts.
function renderIntro(t: number) {
  const exit = easeIn3(prog(t, T.introOut - 0.3, T.introOut));
  setOpacity("#intro", 1 - exit);
  const drift = easeInOut3(prog(t, 0, T.introOut));
  const lock = $("#intro-lockup");
  lock.style.transform = `translateY(-50%) translateX(${lerp(0, -14, drift) - exit * 160}px) scale(${lerp(1, 1.02, drift)})`;
  lock.style.filter = exit > 0 ? `blur(${(exit * 10).toFixed(2)}px)` : "none";
  cam1.style.transform = `translate3d(0, 0, ${(lerp(-60, 30, drift) + exit * 700).toFixed(2)}px) rotateX(${lerp(PORTRAIT ? 14 : 7, PORTRAIT ? 9 : 4, drift).toFixed(3)}deg) rotateY(${lerp(PORTRAIT ? -12 : -22, PORTRAIT ? -6 : -14, drift).toFixed(3)}deg)`;
  introDevice.style.transform = PORTRAIT ? `translate3d(0, 320px, 0) translate(-50%, -50%)` : `translate3d(470px, 10px, 0) translate(-50%, -50%)`;
  introDevice.style.filter = exit > 0 ? `blur(${(exit * 8).toFixed(2)}px)` : "none";
}

function renderS2(t: number) {
  const vis = easeOut3(prog(t, T.s2In, T.s2In + 0.3)) * (1 - easeIn3(prog(t, T.s2Out - 0.1, T.s2Out + 0.2)));
  setOpacity("#s2", vis);
  if (vis <= 0) return;
  cam2.style.transform = `translate3d(0, 0, ${s2Z(t).toFixed(2)}px) rotateX(${s2RX(t).toFixed(3)}deg) rotateY(${s2RY(t).toFixed(3)}deg) translate3d(${(-s2X(t)).toFixed(2)}px, ${s2Y(t).toFixed(2)}px, 0)`;
  // Anchored at the top so the brand block unfolds downward, away from the headline.
  if (PORTRAIT) {
    // Diagonal, never overlapping: Chrome mis-sorts the widget's composer over an intersecting card.
    card.style.transform = `translate3d(-305px, -10px, 170px) translate(-50%, 0)`;
    device.style.transform = `translate3d(285px, 30px, 0) rotateY(-6deg) translate(-50%, -50%)`;
  } else {
    card.style.transform = `translate3d(-500px, -230px, 170px) translate(-50%, 0)`;
    device.style.transform = `translate3d(400px, 90px, 0) rotateY(-6deg) translate(-50%, -50%)`;
  }
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
  const a = T.outroIn;
  const vis = easeOut3(prog(t, a, a + 0.3));
  setOpacity("#outro", vis);
  if (vis <= 0) return;
  const logo = $("#outro-logo");
  const lp = easeOutExpo(prog(t, a, a + 0.7));
  logo.style.transform = `scale(${lerp(1.25, 1, lp)})`;
  logo.style.filter = lp < 1 ? `blur(${((1 - lp) * 8).toFixed(2)}px)` : "none";
  const svg = logo.querySelector("svg")!;
  svg.querySelector<SVGPathElement>(".logo-bubble")!.style.strokeDashoffset = "0";
  svg.querySelector<SVGLineElement>(".logo-bar")!.style.strokeDashoffset = "0";
  reveal("#outro-row", t, a + 0.25);
  reveal("#outro-url", t, a + 0.38);
  reveal("#built-by", t, a + 0.6);
  // Slow push-in through the hold.
  $("#outro").querySelector<HTMLElement>(".outro-lockup")!.style.transform = `scale(${lerp(1, 1.035, prog(t, a, DURATION))})`;
}

function renderBg(t: number, focus: number) {
  const floor = $("#floor");
  // Blend each scene's lateral motion into the next so the grid never jumps.
  const w3 = prog(t, T.s3In, T.s3In + 0.4), w4 = prog(t, T.s4In, T.s4In + 0.4);
  const x = lerp(lerp(-s2X(t) * 0.35, -focus * 0.35, w3), -s4RY(t) * 30, w4);
  floor.style.backgroundPosition = `${x.toFixed(1)}px ${(t * 140).toFixed(1)}px`;
  const [r, g, b] = t < T.s3In ? glowColor(t) : [38, 254, 220];
  const glow = $("#glow");
  const amp = 0.18 + 0.05 * Math.sin(t * 2.2);
  glow.style.background = `radial-gradient(closest-side, rgba(${r},${g},${b},${amp}), rgba(${r},${g},${b},0.04) 55%, transparent)`;
  glow.style.transform = `translate(${PORTRAIT ? 0 : t < T.s2In ? 340 : t < T.s3In ? 160 : 0}px, ${PORTRAIT && t < T.s2In ? 280 : 0}px) scale(${lerp(0.9, 1.15, (Math.sin(t * 0.9) + 1) / 2)})`;
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
  const s3vis = easeOut3(prog(t, T.s3In, T.s3In + 0.2)) * (1 - easeIn3(prog(t, T.s3Out - 0.15, T.s3Out + 0.05)));
  setOpacity("#s3", s3vis);
  const focus = renderS3(t);
  renderS4(t);
  renderHud("#hud2", t, 2.55, 5.0);
  renderHud("#hud3", t, 7.8, 10.6);
  renderHud("#hud4", t, 14.55, 16.85);
  renderOutro(t);
  renderBg(t, focus);
  syncAnimations(t);
}

declare global { interface Window { __seek: (t: number) => Promise<void>; __ready: boolean; __duration: number } }
window.__duration = DURATION;
window.__seek = async (t: number) => {
  seek(t);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
};
document.fonts.ready.then(() => { seek(0); window.__ready = true; });

// Preview mode: ?t=3.2 freezes on a frame.
const params = new URLSearchParams(location.search);
if (params.has("font")) document.documentElement.dataset.font = params.get("font")!;
if (params.has("t")) document.fonts.ready.then(() => setTimeout(() => window.__seek(Number(params.get("t"))), 600));
