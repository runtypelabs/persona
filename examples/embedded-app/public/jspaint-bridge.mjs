// Paint Bridge — injected into the same-origin jspaint iframe by the parent
// demo page (src/webmcp-paint/jspaint-host.ts). jspaint keeps its app state in
// global *lexical* bindings (classic-script `let`/`const` in app-state.js) and
// its functions in ES modules, so neither is reachable as a `contentWindow`
// property — and the iframe's CSP (`script-src 'self'`) rules out eval. A
// same-origin module script is allowed, though: this file imports jspaint's
// own modules (singletons, so we share the app's live instances) and reads the
// lexical globals as bare identifiers, exposing one clean API object on the
// iframe's `window` for the parent to call.
//
// Strokes are simulated the way jspaint's own src/simulate-random-gestures.js
// does it: jQuery-triggered pointer events on the main canvas, which run the
// real tool code (brush dynamics, fill tolerance, undo history, toolbox UI).

/* global main_canvas, selected_colors, selected_tool, magnification, $ */

import {
	clear,
	get_tool_by_id,
	redo,
	select_tool,
	undo,
} from "./jspaint/src/functions.js";

// Friendly names the WebMCP tools use -> jspaint TOOL_* ids.
const TOOL_IDS = {
	pencil: "TOOL_PENCIL",
	brush: "TOOL_BRUSH",
	fill: "TOOL_FILL",
	airbrush: "TOOL_AIRBRUSH",
	eraser: "TOOL_ERASER",
	line: "TOOL_LINE",
	curve: "TOOL_CURVE",
	rectangle: "TOOL_RECTANGLE",
	rounded_rectangle: "TOOL_ROUNDED_RECTANGLE",
	ellipse: "TOOL_ELLIPSE",
	polygon: "TOOL_POLYGON",
};

const TOOL_NAMES = Object.fromEntries(
	Object.entries(TOOL_IDS).map(([name, id]) => [id, name]),
);

// Mirrors triggerMouseEvent in jspaint's simulate-random-gestures.js — same
// event shape, same jQuery trigger path, so it hits the same handlers.
function triggerPointerEvent(type, clientX, clientY) {
	const event = new $.Event(type, {
		view: window,
		bubbles: true,
		cancelable: true,
		clientX,
		clientY,
		screenX: clientX,
		screenY: clientY,
		offsetX: clientX,
		offsetY: clientY,
		button: 0,
		buttons: 1,
		shiftKey: false,
	});
	$(main_canvas).trigger(event);
}

// Canvas-space (pixel) coords -> viewport client coords, via the rendered
// rect so the current zoom level is accounted for automatically.
function toClient(x, y) {
	const rect = main_canvas.getBoundingClientRect();
	return {
		clientX: rect.left + ((x + 0.5) * rect.width) / main_canvas.width,
		clientY: rect.top + ((y + 0.5) * rect.height) / main_canvas.height,
	};
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const clampPoint = (p) => ({
	x: Math.max(0, Math.min(main_canvas.width - 1, Math.round(p.x))),
	y: Math.max(0, Math.min(main_canvas.height - 1, Math.round(p.y))),
});

// Densify sparse control points so freehand strokes look continuous: linear
// interpolation to <= `step` px segments. jspaint already connects consecutive
// pointermoves with lines, so this is about stroke fidelity, not gaps.
function interpolate(points, step) {
	const out = [points[0]];
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		const dist = Math.hypot(b.x - a.x, b.y - a.y);
		const segments = Math.max(1, Math.ceil(dist / step));
		for (let s = 1; s <= segments; s++) {
			out.push({
				x: a.x + ((b.x - a.x) * s) / segments,
				y: a.y + ((b.y - a.y) * s) / segments,
			});
		}
	}
	return out;
}

window.__paintBridge = {
	toolNames: Object.keys(TOOL_IDS),

	getState() {
		return {
			canvasWidth: main_canvas.width,
			canvasHeight: main_canvas.height,
			tool: TOOL_NAMES[selected_tool.id] ?? selected_tool.id,
			foregroundColor: String(selected_colors.foreground),
			backgroundColor: String(selected_colors.background),
			magnification,
		};
	},

	selectTool(name) {
		const id = TOOL_IDS[name];
		if (!id) {
			throw new Error(
				`Unknown tool "${name}". Valid tools: ${Object.keys(TOOL_IDS).join(", ")}`,
			);
		}
		select_tool(get_tool_by_id(id));
		return this.getState();
	},

	setColors(foreground, background) {
		if (foreground) selected_colors.foreground = foreground;
		if (background) selected_colors.background = background;
		// Same notification jspaint's own UI fires after color changes, so the
		// color box and any in-flight tool pick up the new selection.
		$(window).trigger("option-changed");
		return this.getState();
	},

	/**
	 * Replay a stroke through the selected tool: pointerdown at the first
	 * point, paced pointermoves along the (densified) path, pointerup at the
	 * last. Pacing makes the drawing visibly animate — that IS the demo.
	 */
	async drawStroke(rawPoints, { durationMs = 800 } = {}) {
		if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
			throw new Error("drawStroke needs at least one point");
		}
		const points = interpolate(rawPoints.map(clampPoint), 4);
		// ~120 events max per stroke keeps long paths from crawling.
		const stride = Math.max(1, Math.floor(points.length / 120));
		const sampled = points.filter((_, i) => i % stride === 0);
		if (sampled[sampled.length - 1] !== points[points.length - 1]) {
			sampled.push(points[points.length - 1]);
		}
		const delay = Math.min(16, durationMs / sampled.length);

		const first = toClient(sampled[0].x, sampled[0].y);
		triggerPointerEvent("pointerenter", first.clientX, first.clientY);
		triggerPointerEvent("pointerdown", first.clientX, first.clientY);
		// Pacing is best-effort: when the page is unfocused/occluded, Chrome
		// clamps iframe timers to ~1s, so honor a wall-clock budget and finish
		// the remaining events synchronously once it's spent. Focused pages get
		// the smooth animation; throttled ones still complete promptly.
		const budgetEndsAt = performance.now() + durationMs * 2;
		for (const point of sampled) {
			const { clientX, clientY } = toClient(point.x, point.y);
			triggerPointerEvent("pointermove", clientX, clientY);
			if (performance.now() < budgetEndsAt) await sleep(delay);
		}
		const last = toClient(
			sampled[sampled.length - 1].x,
			sampled[sampled.length - 1].y,
		);
		triggerPointerEvent("pointerup", last.clientX, last.clientY);
		return this.getState();
	},

	undo() {
		undo();
		return this.getState();
	},

	redo() {
		redo();
		return this.getState();
	},

	clearCanvas() {
		clear();
		return this.getState();
	},

	snapshot() {
		return main_canvas.toDataURL("image/png");
	},
};
