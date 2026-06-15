// Parent-side handle on the embedded jspaint iframe. Injects the bridge
// module (public/jspaint-bridge.mjs) into the same-origin iframe after load:// the iframe's CSP allows same-origin scripts but not eval, and jspaint's app
// state lives in global lexical bindings only an in-realm script can reach.
// See the bridge file's header comment for the full rationale.
//
// jspaint replaces its own document shortly after first load while setting up
// its local session (the URL gains #local:<id>), which discards anything
// injected into the first document. The returned facade therefore re-injects
// the bridge on EVERY iframe load and always delegates to the most recently
// injected bridge, never a captured one.

export type PaintState = {
  canvasWidth: number;
  canvasHeight: number;
  tool: string;
  foregroundColor: string;
  backgroundColor: string;
  magnification: number;
};

export type PaintBridge = {
  toolNames: string[];
  getState(): PaintState;
  selectTool(name: string): PaintState;
  setColors(foreground?: string, background?: string): PaintState;
  drawStroke(
    points: Array<{ x: number; y: number }>,
    options?: { durationMs?: number },
  ): Promise<PaintState>;
  undo(): PaintState;
  redo(): PaintState;
  clearCanvas(): PaintState;
  snapshot(): string;
  renderHistoryGif(): PaintState;
};

const BRIDGE_READY_TIMEOUT_MS = 15_000;

type BridgeWindow = Window & { __paintBridge?: PaintBridge };

async function injectBridge(iframe: HTMLIFrameElement): Promise<PaintBridge> {
  const frameWindow = iframe.contentWindow as BridgeWindow | null;
  const frameDocument = iframe.contentDocument;
  if (!frameWindow || !frameDocument) {
    throw new Error(
      "jspaint iframe is not same-origin: the bridge cannot be injected. " +
        "Is /jspaint/ being served? (the `jspaint` git dependency is served " +
        "by the serveJsPaint plugin in vite.config.ts; run `pnpm install`)",
    );
  }

  if (!frameWindow.__paintBridge) {
    const script = frameDocument.createElement("script");
    script.type = "module";
    script.src = "/jspaint-bridge.mjs";
    frameDocument.head.appendChild(script);
  }

  const startedAt = Date.now();
  while (!frameWindow.__paintBridge) {
    if (Date.now() - startedAt > BRIDGE_READY_TIMEOUT_MS) {
      throw new Error("Timed out waiting for the jspaint bridge to initialize");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return frameWindow.__paintBridge;
}

export async function mountJsPaint(host: HTMLElement): Promise<PaintBridge> {
  const iframe = document.createElement("iframe");
  iframe.src = "/jspaint/index.html";
  iframe.title = "JS Paint";
  iframe.className = "paint-frame";

  let bridge: PaintBridge | null = null;
  const ready = new Promise<PaintBridge>((resolve, reject) => {
    iframe.addEventListener(
      "error",
      () => reject(new Error("jspaint iframe failed to load")),
      { once: true },
    );
    // Not `once`: each document replacement fires load again and needs a
    // fresh injection into the new realm.
    iframe.addEventListener("load", () => {
      injectBridge(iframe).then((injected) => {
        bridge = injected;
        resolve(injected);
      }, reject);
    });
  });

  host.appendChild(iframe);
  await ready;

  // Delegate every call to the latest injected bridge, so tool closures stay
  // valid across jspaint's session-bootstrap reload.
  const live = (): PaintBridge => {
    if (!bridge) throw new Error("jspaint bridge is not ready");
    return bridge;
  };
  return {
    get toolNames() {
      return live().toolNames;
    },
    getState: () => live().getState(),
    selectTool: (name) => live().selectTool(name),
    setColors: (fg, bg) => live().setColors(fg, bg),
    drawStroke: (points, options) => live().drawStroke(points, options),
    undo: () => live().undo(),
    redo: () => live().redo(),
    clearCanvas: () => live().clearCanvas(),
    snapshot: () => live().snapshot(),
    renderHistoryGif: () => live().renderHistoryGif(),
  };
}
