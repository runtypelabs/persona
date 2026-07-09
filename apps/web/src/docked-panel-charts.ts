// Inline data-viz for the docked "Otto" demo.
//
// Two registered Persona components that Otto renders straight into the
// transcript (via controller.injectComponentDirective) when its WebMCP tools
// run: an area "sales trend" chart and a ranked "top products" bar chart. The
// look matches the admin's card system (white surface, hairline border, Inter,
// a single violet brand hue) so a chart reads as first-party output, not a
// bolted-on widget. Renderers take plain props and return DOM — no state.

import type { ComponentRenderer } from "@runtypelabs/persona";

const SVG_NS = "http://www.w3.org/2000/svg";
const BRAND = "#5e56e7";
const BRAND_SOFT = "rgba(94, 86, 231, 0.16)";
const INK = "#1a1a1a";
const MUTED = "#616161";
const POS = "#067a57";

type Point = { label: string; value: number };

function coercePoints(raw: unknown): Point[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p): Point | null => {
      if (typeof p === "number") return { label: "", value: p };
      if (p && typeof p === "object") {
        const o = p as Record<string, unknown>;
        const value = Number(o.value ?? o.revenue ?? o.y ?? 0);
        if (!Number.isFinite(value)) return null;
        return { label: String(o.label ?? o.date ?? o.x ?? ""), value };
      }
      return null;
    })
    .filter((p): p is Point => p !== null);
}

/** Shared card shell so both charts share the exact admin card aesthetic. */
function chartCard(): HTMLElement {
  const card = document.createElement("div");
  card.style.cssText = [
    "font-family: inherit",
    "background: #ffffff",
    "border: 1px solid #ececf2",
    "border-radius: 12px",
    "box-shadow: 0 1px 2px rgba(0,0,0,0.05)",
    "padding: 16px 16px 14px",
    "margin: 6px 0 2px",
    "max-width: 520px",
  ].join(";");
  return card;
}

function el(
  tag: string,
  style: string,
  text?: string,
): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = style;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

// ---------------------------------------------------------------------------
// otto_sales_chart — area/line trend
// props: { title?, subtitle?, points: (number | {label,value})[], total?, delta? }
// ---------------------------------------------------------------------------
export const OttoSalesChart: ComponentRenderer = (props) => {
  const card = chartCard();
  const points = coercePoints(props.points);

  // Header: title + subtitle on the left, total + delta on the right.
  const head = el("div", "display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px");
  const headL = el("div", "min-width:0");
  headL.appendChild(el("div", `font-size:13.5px;font-weight:600;color:${INK};letter-spacing:-0.01em`, String(props.title ?? "Sales trend")));
  if (props.subtitle) headL.appendChild(el("div", `font-size:12px;color:${MUTED};margin-top:2px`, String(props.subtitle)));
  head.appendChild(headL);

  if (props.total !== undefined) {
    const headR = el("div", "text-align:right;flex:none");
    headR.appendChild(el("div", `font-size:18px;font-weight:650;color:${INK};letter-spacing:-0.02em`, String(props.total)));
    if (props.delta !== undefined) {
      const up = !String(props.delta).trim().startsWith("-");
      const delta = el(
        "div",
        `display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:550;margin-top:2px;color:${up ? POS : "#b3261e"}`,
        `${up ? "▲" : "▼"} ${String(props.delta).replace(/^[-+]/, "")}`,
      );
      headR.appendChild(delta);
    }
    head.appendChild(headR);
  }
  card.appendChild(head);

  // Chart
  const W = 488;
  const H = 132;
  const padY = 10;
  const vals = points.map((p) => p.value);
  const max = vals.length ? Math.max(...vals) : 1;
  const min = vals.length ? Math.min(...vals) : 0;
  const span = max - min || 1;
  const x = (i: number) => (points.length <= 1 ? 0 : (i / (points.length - 1)) * W);
  const y = (v: number) => H - padY - ((v - min) / span) * (H - padY * 2);

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, preserveAspectRatio: "none" });
  (svg as SVGElement).style.cssText = "display:block;overflow:visible";

  // gradient def
  const defs = svgEl("defs", {});
  const grad = svgEl("linearGradient", { id: "otto-area-grad", x1: "0", y1: "0", x2: "0", y2: "1" });
  grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": BRAND, "stop-opacity": "0.22" }));
  grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": BRAND, "stop-opacity": "0" }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  if (points.length >= 2) {
    // baseline
    svg.appendChild(svgEl("line", { x1: 0, y1: H - padY, x2: W, y2: H - padY, stroke: "#eceef3", "stroke-width": 1 }));

    const linePts = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
    const areaPts = `0,${H - padY} ${linePts} ${W},${H - padY}`;
    svg.appendChild(svgEl("polygon", { points: areaPts, fill: "url(#otto-area-grad)" }));
    svg.appendChild(
      svgEl("polyline", {
        points: linePts,
        fill: "none",
        stroke: BRAND,
        "stroke-width": 2.25,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      }),
    );
    // end dot
    const last = points.length - 1;
    svg.appendChild(svgEl("circle", { cx: x(last), cy: y(points[last].value), r: 4, fill: "#fff", stroke: BRAND, "stroke-width": 2.25 }));
  }
  card.appendChild(svg);

  // x-axis labels (first / mid / last)
  if (points.length >= 2) {
    const axis = el("div", `display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:${MUTED}`);
    const mid = Math.floor((points.length - 1) / 2);
    [points[0], points[mid], points[points.length - 1]].forEach((p, i) => {
      axis.appendChild(el("span", i === 1 ? "opacity:0.75" : "", p.label));
    });
    card.appendChild(axis);
  }

  if (props.footnote) {
    card.appendChild(el("div", `margin-top:10px;padding-top:10px;border-top:1px solid #f0f0f4;font-size:11px;color:#9a9a9a`, String(props.footnote)));
  }
  return card;
};

