import { File as FileIcon, FileCode, FileSpreadsheet, FileText, X } from "lucide";
import type { AttachmentPreviewRenderContext, AttachmentPreviewRenderHandle } from "../types";
import { createElement, createNode } from "./dom";
import { getFileTypeName } from "./content";
import { renderIconNode } from "./icon-node";
import { renderLucideIcon } from "./icons";

export function createAttachmentPreview(initial: AttachmentPreviewRenderContext): AttachmentPreviewRenderHandle {
  const tile = createElement("div", "persona-attachment-preview persona-relative persona-inline-block");
  let context = initial;
  let signature = "";
  const paint = (): void => {
    const { state } = context;
    const preview = context.config.attachments?.preview;
    const image = state.kind === "image";
    const options = image ? preview?.image : preview?.file;
    const layout = image ? preview?.image?.layout ?? "thumbnail" : preview?.file?.layout ?? "tile";
    tile.dataset.kind = state.kind;
    tile.dataset.layout = layout;
    tile.dataset.fileIcon = String(preview?.file?.icon !== false);
    tile.dataset.iconPlacement = preview?.file?.iconPlacement ?? "start";
    tile.dataset.removeVisibility = options?.remove?.visibility ?? "always";
    tile.dataset.removePlacement = options?.remove?.placement ?? "overlap";
    tile.replaceChildren();
    if (image && state.previewUrl) {
      const img = createNode("img", { className: "persona-attachment-image", attrs: { src: state.previewUrl, alt: state.name }, style: { objectFit: preview?.image?.fit ?? "cover" } });
      const name = preview?.image?.name ?? "hidden";
      if (layout === "chip" || name !== "hidden") {
        const card = createElement("div", "persona-attachment-image-card");
        card.append(img);
        if (name !== "hidden") card.append(createNode("span", { className: "persona-attachment-file-name", text: name === "basename" ? state.name.replace(/\.[^.]+$/, "") : state.name }));
        tile.append(card);
      } else tile.append(img);
    } else {
      const card = createElement("div", "persona-attachment-file");
      const mime = state.mimeType;
      const icon = mime.includes("spreadsheet") || mime.includes("excel") ? FileSpreadsheet : mime === "application/json" ? FileCode : mime === "application/pdf" || mime.startsWith("text/") || mime.includes("word") ? FileText : FileIcon;
      const iconElement = (preview?.file?.iconName ? renderLucideIcon(preview.file.iconName, 20, "currentColor", 1.5) : null) ?? renderIconNode(icon, 20, "currentColor", 1.5);
      if (iconElement && preview?.file?.icon !== false) { iconElement.classList.add("persona-attachment-file-icon"); card.append(iconElement); }
      const copy = createElement("div", "persona-attachment-file-copy");
      const name = preview?.file?.name ?? "hidden";
      if (name !== "hidden") copy.append(createNode("span", { className: "persona-attachment-file-name", text: name === "basename" ? state.name.replace(/\.[^.]+$/, "") : state.name }));
      const metadata = preview?.file?.metadata;
      const details = metadata === "size" ? (state.size < 1024 ? `${state.size} B` : state.size < 1024 * 1024 ? `${Math.round(state.size / 1024)} KB` : `${(state.size / (1024 * 1024)).toFixed(1)} MB`) : metadata === "line-count" && state.lineCount !== undefined ? `${state.lineCount} ${state.lineCount === 1 ? "line" : "lines"}` : "";
      if (details) copy.append(createNode("span", { className: "persona-attachment-file-metadata", text: details }));
      if (copy.childNodes.length) card.append(copy);
      const badge = preview?.file?.badge ?? "type";
      if (badge !== "none") card.append(createNode("span", { className: "persona-attachment-file-badge", text: badge === "extension" ? state.name.match(/\.([^.]+)$/)?.[1].toUpperCase() ?? getFileTypeName(mime, state.name) : getFileTypeName(mime, state.name) }));
      tile.append(card);
    }
    const status = createNode("div", { className: "persona-attachment-status", attrs: { "data-persona-attachment-status": "" } });
    const track = createElement("div", "persona-attachment-progress");
    track.append(createElement("div", "persona-attachment-progress__bar"));
    const retry = createNode("button", { className: "persona-attachment-retry", attrs: { type: "button", "aria-label": "Retry upload" } });
    const retryIcon = renderLucideIcon("rotate-cw", 12, "#ffffff", 2);
    if (retryIcon) retry.append(retryIcon); else retry.textContent = "↻";
    retry.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); context.actions.retry(); });
    status.append(track, retry);
    const remove = createNode("button", { className: "persona-attachment-remove", attrs: { type: "button", "aria-label": "Remove attachment" } });
    const x = renderIconNode(X, 10, "currentColor", 2);
    if (x) remove.append(x); else remove.textContent = "×";
    remove.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); context.actions.remove(); });
    tile.append(status);
    const inlineCard = options?.remove?.placement === "inline" ? tile.querySelector(".persona-attachment-file, .persona-attachment-image-card") : null;
    (inlineCard ?? tile).append(remove);
  };
  const update = (next: AttachmentPreviewRenderContext): void => {
    context = next;
    const { state } = context;
    const nextSignature = JSON.stringify([context.config.attachments?.preview, state.lineCount, state.previewUrl]);
    if (signature !== nextSignature) { signature = nextSignature; paint(); }
    tile.dataset.status = state.status;
    tile.setAttribute("aria-busy", String(state.status === "uploading" || state.status === "processing"));
    tile.title = state.status === "error" ? `${state.name}: ${state.error ?? "Upload failed"}` : state.name;
    const bar = tile.querySelector<HTMLElement>(".persona-attachment-progress__bar");
    if (bar) bar.style.width = typeof state.progress === "number" ? `${Math.round(state.progress * 100)}%` : "";
  };
  update(initial);
  return { element: tile, update };
}
