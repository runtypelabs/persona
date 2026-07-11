import type { ComponentContext, ComponentRenderer } from "./registry";
import type { PersonaArtifactFileMeta } from "../types";
import { fileTypeLabel, basenameOf } from "../utils/artifact-file";
import { appendCharSpans } from "../utils/tool-loading-animation";
import { createLabelButton } from "../utils/buttons";

/**
 * Default artifact card renderer.
 * Builds the compact clickable card shown in the chat thread.
 */
function renderDefaultArtifactCard(
  props: Record<string, unknown>,
  context: ComponentContext
): HTMLElement {
  const file =
    props.file && typeof props.file === "object" && !Array.isArray(props.file)
      ? (props.file as PersonaArtifactFileMeta)
      : undefined;
  const rawTitle =
    typeof props.title === "string" && props.title
      ? props.title
      : "Untitled artifact";
  // File artifacts show the basename (title stays the full path on the wire).
  const title = file ? basenameOf(file.path) : rawTitle;
  const artifactId =
    typeof props.artifactId === "string" ? props.artifactId : "";
  const status = props.status === "streaming" ? "streaming" : "complete";
  const artifactType =
    typeof props.artifactType === "string" ? props.artifactType : "markdown";
  const subtitle = file
    ? fileTypeLabel(file)
    : artifactType === "component"
      ? "Component"
      : "Document";

  const root = document.createElement("div");
  root.className =
    "persona-artifact-card persona-flex persona-w-full persona-max-w-full persona-items-center persona-gap-3 persona-px-4 persona-py-3";
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
    const artifactsCfg = context?.config?.features?.artifacts;
    const loadingAnimation = artifactsCfg?.loadingAnimation ?? "shimmer";
    const duration = artifactsCfg?.loadingAnimationDuration ?? 2000;
    const text = `Generating ${subtitle.toLowerCase()}...`;

    const statusText = document.createElement("span");
    subtitleEl.appendChild(statusText);

    if (loadingAnimation === "none") {
      statusText.textContent = text;
    } else if (loadingAnimation === "pulse") {
      statusText.setAttribute("data-preserve-animation", "true");
      statusText.classList.add("persona-tool-loading-pulse");
      statusText.style.setProperty("--persona-tool-anim-duration", `${duration}ms`);
      statusText.textContent = text;
    } else {
      statusText.setAttribute("data-preserve-animation", "true");
      statusText.classList.add(`persona-tool-loading-${loadingAnimation}`);
      statusText.style.setProperty("--persona-tool-anim-duration", `${duration}ms`);
      if (loadingAnimation === "shimmer-color") {
        if (artifactsCfg?.loadingAnimationColor) {
          statusText.style.setProperty("--persona-tool-anim-color", artifactsCfg.loadingAnimationColor);
        }
        if (artifactsCfg?.loadingAnimationSecondaryColor) {
          statusText.style.setProperty("--persona-tool-anim-secondary-color", artifactsCfg.loadingAnimationSecondaryColor);
        }
      }
      appendCharSpans(statusText, text, 0);
    }
  } else {
    subtitleEl.textContent = subtitle;
  }

  meta.append(titleEl, subtitleEl);
  root.append(iconBox, meta);

  // Download button (visible when artifact is complete)
  if (status === "complete") {
    const dl = createLabelButton({
      label: "Download",
      className: "persona-flex-shrink-0",
    });
    dl.title = `Download ${title}`;
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
