import type {
  AgentWidgetConfig,
  AgentWidgetStateSnapshot,
} from "../types";
import { isDockedMountMode, resolveDockConfig } from "../utils/dock";

export type WidgetHostLayoutMode = "direct" | "docked";

export type WidgetHostLayout = {
  mode: WidgetHostLayoutMode;
  host: HTMLElement;
  shell: HTMLElement | null;
  syncWidgetState: (state: Pick<AgentWidgetStateSnapshot, "open" | "launcherEnabled">) => void;
  updateConfig: (config?: AgentWidgetConfig) => void;
  destroy: () => void;
};

const setDirectHostStyles = (host: HTMLElement, config?: AgentWidgetConfig): void => {
  const launcherEnabled = config?.launcher?.enabled ?? true;
  host.className = "persona-host";
  host.style.height = launcherEnabled ? "" : "100%";
  host.style.display = launcherEnabled ? "" : "flex";
  host.style.flexDirection = launcherEnabled ? "" : "column";
  host.style.flex = launcherEnabled ? "" : "1 1 auto";
  host.style.minHeight = launcherEnabled ? "" : "0";
};

const applyDockStyles = (
  shell: HTMLElement,
  contentSlot: HTMLElement,
  dockSlot: HTMLElement,
  host: HTMLElement,
  config: AgentWidgetConfig | undefined,
  expanded: boolean
): void => {
  const dock = resolveDockConfig(config);
  const width = expanded ? dock.width : dock.collapsedWidth;

  shell.dataset.personaHostLayout = "docked";
  shell.dataset.personaDockSide = dock.side;
  shell.dataset.personaDockOpen = expanded ? "true" : "false";
  shell.style.display = "flex";
  shell.style.flexDirection = "row";
  shell.style.alignItems = "stretch";
  shell.style.width = "100%";
  shell.style.maxWidth = "100%";
  shell.style.minWidth = "0";
  shell.style.height = "100%";
  shell.style.minHeight = "0";
  shell.style.position = "relative";

  contentSlot.style.display = "flex";
  contentSlot.style.flexDirection = "column";
  contentSlot.style.flex = "1 1 auto";
  contentSlot.style.minWidth = "0";
  contentSlot.style.minHeight = "0";
  contentSlot.style.position = "relative";

  dockSlot.style.display = "flex";
  dockSlot.style.flexDirection = "column";
  dockSlot.style.flex = `0 0 ${width}`;
  dockSlot.style.width = width;
  dockSlot.style.maxWidth = width;
  dockSlot.style.minWidth = width;
  dockSlot.style.minHeight = "0";
  dockSlot.style.position = "relative";
  dockSlot.style.overflow = "visible";
  dockSlot.style.transition = "width 180ms ease, min-width 180ms ease, max-width 180ms ease, flex-basis 180ms ease";

  host.className = "persona-host";
  host.style.height = "100%";
  host.style.minHeight = "0";
  host.style.display = "flex";
  host.style.flexDirection = "column";
  host.style.flex = "1 1 auto";

  if (dock.side === "left") {
    if (shell.firstElementChild !== dockSlot) {
      shell.replaceChildren(dockSlot, contentSlot);
    }
  } else if (shell.lastElementChild !== dockSlot) {
    shell.replaceChildren(contentSlot, dockSlot);
  }
};

const createDirectLayout = (target: HTMLElement, config?: AgentWidgetConfig): WidgetHostLayout => {
  const host = target.ownerDocument.createElement("div");
  setDirectHostStyles(host, config);
  target.appendChild(host);

  return {
    mode: "direct",
    host,
    shell: null,
    syncWidgetState: () => {},
    updateConfig(nextConfig?: AgentWidgetConfig) {
      setDirectHostStyles(host, nextConfig);
    },
    destroy() {
      host.remove();
    },
  };
};

const createDockedLayout = (target: HTMLElement, config?: AgentWidgetConfig): WidgetHostLayout => {
  const { ownerDocument } = target;
  const originalParent = target.parentElement;

  if (!originalParent) {
    throw new Error("Docked widget target must be attached to the DOM");
  }

  const tagName = target.tagName.toUpperCase();
  if (tagName === "BODY" || tagName === "HTML") {
    throw new Error('Docked widget target must be a concrete container element, not "body" or "html"');
  }

  const originalNextSibling = target.nextSibling;
  const shell = ownerDocument.createElement("div");
  const contentSlot = ownerDocument.createElement("div");
  const dockSlot = ownerDocument.createElement("aside");
  const host = ownerDocument.createElement("div");
  let expanded = (config?.launcher?.enabled ?? true) ? (config?.launcher?.autoExpand ?? false) : true;

  contentSlot.dataset.personaDockRole = "content";
  dockSlot.dataset.personaDockRole = "panel";
  host.dataset.personaDockRole = "host";

  dockSlot.appendChild(host);
  originalParent.insertBefore(shell, target);
  contentSlot.appendChild(target);
  shell.appendChild(contentSlot);
  shell.appendChild(dockSlot);
  applyDockStyles(shell, contentSlot, dockSlot, host, config, expanded);

  return {
    mode: "docked",
    host,
    shell,
    syncWidgetState(state) {
      const nextExpanded = state.launcherEnabled ? state.open : true;
      if (expanded === nextExpanded) return;
      expanded = nextExpanded;
      applyDockStyles(shell, contentSlot, dockSlot, host, config, expanded);
    },
    updateConfig(nextConfig?: AgentWidgetConfig) {
      config = nextConfig;
      if ((config?.launcher?.enabled ?? true) === false) {
        expanded = true;
      }
      applyDockStyles(shell, contentSlot, dockSlot, host, config, expanded);
    },
    destroy() {
      if (originalParent.isConnected) {
        if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
          originalParent.insertBefore(target, originalNextSibling);
        } else {
          originalParent.appendChild(target);
        }
      }
      shell.remove();
    },
  };
};

export const createWidgetHostLayout = (
  target: HTMLElement,
  config?: AgentWidgetConfig
): WidgetHostLayout => {
  if (isDockedMountMode(config)) {
    return createDockedLayout(target, config);
  }
  return createDirectLayout(target, config);
};
