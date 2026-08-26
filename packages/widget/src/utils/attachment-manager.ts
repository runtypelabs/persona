/**
 * Attachment Manager
 *
 * Handles file selection, validation, preview generation, and content part creation
 * for the composer attachment feature. Supports both images and documents.
 */

import { createElement, createNode } from "./dom";
import { File as FileIcon, FileCode, FileSpreadsheet, FileText, X, type IconNode } from "lucide";
import { renderIconNode } from "./icon-node";
import { renderLucideIcon } from "./icons";
import type {
  AgentWidgetAttachmentAdapter,
  AgentWidgetAttachmentsConfig,
  ContentPart
} from "../types";
import {
  fileToContentPart,
  validateFile,
  isImageFile,
  getFileTypeName,
  ALL_SUPPORTED_MIME_TYPES
} from "./content";

/** Lifecycle state of one pending attachment (roadmap section 8). */
export type PendingAttachmentStatus =
  | "processing"
  | "uploading"
  | "ready"
  | "error";

/**
 * Pending attachment with preview.
 *
 * `contentPart` is null until the adapter resolves: the tile appears
 * immediately in `processing`/`uploading` and only a `ready` attachment
 * contributes to the outgoing message.
 */
export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string | null; // null for non-image files
  contentPart: ContentPart | null;
  status: PendingAttachmentStatus;
  /** 0 to 1, only while `uploading` and only when the adapter reports it. */
  progress?: number;
  error?: string;
}

/**
 * Attachment manager configuration
 */
export interface AttachmentManagerConfig {
  allowedTypes?: string[];
  maxFileSize?: number;
  maxFiles?: number;
  onFileRejected?: (file: File, reason: "type" | "size" | "count") => void;
  onAttachmentsChange?: (attachments: PendingAttachment[]) => void;
  /** Host upload adapter; without one, files convert to base64 in the browser. */
  adapter?: AgentWidgetAttachmentAdapter;
}

/**
 * Default adapter: the historical in-browser base64 conversion, wrapped in the
 * public interface. Reports no progress, so its tiles show `processing`.
 */
const BASE64_ADAPTER: AgentWidgetAttachmentAdapter = {
  add: (file) => fileToContentPart(file) as Promise<ContentPart>
};

const clampProgress = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

/**
 * Default configuration values
 */
const DEFAULTS = {
  allowedTypes: ALL_SUPPORTED_MIME_TYPES,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 4
};

/**
 * Generate a unique ID for attachments
 */
