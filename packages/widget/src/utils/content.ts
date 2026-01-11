/**
 * Content Utilities
 *
 * Helper functions for working with multi-modal message content.
 */

import type { MessageContent, ContentPart, TextContentPart, ImageContentPart, FileContentPart } from '../types';

/**
 * Normalize content to ContentPart[] format.
 * Converts string content to a single text content part.
 */
export function normalizeContent(content: MessageContent): ContentPart[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return content;
}

/**
 * Extract display text from content parts.
 * Concatenates all text parts into a single string.
 */
export function getDisplayText(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter((part): part is TextContentPart => part.type === 'text')
    .map(part => part.text)
    .join('');
}

/**
 * Check if content contains any images.
 */
export function hasImages(content: MessageContent): boolean {
  if (typeof content === 'string') {
    return false;
  }
  return content.some(part => part.type === 'image');
}

/**
 * Get all image parts from content.
 */
export function getImageParts(content: MessageContent): ImageContentPart[] {
  if (typeof content === 'string') {
    return [];
  }
  return content.filter((part): part is ImageContentPart => part.type === 'image');
}

/**
 * Create a text-only content part.
 */
export function createTextPart(text: string): TextContentPart {
  return { type: 'text', text };
}

/**
 * Create an image content part from a base64 data URI or URL.
 *
 * @param image - Base64 data URI (data:image/...) or URL
 * @param options - Optional mimeType and alt text
 */
export function createImagePart(
  image: string,
  options?: { mimeType?: string; alt?: string }
): ImageContentPart {
  return {
    type: 'image',
    image,
    ...(options?.mimeType && { mimeType: options.mimeType }),
    ...(options?.alt && { alt: options.alt }),
  };
}

/**
 * Convert a File object to an image content part.
 * Reads the file and converts it to a base64 data URI.
 */
export async function fileToImagePart(file: File): Promise<ImageContentPart> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      resolve({
        type: 'image',
        image: dataUri,
        mimeType: file.type,
        alt: file.name,
      });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Validate that a file is an acceptable image type.
 *
 * @param file - The file to validate
 * @param acceptedTypes - Array of accepted MIME types (default: common image types)
 * @param maxSizeBytes - Maximum file size in bytes (default: 10MB)
 */
export function validateImageFile(
  file: File,
  acceptedTypes: string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  maxSizeBytes: number = 10 * 1024 * 1024
): { valid: boolean; error?: string } {
  if (!acceptedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Accepted types: ${acceptedTypes.join(', ')}`,
    };
  }

  if (file.size > maxSizeBytes) {
    const maxSizeMB = Math.round(maxSizeBytes / (1024 * 1024));
    return {
      valid: false,
      error: `File too large. Maximum size: ${maxSizeMB}MB`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Generic File Utilities (for PDF, TXT, DOCX, etc.)
// ============================================================================

/**
 * Common image MIME types
 */
export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
];

/**
 * Common document MIME types
 */
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/json',
];

/**
 * All supported file types (images + documents)
 */
export const ALL_SUPPORTED_MIME_TYPES = [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES];

/**
 * Check if a MIME type is an image
 */
export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.includes(mimeType) || mimeType.startsWith('image/');
}

/**
 * Check if a file is an image
 */
export function isImageFile(file: File): boolean {
  return isImageMimeType(file.type);
}

/**
 * Create a file content part from a base64 data URI.
 */
export function createFilePart(
  data: string,
  mimeType: string,
  filename: string
): FileContentPart {
  return {
    type: 'file',
    data,
    mimeType,
    filename,
  };
}

/**
 * Convert a File object to a content part.
 * Returns ImageContentPart for images, FileContentPart for other files.
 */
export async function fileToContentPart(file: File): Promise<ImageContentPart | FileContentPart> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;

      if (isImageFile(file)) {
        // Return image content part for images
        resolve({
          type: 'image',
          image: dataUri,
          mimeType: file.type,
          alt: file.name,
        });
      } else {
        // Return file content part for documents
        resolve({
          type: 'file',
          data: dataUri,
          mimeType: file.type,
          filename: file.name,
        });
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Validate that a file is an acceptable type.
 *
 * @param file - The file to validate
 * @param acceptedTypes - Array of accepted MIME types
 * @param maxSizeBytes - Maximum file size in bytes (default: 10MB)
 */
export function validateFile(
  file: File,
  acceptedTypes: string[] = ALL_SUPPORTED_MIME_TYPES,
  maxSizeBytes: number = 10 * 1024 * 1024
): { valid: boolean; error?: string } {
  if (!acceptedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type "${file.type}". Accepted types: ${acceptedTypes.join(', ')}`,
    };
  }

  if (file.size > maxSizeBytes) {
    const maxSizeMB = Math.round(maxSizeBytes / (1024 * 1024));
    return {
      valid: false,
      error: `File too large. Maximum size: ${maxSizeMB}MB`,
    };
  }

  return { valid: true };
}

/**
 * Get file parts from content.
 */
export function getFileParts(content: MessageContent): FileContentPart[] {
  if (typeof content === 'string') {
    return [];
  }
  return content.filter((part): part is FileContentPart => part.type === 'file');
}

/**
 * Check if content contains any files.
 */
export function hasFiles(content: MessageContent): boolean {
  if (typeof content === 'string') {
    return false;
  }
  return content.some(part => part.type === 'file');
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * Get a display-friendly file type name
 */
export function getFileTypeName(mimeType: string, filename: string): string {
  const ext = getFileExtension(filename).toUpperCase();

  const typeMap: Record<string, string> = {
    'application/pdf': 'PDF',
    'text/plain': 'TXT',
    'text/markdown': 'MD',
    'text/csv': 'CSV',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.ms-excel': 'XLS',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/json': 'JSON',
  };

  return typeMap[mimeType] || ext || 'FILE';
}
