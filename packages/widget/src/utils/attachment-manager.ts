/**
 * Attachment Manager
 *
 * Handles file selection, validation, preview generation, and content part creation
 * for the composer attachment feature. Supports both images and documents.
 */

import { createElement } from "./dom";
import { renderLucideIcon } from "./icons";
import type {
  AgentWidgetAttachmentsConfig,
  ContentPart,
  ImageContentPart,
  FileContentPart
} from "../types";
import {
  fileToContentPart,
  validateFile,
  isImageFile,
  getFileTypeName,
  ALL_SUPPORTED_MIME_TYPES
} from "./content";

/**
 * Pending attachment with preview
 */
export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string | null; // null for non-image files
  contentPart: ImageContentPart | FileContentPart;
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
}

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
 * Get the appropriate Lucide icon name for a file type
 */
function getFileIconName(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'file-text';
  if (mimeType.startsWith('text/')) return 'file-text';
  if (mimeType.includes('word')) return 'file-text';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'file-spreadsheet';
  if (mimeType === 'application/json') return 'file-json';
  return 'file';
}

/**
 * Creates and manages attachments for the composer
 */
export class AttachmentManager {
  private attachments: PendingAttachment[] = [];
  private config: Required<
    Pick<AttachmentManagerConfig, "allowedTypes" | "maxFileSize" | "maxFiles">
  > &
    Pick<AttachmentManagerConfig, "onFileRejected" | "onAttachmentsChange">;
  private previewsContainer: HTMLElement | null = null;

  constructor(config: AttachmentManagerConfig = {}) {
    this.config = {
      allowedTypes: config.allowedTypes ?? DEFAULTS.allowedTypes,
      maxFileSize: config.maxFileSize ?? DEFAULTS.maxFileSize,
      maxFiles: config.maxFiles ?? DEFAULTS.maxFiles,
      onFileRejected: config.onFileRejected,
      onAttachmentsChange: config.onAttachmentsChange
    };
  }

  /**
   * Set the previews container element
   */
  setPreviewsContainer(container: HTMLElement | null): void {
    this.previewsContainer = container;
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
  }

  /**
   * Get current attachments
   */
  getAttachments(): PendingAttachment[] {
    return [...this.attachments];
  }

  /**
   * Get content parts for all attachments
   */
  getContentParts(): ContentPart[] {
    return this.attachments.map((a) => a.contentPart);
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

    const filesToProcess = Array.from(files);

    for (const file of filesToProcess) {
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

      try {
        // Convert to content part (handles both images and files)
        const contentPart = await fileToContentPart(file);

        // Create preview URL only for images
        const previewUrl = isImageFile(file) ? URL.createObjectURL(file) : null;

        const attachment: PendingAttachment = {
          id: generateAttachmentId(),
          file,
          previewUrl,
          contentPart
        };

        this.attachments.push(attachment);
        this.renderPreview(attachment);
      } catch (error) {
        console.error("[AttachmentManager] Failed to process file:", error);
      }
    }

    this.updatePreviewsVisibility();
    this.config.onAttachmentsChange?.(this.getAttachments());
  }

  /**
   * Remove an attachment by ID
   */
  removeAttachment(id: string): void {
    const index = this.attachments.findIndex((a) => a.id === id);
    if (index === -1) return;

    const attachment = this.attachments[index];

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

    this.updatePreviewsVisibility();
    this.config.onAttachmentsChange?.(this.getAttachments());
  }

  /**
   * Clear all attachments
   */
  clearAttachments(): void {
    // Revoke all object URLs
    for (const attachment of this.attachments) {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    }

    this.attachments = [];

    // Clear the previews container
    if (this.previewsContainer) {
      this.previewsContainer.innerHTML = "";
    }

    this.updatePreviewsVisibility();
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
      "tvw-attachment-preview tvw-relative tvw-inline-block"
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
        "tvw-w-full tvw-h-full tvw-object-cover tvw-rounded-lg tvw-border tvw-border-gray-200";
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
      filePreview.style.backgroundColor = "var(--cw-container, #f3f4f6)";
      filePreview.style.border = "1px solid var(--cw-border, #e5e7eb)";
      filePreview.style.display = "flex";
      filePreview.style.flexDirection = "column";
      filePreview.style.alignItems = "center";
      filePreview.style.justifyContent = "center";
      filePreview.style.gap = "2px";
      filePreview.style.overflow = "hidden";

      // File icon
      const iconName = getFileIconName(attachment.file.type);
      const fileIcon = renderLucideIcon(iconName, 20, "var(--cw-muted, #6b7280)", 1.5);
      if (fileIcon) {
        filePreview.appendChild(fileIcon);
      }

      // File type label
      const typeLabel = createElement("span");
      typeLabel.textContent = getFileTypeName(attachment.file.type, attachment.file.name);
      typeLabel.style.fontSize = "8px";
      typeLabel.style.fontWeight = "600";
      typeLabel.style.color = "var(--cw-muted, #6b7280)";
      typeLabel.style.textTransform = "uppercase";
      typeLabel.style.lineHeight = "1";
      filePreview.appendChild(typeLabel);

      previewWrapper.appendChild(filePreview);
    }

    // Create remove button
    const removeBtn = createElement(
      "button",
      "tvw-attachment-remove tvw-absolute tvw-flex tvw-items-center tvw-justify-center"
    ) as HTMLButtonElement;
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", "Remove attachment");
    removeBtn.style.position = "absolute";
    removeBtn.style.top = "-4px";
    removeBtn.style.right = "-4px";
    removeBtn.style.width = "18px";
    removeBtn.style.height = "18px";
    removeBtn.style.borderRadius = "50%";
    removeBtn.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
    removeBtn.style.border = "none";
    removeBtn.style.cursor = "pointer";
    removeBtn.style.display = "flex";
    removeBtn.style.alignItems = "center";
    removeBtn.style.justifyContent = "center";
    removeBtn.style.padding = "0";

    // Add X icon
    const xIcon = renderLucideIcon("x", 10, "#ffffff", 2);
    if (xIcon) {
      removeBtn.appendChild(xIcon);
    } else {
      removeBtn.textContent = "×";
      removeBtn.style.color = "#ffffff";
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
    return new AttachmentManager({
      allowedTypes: config?.allowedTypes,
      maxFileSize: config?.maxFileSize,
      maxFiles: config?.maxFiles,
      onFileRejected: config?.onFileRejected,
      onAttachmentsChange
    });
  }
}
