/**
 * Helpers for previewable file artifacts.
 *
 * When a Claude Managed agent writes a file, the core backend encodes it as a
 * markdown artifact whose content is a fenced code block (extension → fence
 * language) plus a `file` metadata field on `artifact_start`. The content stays
 * fenced on the wire for backward compatibility; these helpers recover the raw
 * source and classify the file for preview / download.
 */
import type { PersonaArtifactFileMeta } from "../types";

const ZERO_WIDTH_SPACE = "​";

/** basename of a POSIX or Windows style path. */
export function basenameOf(path: string): string {
  const parts = String(path).split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

/** lowercase file extension (without the dot), or "" when there is none. */
function extensionOf(path: string): string {
  const base = basenameOf(path);
  const dot = base.lastIndexOf(".");
  // dot at index 0 (dotfile) or no dot means "no extension"
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Recover raw file source from core's fenced wire content.
 *
 * The producer builds content as `` ```${lang}\n${escaped}\n``` `` where every
 * literal triple-backtick in the source is replaced with backtick + U+200B
 * (zero-width space) + backtick backtick. So the content is exactly
 * `firstline + "\n" + escapedSource + "\n" + lastline`; dropping the first and
 * last lines yields the escaped source, then the ZWSP escape is reversed.
 *
 * Graceful: if `markdown` does not start with a fence line, it is returned
 * unchanged.
 */
export function extractFileSource(markdown: string): string {
  if (typeof markdown !== "string") return "";
  const firstNl = markdown.indexOf("\n");
  if (firstNl === -1) return markdown;
  const firstLine = markdown.slice(0, firstNl);
  if (!firstLine.startsWith("```")) return markdown;
  const rest = markdown.slice(firstNl + 1);
  const lastNl = rest.lastIndexOf("\n");
  const escaped = lastNl === -1 ? rest : rest.slice(0, lastNl);
  // Reverse core's fence-terminator escape (backtick + ZWSP + backtick backtick).
  return escaped.split("`" + ZERO_WIDTH_SPACE + "``").join("```");
}

/** Coarse file kind used to pick a preview strategy. */
export function fileKindOf(
  meta: PersonaArtifactFileMeta
): "html" | "svg" | "markdown" | "other" {
  const ext = extensionOf(meta.path);
  if (ext) {
    if (ext === "html" || ext === "htm") return "html";
    if (ext === "svg") return "svg";
    if (ext === "md" || ext === "mdx") return "markdown";
    return "other";
  }
  const mime = (meta.mimeType || "").toLowerCase();
  if (mime.includes("html")) return "html";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("markdown")) return "markdown";
  return "other";
}

/** Human-readable file type label for card subtitles / pane titles. */
export function fileTypeLabel(meta: PersonaArtifactFileMeta): string {
  switch (fileKindOf(meta)) {
    case "html":
      return "HTML";
    case "svg":
      return "SVG";
    case "markdown":
      return "Markdown";
    default: {
      const ext = extensionOf(meta.path);
      return ext ? ext.toUpperCase() : "File";
    }
  }
}

/** Minimal record shape needed to compute download info. */
export interface ArtifactDownloadSource {
  title?: string;
  markdown?: string;
  file?: PersonaArtifactFileMeta;
}

/**
 * Resolve the download filename, MIME type, and content for an artifact.
 *
 * File artifacts download the raw unfenced source under their basename with
 * their real MIME type. Non-file markdown artifacts preserve the legacy
 * behavior exactly: `<title>.md`, `text/markdown`, raw fenced/markdown content.
 */
export function downloadInfoFor(record: ArtifactDownloadSource): {
  filename: string;
  mime: string;
  content: string;
} {
  const raw = record.markdown ?? "";
  if (record.file) {
    return {
      filename: basenameOf(record.file.path) || "artifact",
      mime: record.file.mimeType || "application/octet-stream",
      content: extractFileSource(raw),
    };
  }
  const title = record.title || "artifact";
  return { filename: `${title}.md`, mime: "text/markdown", content: raw };
}
