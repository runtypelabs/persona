import {
  createAgentExperience,
  initAgentWidget,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import type { Mode } from "./examples-nav";

export type { Mode };

export type MountHost = {
  /** The `.stage-widget` element. Mode-specific render goes here. */
  stage: HTMLElement;
  /** The `[data-mount-toolbar]` element. The pill group renders here. */
  toolbar: HTMLElement;
};

export type Teardown = () => void;

export type MountFactory = (
  mode: Mode,
  host: MountHost,
) => Teardown | Promise<Teardown>;

export type MountModeConfig = {
  /** Used as the localStorage key. */
  slug: string;
  /** Supported modes, in display order. First is the default if nothing is persisted. */
  modes: readonly Mode[];
  /** Build the widget for the given mode and return a teardown function. */
  mount: MountFactory;
};

const MODE_LABEL: Readonly<Record<Mode, string>> = {
  inline: "Inline",
  launcher: "Launcher",
  fullscreen: "Fullscreen",
};

const MODE_DESCRIPTION: Readonly<Record<Mode, string>> = {
  inline: "Mounted inside this page (default).",
  launcher: "Floating launcher in the demo canvas.",
  fullscreen: "Widget fills the viewport.",
};

const isValidMode = (
  value: string | null,
  allowed: readonly Mode[],
): value is Mode => {
  if (!value) return false;
  return (allowed as readonly string[]).includes(value);
};

const readHashMode = (allowed: readonly Mode[]): Mode | null => {
  const hash = window.location.hash;
  const match = /[#&]mount=([^&]+)/.exec(hash);
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  return isValidMode(value, allowed) ? value : null;
};

const writeHashMode = (mode: Mode): void => {
  const url = new URL(window.location.href);
  url.hash = `mount=${mode}`;
  window.history.replaceState(null, "", url.toString());
};

const storageKey = (slug: string) => `persona-demo-mount-mode:${slug}`;

const readStoredMode = (
  slug: string,
  allowed: readonly Mode[],
): Mode | null => {
  try {
    const value = window.localStorage.getItem(storageKey(slug));
    // Fullscreen is treated as an immersive/temporary view, not a sticky
    // preference — landing on a fresh page in fullscreen hides the toolbar
    // and disorients the user. Clear stale stored values.
    if (value === "fullscreen") {
      window.localStorage.removeItem(storageKey(slug));
      return null;
    }
    return isValidMode(value, allowed) ? value : null;
  } catch {
    return null;
  }
};

const writeStoredMode = (slug: string, mode: Mode): void => {
  if (mode === "fullscreen") return;
  try {
    window.localStorage.setItem(storageKey(slug), mode);
  } catch {
    // ignore quota / private mode errors
  }
};

/**
 * Default scaffold for launcher mode: render a faux host-page canvas inside
 * the stage and append a launcher mount target in the bottom-right.
 *
 * Demos can opt out by calling `mount` themselves and ignoring this helper.
 */
export function renderLauncherScene(stage: HTMLElement): {
  scene: HTMLElement;
  mountEl: HTMLElement;
} {
  stage.innerHTML = "";
  const scene = document.createElement("div");
  scene.className = "launcher-scene";
  scene.innerHTML = `
    <div class="launcher-scene-host">
      <div class="launcher-scene-card">
        <span class="launcher-scene-eyebrow">Your site</span>
        <h2>Imagine this is your website.</h2>
        <p>The Persona launcher floats in the corner.</p>
        <p>Click it to open the chat.</p>
      </div>
    </div>
  `;
  const mountEl = document.createElement("div");
  mountEl.className = "launcher-scene-mount";
  scene.appendChild(mountEl);
  stage.appendChild(scene);
  return { scene, mountEl };
}

/**
 * Default scaffold for inline mode: empty the stage and return an `<div>` that
 * fills it. Demos with custom inline UI (e.g., the artifact demo) should not
 * use this — they own the stage directly.
 */
export function renderInlineMount(stage: HTMLElement): HTMLElement {
  stage.innerHTML = "";
  const mount = document.createElement("div");
  mount.className = "stage-inline-mount";
  stage.appendChild(mount);
  return mount;
}

/**
 * One-liner widget mount that handles inline + launcher + fullscreen variants.
 *
 * - `inline` / `fullscreen` → `createAgentExperience` into a fill-the-stage div
 * - `launcher` → `initAgentWidget` into the bottom-right of a faux host scene
 *
 * The returned `controller` is suitable for `controller.update(...)`,
 * `controller.on(...)`, etc. Call `teardown()` from the `setupMountMode.mount`
 * factory's return value to destroy the widget when the mode changes.
 */
export function runWidgetMount(
  mode: Mode,
  stage: HTMLElement,
  config: AgentWidgetConfig,
): { controller: AgentWidgetController; teardown: Teardown } {
  if (mode === "launcher") {
    const { mountEl } = renderLauncherScene(stage);
    const handle = initAgentWidget({ target: mountEl, config });
    return {
      controller: handle as unknown as AgentWidgetController,
      teardown: () => handle.destroy(),
    };
  }
  const mount = renderInlineMount(stage);
  mount.style.height = "100%";
  const controller = createAgentExperience(mount, config);
  return { controller, teardown: () => controller.destroy() };
}

const buildToolbar = (
  toolbar: HTMLElement,
  modes: readonly Mode[],
  current: Mode,
  onSelect: (mode: Mode) => void,
): void => {
  toolbar.classList.add("mount-toggle");
  toolbar.innerHTML = `
    <span class="mount-toggle-label">View as</span>
    <div class="mount-toggle-group" role="group" aria-label="Mount mode">
      ${modes
        .map(
          (mode) =>
            `<button type="button" class="mount-toggle-button" data-mode="${mode}" aria-pressed="${mode === current ? "true" : "false"}" title="${MODE_DESCRIPTION[mode]}">${MODE_LABEL[mode]}</button>`,
        )
        .join("")}
    </div>
  `;
  toolbar.querySelectorAll<HTMLButtonElement>(".mount-toggle-button").forEach(
    (btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode as Mode | undefined;
        if (!mode || btn.getAttribute("aria-pressed") === "true") return;
        onSelect(mode);
      });
    },
  );
};