function generateAttachmentId(): string {
  return `attach_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get the appropriate Lucide icon data for a file type. Closed internal set:
 * direct icon-data imports keep this module off the string registry.
 */
function getFileIconData(mimeType: string): IconNode {
  if (mimeType === 'application/pdf') return FileText;
  if (mimeType.startsWith('text/')) return FileText;
  if (mimeType.includes('word')) return FileText;
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return FileSpreadsheet;
  if (mimeType === 'application/json') return FileCode;
  return FileIcon;
}

/**
 * Creates and manages attachments for the composer
 */
export class AttachmentManager {
  private attachments: PendingAttachment[] = [];
  private config: Required<
    Pick<AttachmentManagerConfig, "allowedTypes" | "maxFileSize" | "maxFiles">
  > &
    Pick<
      AttachmentManagerConfig,
      "onFileRejected" | "onAttachmentsChange" | "adapter"
    >;
  private previewsContainer: HTMLElement | null = null;
  /** In-flight `adapter.add` per attachment id; aborted on remove/clear/destroy. */
  private pendingAdds = new Map<string, AbortController>();
  private destroyed = false;

  constructor(config: AttachmentManagerConfig = {}) {
    this.config = {
      allowedTypes: config.allowedTypes ?? DEFAULTS.allowedTypes,
      maxFileSize: config.maxFileSize ?? DEFAULTS.maxFileSize,
      maxFiles: config.maxFiles ?? DEFAULTS.maxFiles,
      onFileRejected: config.onFileRejected,
      onAttachmentsChange: config.onAttachmentsChange,
      adapter: config.adapter
    };
  }

  /** True when the host supplied an adapter (tiles then show upload state). */
  private hasCustomAdapter(): boolean {
    return typeof this.config.adapter?.add === "function";
  }

  private adapter(): AgentWidgetAttachmentAdapter {
    return this.hasCustomAdapter()
      ? (this.config.adapter as AgentWidgetAttachmentAdapter)
      : BASE64_ADAPTER;
  }

  /**
   * Set the previews container element
   */
  setPreviewsContainer(container: HTMLElement | null): void {
    this.previewsContainer = container;
  }

  /**
   * Re-point previews at a new container and repaint from state. A composer
   * rebuild swaps the footer, so pending attachments must follow it.
   */
  remountPreviews(container: HTMLElement | null): void {
    this.previewsContainer = container;
    if (container) {
      container.innerHTML = "";
      for (const attachment of this.attachments) {
        this.renderPreview(attachment);
      }
    }
    this.updatePreviewsVisibility();
  }

  /**
   * Update the configuration (e.g., when allowed types change)
   */
  updateConfig(config: Partial<AttachmentManagerConfig>): void {
    if (config.allowedTypes !== undefined) {
      this.config.allowedTypes = config.allowedTypes.length > 0 ? config.allowedTypes : DEFAULTS.allowedTypes;
    }
    if (config.maxFileSize !== undefined) {
      this.config.maxFileSize = config.maxFileSize;
    }
    if (config.maxFiles !== undefined) {
      this.config.maxFiles = config.maxFiles;
    }
    if (config.onFileRejected !== undefined) {
      this.config.onFileRejected = config.onFileRejected;
    }
    if (config.onAttachmentsChange !== undefined) {
      this.config.onAttachmentsChange = config.onAttachmentsChange;
    }
    if (config.adapter !== undefined) {
      this.config.adapter = config.adapter;
    }
  }

  /** Every attachment holds a content part; the send gate reads this. */
  isReady(): boolean {
    return this.attachments.every((a) => a.status === "ready");
  }

  /**
   * Get current attachments
   */
  getAttachments(): PendingAttachment[] {
    return [...this.attachments];
  }

  /**
   * Get content parts for all attachments. Attachments that are still
   * uploading or errored contribute nothing; the send gate blocks that case
   * before it can be reached.
   */
  getContentParts(): ContentPart[] {
    return this.attachments
      .map((a) => a.contentPart)
      .filter((part): part is ContentPart => part !== null);
  }

  /**
   * Check if there are any attachments
   */
  hasAttachments(): boolean {
    return this.attachments.length > 0;
  }

  /**
   * Get the number of attachments
   */
  count(): number {
    return this.attachments.length;
  }

  /**
   * Handle file input change event
   */
  async handleFileSelect(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    await this.handleFiles(Array.from(files));
  }

  /**
   * Handle an array of files (e.g., clipboard image paste)
   */
  async handleFiles(files: readonly File[]): Promise<void> {
    if (!files.length || this.destroyed) return;

    const accepted: PendingAttachment[] = [];
    for (const file of files) {
      // Check if we've hit the max files limit
      if (this.attachments.length >= this.config.maxFiles) {
        this.config.onFileRejected?.(file, "count");
        continue;
      }

      // Validate the file
      const validation = validateFile(
        file,
        this.config.allowedTypes,
        this.config.maxFileSize
      );

      if (!validation.valid) {
        const reason = validation.error?.includes("type") ? "type" : "size";
        this.config.onFileRejected?.(file, reason);
        continue;
      }

      // The tile appears immediately, before the adapter has produced anything.
      const attachment: PendingAttachment = {
        id: generateAttachmentId(),
        file,
        previewUrl: isImageFile(file) ? URL.createObjectURL(file) : null,
        contentPart: null,
        status: this.hasCustomAdapter() ? "uploading" : "processing",
        progress: this.hasCustomAdapter() ? 0 : undefined
      };
      this.attachments.push(attachment);
      this.renderPreview(attachment);
      accepted.push(attachment);
    }

    this.updatePreviewsVisibility();
    this.notify();

    await Promise.all(accepted.map((attachment) => this.runAdd(attachment)));
  }

  /**
   * Run `adapter.add` for one attachment and reconcile the result. Late
   * completions from an aborted or removed attachment write no state and log
   * nothing: the user already moved on.
   */
  private async runAdd(attachment: PendingAttachment): Promise<void> {
    const controller = new AbortController();
    this.pendingAdds.set(attachment.id, controller);

    const stale = (): boolean =>
      this.destroyed ||
      controller.signal.aborted ||
      this.pendingAdds.get(attachment.id) !== controller ||
      !this.attachments.includes(attachment);

    try {
      const part = await this.adapter().add(attachment.file, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (stale() || attachment.status !== "uploading") return;
          attachment.progress = clampProgress(progress);
          this.updatePreview(attachment);
          this.notify();
        }
      });
      if (stale()) return;
      attachment.contentPart = part;
      attachment.status = "ready";
      attachment.progress = undefined;
      attachment.error = undefined;
    } catch (error) {
      if (stale()) return;
      attachment.status = "error";
      attachment.progress = undefined;
      attachment.error =
        error instanceof Error ? error.message : String(error ?? "Upload failed");
    } finally {
      if (this.pendingAdds.get(attachment.id) === controller) {
        this.pendingAdds.delete(attachment.id);
      }
    }
    this.updatePreview(attachment);
    this.notify();
  }

  /** Retry a failed attachment from its error tile. */
  retryAttachment(id: string): void {
    const attachment = this.attachments.find((a) => a.id === id);
    if (!attachment || attachment.status !== "error" || this.destroyed) return;
    attachment.status = this.hasCustomAdapter() ? "uploading" : "processing";
    attachment.progress = this.hasCustomAdapter() ? 0 : undefined;
    attachment.error = undefined;
    this.updatePreview(attachment);
    this.notify();
    void this.runAdd(attachment);
  }

  /** Abort an in-flight add without touching the attachment's own state. */
  private abortAdd(id: string): void {
    const controller = this.pendingAdds.get(id);
    if (!controller) return;
    this.pendingAdds.delete(id);
    controller.abort();
  }

  /**
   * Remove an attachment by ID. Aborts an in-flight upload, and hands a
   * completed one back to the adapter so remote storage can be released.
   */
  removeAttachment(id: string): void {
    const index = this.attachments.findIndex((a) => a.id === id);
    if (index === -1) return;

    const attachment = this.attachments[index];
    this.abortAdd(id);

    // Revoke the object URL to free memory (only for images)
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }

    // Remove from array
    this.attachments.splice(index, 1);

    // Remove from DOM
    const previewEl = this.previewsContainer?.querySelector(
      `[data-attachment-id="${id}"]`
    );
    if (previewEl) {
      previewEl.remove();
    }

    if (attachment.status === "ready" && attachment.contentPart) {
      this.releasePart(attachment.contentPart);
    }

    this.updatePreviewsVisibility();
    this.notify();
  }

  private releasePart(part: ContentPart): void {
    const remove = this.config.adapter?.remove;
    if (!remove) return;
    try {
      const result = remove(part, { signal: new AbortController().signal });
      if (result && typeof (result as Promise<void>).catch === "function") {
        void (result as Promise<void>).catch((error: unknown) => {
          console.error("[AttachmentManager] adapter.remove failed:", error);
        });
      }
    } catch (error) {
      console.error("[AttachmentManager] adapter.remove failed:", error);
    }
  }

  /**
   * Clear all attachments and abort anything in flight. This is also the
   * post-send path, so it never calls `adapter.remove`: the parts it drops
   * have just been handed to the model.
   */
  clearAttachments(): void {
    for (const attachment of this.attachments) {
      this.abortAdd(attachment.id);
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    }

    this.attachments = [];
    this.pendingAdds.clear();

    // Clear the previews container
    if (this.previewsContainer) {
      this.previewsContainer.innerHTML = "";
    }

    this.updatePreviewsVisibility();
    this.notify();
  }

  /** Abort every in-flight upload and stop accepting new work. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const controller of this.pendingAdds.values()) controller.abort();
    this.pendingAdds.clear();
    for (const attachment of this.attachments) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    }
    this.attachments = [];
    this.previewsContainer = null;
  }

  private notify(): void {
    if (this.destroyed) return;
    this.config.onAttachmentsChange?.(this.getAttachments());
  }

  /**
   * Render a preview for an attachment (image thumbnail or file icon)
   */
  private renderPreview(attachment: PendingAttachment): void {
    if (!this.previewsContainer) return;

    const isImage = isImageFile(attachment.file);

    const previewWrapper = createElement(
      "div",
      "persona-attachment-preview persona-relative persona-inline-block"
    );
    previewWrapper.setAttribute("data-attachment-id", attachment.id);
    previewWrapper.style.width = "48px";
    previewWrapper.style.height = "48px";

    if (isImage && attachment.previewUrl) {
      // Render image thumbnail
      const img = createElement("img") as HTMLImageElement;
      img.src = attachment.previewUrl;
      img.alt = attachment.file.name;
      img.className =
        "persona-w-full persona-h-full persona-object-cover persona-rounded-lg persona-border persona-border-gray-200";
      img.style.width = "48px";
      img.style.height = "48px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "8px";
      previewWrapper.appendChild(img);
    } else {
      // Render file icon with type label
      const filePreview = createElement("div");
      filePreview.style.width = "48px";
      filePreview.style.height = "48px";
      filePreview.style.borderRadius = "8px";
      filePreview.style.backgroundColor = "var(--persona-container, #f3f4f6)";
      filePreview.style.border = "1px solid var(--persona-border, #e5e7eb)";
      filePreview.style.display = "flex";
      filePreview.style.flexDirection = "column";
      filePreview.style.alignItems = "center";
      filePreview.style.justifyContent = "center";
      filePreview.style.gap = "2px";
      filePreview.style.overflow = "hidden";

      // File icon
      const iconData = getFileIconData(attachment.file.type);
      const fileIcon = renderIconNode(iconData, 20, "var(--persona-muted, #6b7280)", 1.5);
      if (fileIcon) {
        filePreview.appendChild(fileIcon);
      }

      // File type label
      const typeLabel = createElement("span");
      typeLabel.textContent = getFileTypeName(attachment.file.type, attachment.file.name);
      typeLabel.style.fontSize = "8px";
      typeLabel.style.fontWeight = "600";
      typeLabel.style.color = "var(--persona-muted, #6b7280)";
      typeLabel.style.textTransform = "uppercase";
      typeLabel.style.lineHeight = "1";
      filePreview.appendChild(typeLabel);

      previewWrapper.appendChild(filePreview);
    }

    // Status layer: progress bar while uploading, error affordance on failure.
    // Always present so `updatePreview` can mutate it in place.
    const status = createNode("div", {
      className: "persona-attachment-status",
      attrs: { "data-persona-attachment-status": "" },
    });
    const progressTrack = createElement("div", "persona-attachment-progress");
    progressTrack.appendChild(
      createElement("div", "persona-attachment-progress__bar")
    );
    const retryBtn = createNode("button", {
      className: "persona-attachment-retry",
      attrs: { type: "button", "aria-label": "Retry upload" },
    }) as HTMLButtonElement;
    const retryIcon = renderLucideIcon(
      "rotate-cw",
      12,
      "var(--persona-text-inverse, #ffffff)",
      2
    );
    if (retryIcon) retryBtn.appendChild(retryIcon);
    else retryBtn.textContent = "↻";
    retryBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.retryAttachment(attachment.id);
    });
    status.append(progressTrack, retryBtn);
    previewWrapper.appendChild(status);

    // Create remove button. Removal is available in every state, including
    // while the upload is still in flight.
    const removeBtn = createElement(
      "button",
      "persona-attachment-remove persona-absolute persona-flex persona-items-center persona-justify-center"
    ) as HTMLButtonElement;
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", "Remove attachment");
    removeBtn.style.position = "absolute";
    removeBtn.style.top = "-4px";
    // Logical inset so the control stays on the trailing edge under dir=rtl.
    removeBtn.style.insetInlineEnd = "-4px";
    removeBtn.style.width = "18px";
    removeBtn.style.height = "18px";
    removeBtn.style.borderRadius = "50%";
    removeBtn.style.backgroundColor = "var(--persona-palette-colors-black-alpha-60, rgba(0, 0, 0, 0.6))";
    removeBtn.style.border = "none";
    removeBtn.style.cursor = "pointer";
    removeBtn.style.display = "flex";
    removeBtn.style.alignItems = "center";
    removeBtn.style.justifyContent = "center";
    removeBtn.style.padding = "0";

    // Add X icon
    const xIcon = renderIconNode(X, 10, "var(--persona-text-inverse, #ffffff)", 2);
    if (xIcon) {
      removeBtn.appendChild(xIcon);
    } else {
      removeBtn.textContent = "×";
      removeBtn.style.color = "var(--persona-text-inverse, #ffffff)";
      removeBtn.style.fontSize = "14px";
      removeBtn.style.lineHeight = "1";
    }

    // Remove on click
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.removeAttachment(attachment.id);
    });

    previewWrapper.appendChild(removeBtn);
    this.previewsContainer.appendChild(previewWrapper);
    this.applyPreviewState(previewWrapper, attachment);
  }

  /** Repaint only the status layer of a live tile; the thumbnail is untouched. */
  private updatePreview(attachment: PendingAttachment): void {
    const tile = this.previewsContainer?.querySelector<HTMLElement>(
      `[data-attachment-id="${attachment.id}"]`
    );
    if (!tile) return;
    this.applyPreviewState(tile, attachment);
  }

  private applyPreviewState(
    tile: HTMLElement,
    attachment: PendingAttachment
  ): void {
    tile.dataset.status = attachment.status;
    const busy = attachment.status !== "ready" && attachment.status !== "error";
    tile.setAttribute("aria-busy", busy ? "true" : "false");
    tile.title =
      attachment.status === "error"
        ? `${attachment.file.name}: ${attachment.error ?? "Upload failed"}`
        : attachment.file.name;
    const bar = tile.querySelector<HTMLElement>(
      ".persona-attachment-progress__bar"
    );
    if (bar) {
      // An adapter that reports no progress shows an indeterminate track
      // (CSS-driven); a reported value drives the width.
      const value = attachment.progress;
      bar.style.width =
        typeof value === "number" ? `${Math.round(value * 100)}%` : "";
    }
  }

  /**
   * Update the visibility of the previews container
   */
  private updatePreviewsVisibility(): void {
    if (!this.previewsContainer) return;
    this.previewsContainer.style.display =
      this.attachments.length > 0 ? "flex" : "none";
  }

  /**
   * Create an AttachmentManager from widget config
   */
  static fromConfig(
    config?: AgentWidgetAttachmentsConfig,
    onAttachmentsChange?: (attachments: PendingAttachment[]) => void
  ): AttachmentManager {
    // The public `attachments.onChange` is fed from the composer store, not
    // from here: this internal callback carries `File` handles and content
    // parts that never reach host code.
    return new AttachmentManager({
      allowedTypes: config?.allowedTypes,
      maxFileSize: config?.maxFileSize,
      maxFiles: config?.maxFiles,
      onFileRejected: config?.onFileRejected,
      onAttachmentsChange,
      adapter: config?.adapter
    });
  }
}
