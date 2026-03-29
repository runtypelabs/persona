import type { ComponentContext, ComponentRenderer } from "./registry";

/**
 * Default artifact card renderer.
 * Builds the compact clickable card shown in the chat thread.
 */
function renderDefaultArtifactCard(
  props: Record<string, unknown>,
  _context: ComponentContext
): HTMLElement {
  const title =
    typeof props.title === "string" && props.title
      ? props.title
      : "Untitled artifact";
  const artifactId =
    typeof props.artifactId === "string" ? props.artifactId : "";
  const status = props.status === "streaming" ? "streaming" : "complete";
  const artifactType =
    typeof props.artifactType === "string" ? props.artifactType : "markdown";
  const subtitle =
    artifactType === "component" ? "Component" : "Document";

  const root = document.createElement("div");
  root.className =
    "persona-flex persona-w-full persona-max-w-full persona-items-center persona-gap-3 persona-rounded-xl persona-px-4 persona-py-3";
  root.style.border = "1px solid var(--persona-border, #e5e7eb)";
  root.style.backgroundColor = "var(--persona-bg, #ffffff)";
  root.style.cursor = "pointer";
  root.tabIndex = 0;
  root.setAttribute("role", "button");
  root.setAttribute("aria-label", `Open ${title} in artifact panel`);
  if (artifactId) {
    root.setAttribute("data-open-artifact", artifactId);
  }

  // Document icon
  const iconBox = document.createElement("div");
  iconBox.className =
    "persona-flex persona-h-10 persona-w-10 persona-flex-shrink-0 persona-items-center persona-justify-center persona-rounded-lg";
  iconBox.style.border = "1px solid var(--persona-border, #e5e7eb)";
  iconBox.style.color = "var(--persona-muted, #9ca3af)";
  iconBox.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`;

  // Title and subtitle
  const meta = document.createElement("div");
  meta.className =
    "persona-min-w-0 persona-flex-1 persona-flex persona-flex-col persona-gap-0.5";

  const titleEl = document.createElement("div");
  titleEl.className = "persona-truncate persona-text-sm persona-font-medium";
  titleEl.style.color = "var(--persona-text, #1f2937)";
  titleEl.textContent = title;

  const subtitleEl = document.createElement("div");
  subtitleEl.className = "persona-text-xs persona-flex persona-items-center persona-gap-1.5";
  subtitleEl.style.color = "var(--persona-muted, #9ca3af)";

  if (status === "streaming") {
    // Pulsing dot for streaming status
    const dot = document.createElement("span");
    dot.className = "persona-inline-block persona-w-1.5 persona-h-1.5 persona-rounded-full";
    dot.style.backgroundColor = "var(--persona-primary, #171717)";
    dot.style.animation = "persona-pulse 1.5s ease-in-out infinite";
    subtitleEl.appendChild(dot);

    const statusText = document.createElement("span");
    statusText.textContent = `Generating ${subtitle.toLowerCase()}...`;
    subtitleEl.appendChild(statusText);
  } else {
    subtitleEl.textContent = subtitle;
  }

  meta.append(titleEl, subtitleEl);
  root.append(iconBox, meta);

  // Download button (visible when artifact is complete)
  if (status === "complete") {
    const dl = document.createElement("button");
    dl.type = "button";
    dl.textContent = "Download";
    dl.title = `Download ${title}`;
    dl.className =
      "persona-flex-shrink-0 persona-rounded-md persona-px-3 persona-py-1.5 persona-text-xs persona-font-medium";
    dl.style.border = "1px solid var(--persona-border, #e5e7eb)";
    dl.style.color = "var(--persona-text, #1f2937)";
    dl.style.backgroundColor = "transparent";
    dl.style.cursor = "pointer";
    dl.setAttribute("data-download-artifact", artifactId);
    root.append(dl);
  }

  return root;
}

/**
 * Built-in artifact reference card component.
 * Renders a compact clickable card in the chat thread that links to an artifact.
 * Uses `data-open-artifact` attribute for click delegation (handled in ui.ts).
 *
 * Supports a custom `renderCard` callback via `config.features.artifacts.renderCard`
 * that can override the default card rendering.
 */
export const PersonaArtifactCard: ComponentRenderer = (props, context) => {
  const customRenderer = context?.config?.features?.artifacts?.renderCard;
  if (customRenderer) {
    const title =
      typeof props.title === "string" && props.title
        ? props.title
        : "Untitled artifact";
    const artifactId =
      typeof props.artifactId === "string" ? props.artifactId : "";
    const status = props.status === "streaming" ? "streaming" : "complete";
    const artifactType =
      typeof props.artifactType === "string" ? props.artifactType : "markdown";

    const result = customRenderer({
      artifact: { artifactId, title, artifactType, status },
      config: context.config,
      defaultRenderer: () => renderDefaultArtifactCard(props, context),
    });
    if (result) return result;
  }

  return renderDefaultArtifactCard(props, context);
};
