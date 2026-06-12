import type { PaintBridge } from "./jspaint-host";

// WebMCP tool surface for the jspaint demo — spike scope. Operator-level
// tools that drive jspaint's real UI (tool palette, undo stack, brush
// dynamics) through the injected bridge, plus the snapshot tool that closes
// the visual loop by returning the canvas as an MCP image content block
// (same shape as the Theme Copilot's screenshot_preview).

const OWNER = "__webmcpPaintAbort";

declare global {
  interface Window {
    [OWNER]?: AbortController;
  }
}

// Only canvas-wiping tools raise Persona's approval bubble — strokes, fills,
// and color changes auto-approve so the user can watch the agent paint live
// (and everything lands on jspaint's undo stack anyway).
export const APPROVAL_REQUIRED_TOOL_NAMES = new Set(["clear_canvas"]);

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
    tool: ToolDescriptor,
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

const HEX_COLOR = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };

const POINT = {
  type: "object",
  properties: {
    x: { type: "number" },
    y: { type: "number" },
  },
  required: ["x", "y"],
  additionalProperties: false,
};

export function setupPaintTools(bridge: PaintBridge): void {
  const modelContext = getModelContext();
  if (!modelContext) {
    console.warn("[Paint] document.modelContext unavailable; tools not registered");
    return;
  }

  window[OWNER]?.abort();
  const controller = new AbortController();
  window[OWNER] = controller;
  const signal = controller.signal;

  const toolEnum = bridge.toolNames;

  // Optional tool/color riders on the drawing tools cut round trips: one
  // draw_stroke call can switch to the brush, set red, and paint.
  const applyRiders = (args: Record<string, unknown>): void => {
    if (typeof args.tool === "string") bridge.selectTool(args.tool);
    if (typeof args.color === "string") bridge.setColors(args.color);
  };

  const tools: ToolDescriptor[] = [
    {
      name: "get_canvas_info",
      title: "Read canvas state",
      description:
        "Read the canvas dimensions, the currently selected tool, and the current foreground/background colors. Call this first to learn the coordinate space — the origin is the top-left, x grows right, y grows down.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => toolResult(bridge.getState()),
    },
    {
      name: "select_tool",
      title: "Pick a paint tool",
      description:
        "Select a tool in the paint app's toolbox, exactly like clicking it. Shape tools (line, rectangle, rounded_rectangle, ellipse) draw from the first to the last point of the next stroke.",
      inputSchema: {
        type: "object",
        properties: {
          tool: { type: "string", enum: toolEnum },
        },
        required: ["tool"],
        additionalProperties: false,
      },
      execute: (args) =>
        toolResult(bridge.selectTool(String(args.tool)), `Selected ${args.tool}.`),
    },
    {
      name: "set_colors",
      title: "Set the colors",
      description:
        "Set the foreground (left-click) and/or background (right-click) paint colors as #rrggbb hex.",
      inputSchema: {
        type: "object",
        properties: {
          foreground: HEX_COLOR,
          background: HEX_COLOR,
        },
        additionalProperties: false,
      },
      execute: (args) =>
        toolResult(
          bridge.setColors(
            typeof args.foreground === "string" ? args.foreground : undefined,
            typeof args.background === "string" ? args.background : undefined,
          ),
          "Colors updated.",
        ),
    },
    {
      name: "draw_stroke",
      title: "Draw a stroke",
      description:
        "Draw one continuous stroke through the given canvas-pixel points using the selected tool — a freehand path for pencil/brush/airbrush/eraser, or first-to-last for shape tools (line, rectangle, ellipse: pass exactly 2 points, the corners/endpoints). Optionally switch tool and foreground color in the same call. The stroke animates live on screen.",
      inputSchema: {
        type: "object",
        properties: {
          points: { type: "array", items: POINT, minItems: 1, maxItems: 200 },
          tool: { type: "string", enum: toolEnum },
          color: HEX_COLOR,
        },
        required: ["points"],
        additionalProperties: false,
      },
      execute: async (args) => {
        applyRiders(args);
        const points = args.points as Array<{ x: number; y: number }>;
        const state = await bridge.drawStroke(points);
        return toolResult(state, `Stroke drawn through ${points.length} points.`);
      },
    },
    {
      name: "flood_fill",
      title: "Fill an area",
      description:
        "Flood-fill the contiguous region at the given canvas-pixel point with the foreground color (like the paint bucket). Optionally set the fill color in the same call.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          color: HEX_COLOR,
        },
        required: ["x", "y"],
        additionalProperties: false,
      },
      execute: async (args) => {
        if (typeof args.color === "string") bridge.setColors(args.color);
        bridge.selectTool("fill");
        const point = { x: Number(args.x), y: Number(args.y) };
        const state = await bridge.drawStroke([point]);
        return toolResult(state, `Filled at (${point.x}, ${point.y}).`);
      },
    },
    {
      name: "get_canvas_snapshot",
      title: "Look at the canvas",
      description:
        "Capture the current canvas as an image — exactly what the user sees. Call this after drawing to check your work and fix mistakes, or to see what the user has drawn.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => {
        const dataUrl = bridge.snapshot();
        const state = bridge.getState();
        // Built by hand rather than via toolResult(): mirroring the base64
        // into structuredContent would double the /resume payload.
        return {
          content: [
            {
              type: "text",
              text: `Canvas snapshot (${state.canvasWidth}x${state.canvasHeight}).`,
            },
            {
              type: "image",
              data: dataUrl.slice(dataUrl.indexOf(",") + 1),
              mimeType: "image/png",
            },
          ],
        };
      },
    },
    {
      name: "render_replay_gif",
      title: "Replay the drawing as a GIF",
      description:
        "Open the paint app's 'Render History as GIF' window: an animated replay of every stroke since the canvas was last cleared, with a Save button the user can click to keep it. Call this once at the end of a finished drawing (especially a speedrun) — the replay is the shareable artifact.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () =>
        toolResult(
          bridge.renderHistoryGif(),
          "Replay GIF window opened — the user can hit Save to keep it.",
        ),
    },
    {
      name: "undo",
      title: "Undo",
      description: "Undo the most recent change(s) on the canvas.",
      inputSchema: {
        type: "object",
        properties: {
          steps: { type: "integer", minimum: 1, maximum: 20, default: 1 },
        },
        additionalProperties: false,
      },
      execute: (args) => {
        const steps = typeof args.steps === "number" ? args.steps : 1;
        let state = bridge.getState();
        for (let i = 0; i < steps; i++) state = bridge.undo();
        return toolResult(state, `Undid ${steps} step${steps === 1 ? "" : "s"}.`);
      },
    },
    {
      name: "clear_canvas",
      title: "Clear the canvas",
      description:
        "Clear the entire canvas to white. Asks the user for confirmation first.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { destructiveHint: true },
      execute: () => toolResult(bridge.clearCanvas(), "Canvas cleared."),
    },
  ];

  for (const tool of tools) {
    try {
      const descriptor = tool.title
        ? { ...tool, annotations: { title: tool.title, ...tool.annotations } }
        : tool;
      modelContext.registerTool(descriptor, { signal });
    } catch (error) {
      console.warn(`[Paint] Failed to register ${tool.name}`, error);
    }
  }
}
