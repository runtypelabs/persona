// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ALL_SUPPORTED_MIME_TYPES, isImageMimeType, validateFile } from "./content";

describe("file MIME validation", () => {
  it("rejects SVG consistently even when a caller includes it in acceptedTypes", () => {
    const svg = new File(["<svg/>"] , "image.svg", { type: "image/svg+xml" });
    expect(ALL_SUPPORTED_MIME_TYPES).not.toContain("image/svg+xml");
    expect(isImageMimeType("image/svg+xml")).toBe(false);
    expect(isImageMimeType("image/svg+xml; charset=utf-8")).toBe(false);
    expect(validateFile(svg, ["image/svg+xml"])).toEqual({
      valid: false,
      error: "SVG files are not supported because they can contain executable content.",
    });
  });
});