const updatePressedState = (
  toolbar: HTMLElement,
  mode: Mode,
): void => {
  toolbar.querySelectorAll<HTMLButtonElement>(".mount-toggle-button").forEach(
    (btn) => {
      btn.setAttribute(
        "aria-pressed",
        btn.dataset.mode === mode ? "true" : "false",
      );
    },
  );
};

const ensureSlots = (): { stage: HTMLElement; toolbar: HTMLElement } | null => {
  const stage = document.querySelector<HTMLElement>(".stage-widget");
  const toolbar = document.querySelector<HTMLElement>("[data-mount-toolbar]");
  if (!stage || !toolbar) {
    console.warn(
      "[mount-mode] Could not find `.stage-widget` and `[data-mount-toolbar]` slots in the DOM.",
    );
    return null;
  }
  return { stage, toolbar };
};

/**
 * Wire up the mount-mode toggle for a demo page.
 *
 * Expectations on the page DOM:
 *   - A `.stage-widget` element where the widget renders.
 *   - A `[data-mount-toolbar]` element where the toggle renders.
 *
 * If only one mode is provided, the toggle is omitted and `mount` is called
 * once with that mode.
 */
export function setupMountMode(config: MountModeConfig): void {
  const slots = ensureSlots();
  if (!slots) return;
  const { stage, toolbar } = slots;
  const { slug, modes, mount } = config;
  if (modes.length === 0) return;

  const initial: Mode =
    readHashMode(modes) ?? readStoredMode(slug, modes) ?? modes[0];

  let activeTeardown: Teardown | null = null;
  let currentMode: Mode = initial;
  let switching = false;

  const cleanup = (): void => {
    if (activeTeardown) {
      try {
        activeTeardown();
      } catch (err) {
        console.error("[mount-mode] teardown failed", err);
      }
      activeTeardown = null;
    }
    document.body.classList.remove("is-fullscreen");
  };

  const applyMode = async (mode: Mode): Promise<void> => {
    if (switching) return;
    switching = true;
    try {
      cleanup();
      currentMode = mode;
      if (mode === "fullscreen") {
        document.body.classList.add("is-fullscreen");
      }
      updatePressedState(toolbar, mode);
      const result = mount(mode, { stage, toolbar });
      activeTeardown = result instanceof Promise ? await result : result;
    } finally {
      switching = false;
    }
  };

  if (modes.length > 1) {
    buildToolbar(toolbar, modes, initial, (mode) => {
      if (mode === currentMode) return;
      writeStoredMode(slug, mode);
      writeHashMode(mode);
      void applyMode(mode);
    });
  } else {
    // Single-mode: hide the toolbar entirely.
    toolbar.style.display = "none";
  }

  void applyMode(initial);

  // Anchor links like <a href="#mount=inline"> (used by the fullscreen-exit
  // button) fire `hashchange` rather than reloading. Toolbar clicks use
  // history.replaceState which does NOT fire hashchange, so this listener
  // only picks up real user-driven hash changes.
  const onHashChange = (): void => {
    const hashMode = readHashMode(modes);
    if (hashMode && hashMode !== currentMode) {
      writeStoredMode(slug, hashMode);
      void applyMode(hashMode);
    }
  };
  window.addEventListener("hashchange", onHashChange);

  window.addEventListener("beforeunload", cleanup);
}
