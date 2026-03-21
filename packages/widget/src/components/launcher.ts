import { createElement } from "../utils/dom";
import { AgentWidgetConfig } from "../types";
import { positionMap } from "../utils/positioning";
import { isDockedMountMode, resolveDockConfig } from "../utils/dock";
import { renderLucideIcon } from "../utils/icons";

export interface LauncherButton {
  element: HTMLButtonElement;
  update: (config: AgentWidgetConfig) => void;
  destroy: () => void;
}

export const createLauncherButton = (
  config: AgentWidgetConfig | undefined,
  onToggle: () => void
): LauncherButton => {
  const button = createElement("button") as HTMLButtonElement;
  button.type = "button";
  button.innerHTML = `
    <span class="persona-inline-flex persona-items-center persona-justify-center persona-rounded-full persona-bg-persona-primary persona-text-white" data-role="launcher-icon">💬</span>
    <img data-role="launcher-image" class="persona-rounded-full persona-object-cover" alt="" style="display:none" />
    <span class="persona-flex persona-flex-col persona-items-start persona-text-left">
      <span class="persona-text-sm persona-font-semibold persona-text-persona-primary" data-role="launcher-title"></span>
      <span class="persona-text-xs persona-text-persona-muted" data-role="launcher-subtitle"></span>
    </span>
    <span class="persona-ml-2 persona-grid persona-place-items-center persona-rounded-full persona-bg-persona-primary persona-text-persona-call-to-action" data-role="launcher-call-to-action-icon">↗</span>
  `;
  button.addEventListener("click", onToggle);

  const update = (newConfig: AgentWidgetConfig) => {
    const launcher = newConfig.launcher ?? {};
    const dockedMode = isDockedMountMode(newConfig);

    const titleEl = button.querySelector("[data-role='launcher-title']");
    if (titleEl) {
      titleEl.textContent = launcher.title ?? "Chat Assistant";
    }

    const subtitleEl = button.querySelector("[data-role='launcher-subtitle']");
    if (subtitleEl) {
      subtitleEl.textContent = launcher.subtitle ?? "Get answers fast";
    }

    // Hide/show text container
    const textContainer = button.querySelector(".persona-flex-col");
    if (textContainer) {
      if (launcher.textHidden || dockedMode) {
        (textContainer as HTMLElement).style.display = "none";
      } else {
        (textContainer as HTMLElement).style.display = "";
      }
    }

    const icon = button.querySelector<HTMLSpanElement>("[data-role='launcher-icon']");
    if (icon) {
      if (launcher.agentIconHidden) {
        icon.style.display = "none";
      } else {
        const iconSize = launcher.agentIconSize ?? "40px";
        icon.style.height = iconSize;
        icon.style.width = iconSize;
        
        // Clear existing content
        icon.innerHTML = "";
        
        // Render icon based on priority: Lucide icon > iconUrl > agentIconText
        if (launcher.agentIconName) {
          // Use Lucide icon
          const iconSizeNum = parseFloat(iconSize) || 24;
          const iconSvg = renderLucideIcon(launcher.agentIconName, iconSizeNum * 0.6, "var(--persona-text-inverse, #ffffff)", 2);
          if (iconSvg) {
            icon.appendChild(iconSvg);
            icon.style.display = "";
          } else {
            // Fallback to agentIconText if Lucide icon fails
            icon.textContent = launcher.agentIconText ?? "💬";
            icon.style.display = "";
          }
        } else if (launcher.iconUrl) {
          // Use image URL - hide icon span and show img
          icon.style.display = "none";
        } else {
          // Use text/emoji
          icon.textContent = launcher.agentIconText ?? "💬";
          icon.style.display = "";
        }
      }
    }

    const img = button.querySelector<HTMLImageElement>("[data-role='launcher-image']");
    if (img) {
      const iconSize = launcher.agentIconSize ?? "40px";
      img.style.height = iconSize;
      img.style.width = iconSize;
      if (launcher.iconUrl && !launcher.agentIconName && !launcher.agentIconHidden) {
        // Only show image if not using Lucide icon and not hidden
        img.src = launcher.iconUrl;
        img.style.display = "block";
      } else {
        img.style.display = "none";
      }
    }

    const callToActionIconEl = button.querySelector<HTMLSpanElement>("[data-role='launcher-call-to-action-icon']");
    if (callToActionIconEl) {
      const callToActionIconSize = launcher.callToActionIconSize ?? "32px";
      callToActionIconEl.style.height = callToActionIconSize;
      callToActionIconEl.style.width = callToActionIconSize;
      
      // Apply background color if configured
      if (launcher.callToActionIconBackgroundColor) {
        callToActionIconEl.style.backgroundColor = launcher.callToActionIconBackgroundColor;
        callToActionIconEl.classList.remove("persona-bg-persona-primary");
      } else {
        callToActionIconEl.style.backgroundColor = "";
        callToActionIconEl.classList.add("persona-bg-persona-primary");
      }
      
      // Calculate padding to adjust icon size
      let paddingTotal = 0;
      if (launcher.callToActionIconPadding) {
        callToActionIconEl.style.boxSizing = "border-box";
        callToActionIconEl.style.padding = launcher.callToActionIconPadding;
        // Parse padding value to calculate total padding (padding applies to both sides)
        const paddingValue = parseFloat(launcher.callToActionIconPadding) || 0;
        paddingTotal = paddingValue * 2; // padding on both sides
      } else {
        callToActionIconEl.style.boxSizing = "";
        callToActionIconEl.style.padding = "";
      }
      
      if (launcher.callToActionIconHidden) {
        callToActionIconEl.style.display = "none";
      } else {
        callToActionIconEl.style.display = dockedMode ? "none" : "";
        
        // Clear existing content
        callToActionIconEl.innerHTML = "";
        
        // Use Lucide icon if provided, otherwise fall back to text
        if (launcher.callToActionIconName) {
          // Calculate actual icon size by subtracting padding
          const containerSize = parseFloat(callToActionIconSize) || 24;
          const iconSize = Math.max(containerSize - paddingTotal, 8); // Ensure minimum size of 8px
          const iconSvg = renderLucideIcon(launcher.callToActionIconName, iconSize, "currentColor", 2);
          if (iconSvg) {
            callToActionIconEl.appendChild(iconSvg);
          } else {
            // Fallback to text if icon fails to render
            callToActionIconEl.textContent = launcher.callToActionIconText ?? "↗";
          }
        } else {
          callToActionIconEl.textContent = launcher.callToActionIconText ?? "↗";
        }
      }
    }

    const positionClass =
      launcher.position && positionMap[launcher.position]
        ? positionMap[launcher.position]
        : positionMap["bottom-right"];

    const floatingBase =
      "persona-fixed persona-flex persona-items-center persona-gap-3 persona-rounded-launcher persona-bg-persona-surface persona-py-2.5 persona-pl-3 persona-pr-3 persona-transition hover:persona-translate-y-[-2px] persona-cursor-pointer persona-z-50";
    const dockedBase =
      "persona-relative persona-mt-4 persona-mb-4 persona-mx-auto persona-flex persona-items-center persona-justify-center persona-rounded-launcher persona-bg-persona-surface persona-transition hover:persona-translate-y-[-2px] persona-cursor-pointer";

    button.className = dockedMode ? dockedBase : `${floatingBase} ${positionClass}`;
    
    // Apply launcher border and shadow from config (with defaults matching previous Tailwind classes)
    const defaultBorder = "1px solid var(--persona-border, #e5e7eb)";
    const defaultShadow = "var(--persona-shadow, 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1))";
    
    button.style.border = launcher.border ?? defaultBorder;
    button.style.boxShadow = launcher.shadow ?? defaultShadow;

    if (dockedMode) {
      const dock = resolveDockConfig(newConfig);
      button.style.width = `calc(${dock.collapsedWidth} - 16px)`;
      button.style.minWidth = "40px";
      button.style.maxWidth = `calc(${dock.collapsedWidth} - 16px)`;
      button.style.justifyContent = "center";
      button.style.padding = "12px 0";
    } else {
      button.style.width = "";
      button.style.minWidth = "";
      button.style.maxWidth = "";
      button.style.justifyContent = "";
      button.style.padding = "";
    }
  };

  const destroy = () => {
    button.removeEventListener("click", onToggle);
    button.remove();
  };

  // Initial update
  if (config) {
    update(config);
  }

  return {
    element: button,
    update,
    destroy
  };
};
