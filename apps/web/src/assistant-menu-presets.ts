import "./assistant-research-mode.css";
import { renderLucideIcon, registerIcons } from "@runtypelabs/persona";
import type { AgentWidgetConfig, AgentWidgetPlugin, ComposerAction, ComposerMenuRenderContext, ComposerMode, ComposerModeGroup } from "@runtypelabs/persona";

// Original generic showcase glyphs; these do not enlarge the widget bundle.
const menuIcons: Parameters<typeof registerIcons>[0] = {
  "reference-research": [["circle", { cx: "10", cy: "10", r: "7" }], ["path", { d: "m15 15 6 6M6 11l3-3 2 3 3-4" }]],
  "reference-skills": [["path", { d: "M6 4h13v15H6M6 4C2 4 2 8 6 8M6 19c-4 0-4-4 0-4M6 8v7M10 8h5M10 12h5" }]],
  "reference-connectors": [["path", { d: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" }]],
  "reference-palette": [["path", { d: "M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4c6 0 4-10-5-10Z" }], ["circle", { cx: "7", cy: "10", r: "1" }], ["circle", { cx: "11", cy: "7", r: "1" }], ["circle", { cx: "16", cy: "8", r: "1" }]],
  "reference-plug": [["path", { d: "m7 3 3 3m5-3 3 3M5 10l9-9M6 9l9 9c-6 6-15-3-9-9Zm4 9-6 4" }]],
  "reference-cloud": [["path", { d: "M6 19h12a5 5 0 0 0 1-10 7 7 0 0 0-13-2 6 6 0 0 0 0 12Z" }]],
  "reference-settings": [["path", { d: "M3 6h5m4 0h9M3 12h11m4 0h3M3 18h3m4 0h11" }], ["circle", { cx: "10", cy: "6", r: "2" }], ["circle", { cx: "16", cy: "12", r: "2" }], ["circle", { cx: "8", cy: "18", r: "2" }]],
  "reference-sources": [["circle", { cx: "5", cy: "18", r: "3" }], ["circle", { cx: "19", cy: "6", r: "3" }], ["path", { d: "M8 18c8 0 0-12 8-12" }]],
  "reference-music": [["path", { d: "M9 17V5l11-2v12M9 9l11-2" }], ["ellipse", { cx: "6", cy: "18", rx: "3", ry: "2" }], ["ellipse", { cx: "17", cy: "16", rx: "3", ry: "2" }]],
};

type Row = { id: string; label: string; icon: string; group?: string; description?: string; children?: string[] };
const rows: Record<string, Row[]> = {
  chatgpt: [
    { id: "library", label: "Add from library", icon: "files", description: "Browse and search your files" },
    { id: "create-image", label: "Create image", icon: "image", description: "Visualize anything" },
  ],
  claude: [
    { id: "skills", label: "Skills", icon: "reference-skills", group: "tools", children: ["Writing", "Code review"] },
    { id: "connectors", label: "Connectors", icon: "reference-connectors", group: "tools", children: ["Browse connectors", "Manage connections"] },
    { id: "design", label: "Design system", icon: "reference-palette", group: "tools", children: ["Colors", "Typography"] },
    { id: "plugins", label: "Add plugins", icon: "reference-plug", group: "tools" },
    { id: "devices", label: "Devices", icon: "monitor", group: "tools", children: ["This computer", "Add a device"] },
  ],
  gemini: [
    { id: "drive", label: "Add from Drive", icon: "folder" },
    { id: "uploads", label: "More uploads", icon: "ellipsis", children: ["Photos", "Import a link"] },
    { id: "create-image", label: "Create image", icon: "image", group: "create" },
    { id: "create-video", label: "Create video", icon: "film", group: "create" },
    { id: "create-music", label: "Create music", icon: "reference-music", group: "create" },
    { id: "tools", label: "More tools", icon: "ellipsis", group: "create", children: ["Deep research", "Guided learning"] },
  ],
  copilot: [
    { id: "cloud", label: "Attach cloud files", icon: "reference-cloud" },
    { id: "capabilities", label: "Add capabilities", icon: "reference-settings", group: "capabilities", children: ["Research", "Create an image"] },
    { id: "sources", label: "Change data sources", icon: "reference-sources", group: "sources", children: ["Web", "Files"] },
  ],
  perplexity: [
    { id: "connectors", label: "Connectors", icon: "reference-plug", children: ["Web", "Academic", "Add files from cloud"] },
    { id: "projects", label: "Projects", icon: "folder", children: ["Project brief", "Release notes"] },
  ],
};

// Showcase-only custom content: application state belongs to the plugin, while
// Persona owns the outer popover, invocation guards, abort signal and cleanup.
export function createReferenceMenuPlugin(product: string, notice: (message: string) => void): AgentWidgetPlugin {
  registerIcons(menuIcons);
  const checked = new Set(["Web"]);
  return {
    id: `reference-menu-${product}`,
    renderComposerMenu(initial) {
      let context = initial;
      const element = document.createElement("div");
      element.className = "persona-reference-menu";
      element.style.width = "220px";
      const style = document.createElement("style");
      style.textContent = `
.persona-reference-menu{max-width:100%}
.persona-reference-menu__list{width:220px;max-width:100%}
.persona-reference-menu__child{position:fixed;width:220px;z-index:1}
.persona-reference-menu__child[hidden]{display:none}
.persona-reference-menu button{box-sizing:border-box;min-height:32px}
.persona-reference-menu button[aria-expanded="true"]{background:var(--persona-components-composer-overflowMenu-hoverBackground,#eee)}
.persona-reference-menu .persona-composer-overflow-menu__label{flex:1}
.persona-reference-menu__check{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer}
.persona-reference-menu__check input{accent-color:#4c9ca6}
.persona-reference-menu__hint{color:inherit;font-size:12px;opacity:.65;padding:8px 12px;margin:0}
.persona-reference-menu__divider{border:0;border-top:1px solid var(--persona-components-composer-overflowMenu-dividerColor,var(--persona-border));margin:var(--persona-components-composer-overflowMenu-dividerSpacing,6px) 8px}
.persona-reference-menu button:focus-visible,.persona-reference-menu__check:focus-within{outline:2px solid currentColor;outline-offset:-2px}
`;
      const list = document.createElement("div");
      list.className = "persona-reference-menu__list";
      const child = document.createElement("section");
      child.className = "persona-composer-overflow-menu persona-reference-menu__child";
      child.setAttribute("role", "region");
      child.hidden = true;
      element.append(style, list, child);
      let selected: string | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let signature = "";
      let hoverTimer: ReturnType<typeof setTimeout> | undefined;
      const view = element.ownerDocument.defaultView!;
      let frame = 0;
      const cancelHover = () => { clearTimeout(hoverTimer); hoverTimer = undefined; };
      const anchor = () => Array.from(list.querySelectorAll<HTMLButtonElement>("button")).find(node => node.dataset.action === selected);
      const positionChild = () => {
        if (child.hidden || !element.isConnected) return;
        const row = anchor();
        if (!row) return;
        const parentRect = element.parentElement!.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const rect = child.getBoundingClientRect();
        const right = parentRect.right + 4;
        const left = right + rect.width <= view.innerWidth - 8 ? right : parentRect.left - rect.width - 4;
        child.style.left = `${Math.max(8, Math.min(left, view.innerWidth - rect.width - 8))}px`;
        child.style.top = `${Math.max(8, Math.min(rowRect.top - 4, view.innerHeight - rect.height - 8))}px`;
      };
      const schedulePosition = () => {
        view.cancelAnimationFrame(frame);
        frame = view.requestAnimationFrame(positionChild);
      };
      const observer = new MutationObserver(schedulePosition);
      const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedulePosition);
      resizeObserver?.observe(child);
      view.addEventListener("resize", schedulePosition);
      view.addEventListener("scroll", schedulePosition, true);
      const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
      const cleanup = () => {
        cancel(); cancelHover(); view.cancelAnimationFrame(frame);
        observer.disconnect(); resizeObserver?.disconnect();
        view.removeEventListener("resize", schedulePosition);
        view.removeEventListener("scroll", schedulePosition, true);
      };
      context.signal.addEventListener("abort", cleanup, { once: true });
      const button = (label: string, icon: string, onClick: () => void) => {
        const node = document.createElement("button");
        node.type = "button";
        node.className = "persona-composer-overflow-menu__item";
        const glyph = renderLucideIcon(icon, 20, "currentColor", 1.6);
        if (glyph) { glyph.setAttribute("aria-hidden", "true"); node.append(glyph); }
        const text = document.createElement("span");
        text.className = "persona-composer-overflow-menu__label";
        text.textContent = label;
        node.append(text);
        node.onclick = onClick;
        return node;
      };
      const closeChild = (restoreFocus = true) => {
        cancel(); cancelHover();
        restoreFocus ||= child.contains(element.ownerDocument.activeElement);
        const previous = selected;
        selected = undefined;
        child.hidden = true;
        child.replaceChildren();
        list.querySelectorAll<HTMLButtonElement>("button").forEach(node => {
          if (node.hasAttribute("aria-expanded")) node.setAttribute("aria-expanded", "false");
          if (restoreFocus && node.dataset.action === previous) node.focus();
        });
      };
      const focusChild = () => child.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled)')?.focus();
      const showChild = (row: Row, focus = true) => {
        cancelHover();
        if (selected === row.id) { if (focus) focusChild(); return; }
        cancel(); selected = row.id;
        child.hidden = false;
        child.setAttribute("aria-label", row.label);
        child.replaceChildren();
        list.querySelectorAll<HTMLButtonElement>("button[aria-expanded]").forEach(node => node.setAttribute("aria-expanded", String(node.dataset.action === row.id)));
        if (element.parentElement) observer.observe(element.parentElement, { attributes: true, attributeFilter: ["style"] });
        const populate = () => {
          timer = undefined;
          if (context.signal.aborted || selected !== row.id) return;
          child.replaceChildren();
          for (const label of row.children ?? []) {
            if (product === "perplexity" && row.id === "connectors") {
              const wrapper = document.createElement("label");
              wrapper.className = "persona-reference-menu__check";
              const input = document.createElement("input");
              input.type = "checkbox"; input.checked = checked.has(label);
              input.disabled = label === "Add files from cloud";
              input.onchange = () => { if (input.checked) checked.add(label); else checked.delete(label); notice(`Sample sources: ${[...checked].join(", ") || "none"}`); };
              wrapper.append(input, document.createTextNode(input.disabled ? `${label} · unavailable in demo` : label));
              child.append(wrapper);
            } else child.append(button(label, row.icon, () => { notice(`${label} is a local menu demonstration.`); context.actions.close(); }));
          }
          positionChild();
          // Hover must not steal focus; keyboard/click entry may focus loaded options.
          if (focus && element.contains(element.ownerDocument.activeElement)) focusChild();
        };
        if (product === "perplexity") {
          const status = document.createElement("p");
          status.className = "persona-reference-menu__hint";
          status.setAttribute("role", "status");
          status.textContent = "Loading sample options…";
          child.append(status);
          timer = setTimeout(populate, 450);
        } else populate();
        positionChild();
      };
      const leave = (event: PointerEvent) => {
        if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
        cancelHover(); hoverTimer = setTimeout(() => closeChild(false), 300);
      };
      list.addEventListener("pointerleave", leave);
      child.addEventListener("pointerleave", leave);
      child.addEventListener("pointerenter", cancelHover);
      const update = (next: ComposerMenuRenderContext) => {
        context = next;
        const nextSignature = JSON.stringify(next.items);
        if (signature === nextSignature) return;
        signature = nextSignature;
        const active = element.ownerDocument.activeElement as HTMLElement | null;
        const focused = active?.dataset.action;
        list.replaceChildren();
        let previousGroup: string | undefined;
        for (const item of next.items) {
          if (list.childElementCount && item.group !== previousGroup) {
            const divider = document.createElement("hr"); divider.className = "persona-reference-menu__divider"; list.append(divider);
          }
          previousGroup = item.group;
          const row = rows[product]?.find(candidate => candidate.id === item.id);
          const node = button(item.label, item.iconName ?? "paperclip", () => {
            if (row?.children) showChild(row);
            else context.actions.invoke(item.id);
          });
          node.dataset.action = item.id;
          node.disabled = item.disabled || item.busy;
          node.addEventListener("pointerenter", event => {
            if (event.pointerType === "touch" || node.disabled) return;
            cancelHover();
            hoverTimer = setTimeout(() => row?.children ? showChild(row, false) : closeChild(false), 140);
          });
          if (row?.children) {
            node.setAttribute("aria-expanded", String(selected === row.id));
            const arrow = renderLucideIcon("chevron-right", 16, "currentColor", 1.5);
            if (arrow) { arrow.setAttribute("aria-hidden", "true"); node.append(arrow); }
          }
          list.append(node);
          if (focused === item.id) node.focus();
        }
        if (selected && !next.items.some(item => item.id === selected && !item.disabled && !item.busy)) closeChild();
      };
      element.addEventListener("keydown", event => {
        const target = event.target as HTMLElement;
        if (selected && (event.key === "Escape" || (event.key === "ArrowLeft" && child.contains(target)))) {
          event.preventDefault(); event.stopPropagation(); closeChild(); return;
        }
        if (event.key === "ArrowRight" && list.contains(target)) {
          const row = rows[product]?.find(candidate => candidate.id === target.closest<HTMLButtonElement>("button")?.dataset.action);
          if (row?.children) { event.preventDefault(); showChild(row); }
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          const panel = child.contains(target) ? child : list;
          const targets = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'));
          const index = targets.indexOf(target);
          const next = event.key === "Home" ? 0 : event.key === "End" ? targets.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + targets.length) % targets.length;
          event.preventDefault(); targets[next]?.focus();
        }
      });
      update(initial);
      return { element, role: "dialog", update, destroy() { cleanup(); context.signal.removeEventListener("abort", cleanup); } };
    },
  };
}