// ---------------------------------------------------------------------------
// otto_bar_chart — ranked horizontal bars
// props: { title?, subtitle?, bars: {label, value, sub?, display?}[] }
// ---------------------------------------------------------------------------
export const OttoBarChart: ComponentRenderer = (props) => {
  const card = chartCard();
  const bars = Array.isArray(props.bars)
    ? (props.bars as Record<string, unknown>[]).map((b) => ({
        label: String(b.label ?? ""),
        value: Number(b.value ?? 0) || 0,
        sub: b.sub !== undefined ? String(b.sub) : "",
        display: b.display !== undefined ? String(b.display) : undefined,
      }))
    : [];

  const head = el("div", "margin-bottom:14px");
  head.appendChild(el("div", `font-size:13.5px;font-weight:600;color:${INK};letter-spacing:-0.01em`, String(props.title ?? "Top products")));
  if (props.subtitle) head.appendChild(el("div", `font-size:12px;color:${MUTED};margin-top:2px`, String(props.subtitle)));
  card.appendChild(head);

  const max = bars.reduce((m, b) => Math.max(m, b.value), 0) || 1;
  const list = el("div", "display:flex;flex-direction:column;gap:12px");
  bars.forEach((b, i) => {
    const row = el("div", "");
    const top = el("div", "display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:5px");
    const left = el("div", "display:flex;align-items:baseline;gap:7px;min-width:0");
    left.appendChild(el("span", `font-size:13px;font-weight:550;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`, b.label));
    if (b.sub) left.appendChild(el("span", `font-size:11.5px;color:${MUTED};flex:none`, b.sub));
    top.appendChild(left);
    top.appendChild(el("span", `font-size:12.5px;font-weight:600;color:${INK};flex:none`, b.display ?? String(b.value)));
    row.appendChild(top);

    const track = el("div", "position:relative;height:8px;border-radius:999px;background:#f1f1f4;overflow:hidden");
    const pct = Math.max(3, Math.round((b.value / max) * 100));
    // Lead bar full-strength, the rest slightly stepped down for a ranked feel.
    const alpha = 1 - Math.min(i, 3) * 0.14;
    const fill = el(
      "div",
      `position:absolute;left:0;top:0;bottom:0;width:${pct}%;border-radius:999px;background:${BRAND};opacity:${alpha.toFixed(2)}`,
    );
    track.appendChild(fill);
    row.appendChild(track);
    list.appendChild(row);
  });
  card.appendChild(list);

  if (props.footnote) {
    card.appendChild(el("div", `margin-top:12px;padding-top:10px;border-top:1px solid #f0f0f4;font-size:11px;color:#9a9a9a`, String(props.footnote)));
  }
  return card;
};

/** Register both inline charts on the given registry. */
export function registerOttoCharts(registry: {
  register: (name: string, renderer: ComponentRenderer) => void;
}): void {
  registry.register("otto_sales_chart", OttoSalesChart);
  registry.register("otto_bar_chart", OttoBarChart);
}
