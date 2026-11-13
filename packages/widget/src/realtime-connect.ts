import type { AgentWidgetRealtimeConnectHook, AgentWidgetRealtimeConnectTrigger } from "./types";
import type { PersonaTransportWarmReason } from "./transport";

/** What the widget hands the `realtime.connect` triggers other than the default `'focus'`. */
export type RealtimeConnectHost = {
  mount: HTMLElement;
  /** The configured trigger, read live so `update()` applies. */
  mode(): AgentWidgetRealtimeConnectTrigger | AgentWidgetRealtimeConnectHook;
  connect(reason: PersonaTransportWarmReason): void;
  isOpen(): boolean;
  bus: { on(event: "widget:opened", listener: () => void): () => void };
  input(): HTMLElement | null | undefined;
};

/**
 * Wires the `'load'`, `'open'` and `'input'` triggers and a host hook. The widget
 * keeps `'focus'` itself. `sync()` re-reads the mode after `update()`; pass
 * `replaced` when the update replaced the client (and closed its socket).
 * @internal
 */
export function installRealtimeConnect(host: RealtimeConnectHost): { sync(replaced?: boolean): void; destroy(): void } {
  let hook: AgentWidgetRealtimeConnectHook | undefined;
  let cleanup: void | (() => void);
  let last: ReturnType<RealtimeConnectHost["mode"]> | undefined;
  // Host hook code may throw; neither its setup nor its cleanup may leave the widget half done.
  const release = () => {
    const done = cleanup;
    cleanup = undefined;
    try {
      if (typeof done === "function") done();
    } catch {
      // ignored, see above
    }
  };
  const sync = (replaced?: boolean) => {
    const mode = host.mode();
    // 'load' and an open widget's 'open' are due now, whenever the mode or the client changes.
    if ((replaced || mode !== last) && (mode === "load" || (mode === "open" && host.isOpen()))) {
      host.connect(host.isOpen() ? "open" : "intent");
    }
    last = mode;
    const next = typeof mode === "function" ? mode : undefined;
    if (next === hook) return;
    release();
    hook = next;
    try {
      cleanup = next?.({ connect: () => host.connect("intent"), mount: host.mount });
    } catch {
      // ignored, see above
    }
  };
  // `input` counts real typing, paste, drop or IME that leaves text, as `sessionInit: 'input'` does.
  const onInput = (event: Event) => {
    const input = host.input();
    if (
      host.mode() === "input" &&
      event.target === input &&
      (event as InputEvent).inputType &&
      (input as HTMLTextAreaElement).value.trim()
    ) {
      host.connect("intent");
    }
  };
  const offOpened = host.bus.on("widget:opened", () => {
    if (host.mode() === "open") host.connect("open");
  });
  host.mount.addEventListener("input", onInput);
  sync();
  return {
    sync,
    destroy() {
      host.mount.removeEventListener("input", onInput);
      offOpened();
      release();
    },
  };
}