export function createAssistantMenuPreset(product: string, notice: (message: string) => void) {
  registerIcons(menuIcons);
  const chatgpt = product === "chatgpt";
  const claude = product === "claude";
  const gemini = product === "gemini";
  const copilot = product === "copilot";
  const actions: ComposerAction[] = (rows[product] ?? []).map((row, index) => ({
    id: row.id, label: row.label, iconName: row.icon, description: row.description, group: row.group,
    placement: "start", presentation: "overflow", order: 250 + index * 10,
    onSelect: () => notice(`${row.label} is a local menu demonstration; connect your own service.`),
  }));
  const menu: NonNullable<NonNullable<AgentWidgetConfig["composer"]>["actionOverflow"]>["menu"] = {
    width: chatgpt ? "composer" : "content", descriptionLayout: chatgpt ? "inline" : "stacked", placement: copilot ? "above" : "below",
    triggerIconName: "plus", openTriggerIconName: gemini || product === "perplexity" ? "x" : "plus",
    items: { "core:attachment": { label: chatgpt ? "Add photos & files" : claude ? "Upload or add files" : gemini ? "Upload files" : copilot ? "Upload images and files" : "Upload files or images", ...(chatgpt ? { description: "Upload from computer" } : {}) }, ...(claude ? { "core:mode:research": { label: "Research", group: "research" } } : {}) },
  };
  const theme = {
    background: chatgpt ? "#303030" : claude ? "#ffffff" : gemini ? "#1e1f20" : copilot ? "#242424" : "#1b2023",
    foreground: claude ? "#171717" : "#e5e5e5", borderColor: claude ? "#d4d4d4" : gemini || copilot ? "transparent" : "#454545",
    borderRadius: gemini ? "24px" : "16px", shadow: "0 6px 18px rgba(0,0,0,.2)",
    padding: claude ? "4px" : "8px", rowGap: claude ? "0px" : "2px", rowPadding: claude ? "6px 10px" : "10px 12px", rowBorderRadius: chatgpt ? "12px" : "8px",
    fontSize: "14px", lineHeight: "20px", iconSize: "20px", iconGap: "12px",
    hoverBackground: chatgpt ? "#454545" : claude ? "#f3f3f3" : "#2c3032", focusBackground: claude ? "#f3f3f3" : "#454545",
    descriptionColor: "#aaa", descriptionFontSize: "14px", dividerColor: claude ? "#e4e4e4" : "#444", dividerSpacing: "6px",
    minWidth: "220px", maxHeight: "420px",
  };
  const modes: ComposerMode[] = claude ? [{ id: "research", groupId: "research", label: "Research mode", shortLabel: "", iconName: "reference-research", presentation: "overflow", persistence: "sticky" }] : [];
  const modeGroups: ComposerModeGroup[] = claude ? [{ id: "research", selection: "multiple", chipVisibility: "hidden" }] : [];
  return { actions, menu, theme, modes, modeGroups, plugins: chatgpt ? [] : [createReferenceMenuPlugin(product, notice)] };
}
