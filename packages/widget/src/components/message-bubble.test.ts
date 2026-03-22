import { describe, it, expect } from "vitest";
import { isSafeImageSrc } from "./message-bubble";

describe("isSafeImageSrc", () => {
  it("allows https URLs", () => {
    expect(isSafeImageSrc("https://example.com/img.png")).toBe(true);
  });

  it("allows http URLs", () => {
    expect(isSafeImageSrc("http://example.com/img.png")).toBe(true);
  });

  it("allows blob URLs", () => {
    expect(isSafeImageSrc("blob:http://example.com/abc-123")).toBe(true);
  });

  it("allows data:image/png URIs", () => {
    expect(isSafeImageSrc("data:image/png;base64,abc123")).toBe(true);
  });

  it("allows data:image/jpeg URIs", () => {
    expect(isSafeImageSrc("data:image/jpeg;base64,abc123")).toBe(true);
  });

  it("allows data:image/gif URIs", () => {
    expect(isSafeImageSrc("data:image/gif;base64,abc123")).toBe(true);
  });

  it("allows data:image/webp URIs", () => {
    expect(isSafeImageSrc("data:image/webp;base64,abc123")).toBe(true);
  });

  it("blocks data:image/svg+xml URIs", () => {
    expect(isSafeImageSrc("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
  });

  it("blocks data:image/svg+xml with base64", () => {
    expect(isSafeImageSrc("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
  });

  it("blocks mixed-case SVG data URIs", () => {
    expect(isSafeImageSrc("data:image/Svg+xml,<svg onload=alert(1)>")).toBe(false);
    expect(isSafeImageSrc("data:image/SVG+XML,<svg>")).toBe(false);
    expect(isSafeImageSrc("data:Image/SVG+XML;base64,abc")).toBe(false);
  });

  it("blocks javascript: URIs", () => {
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
  });

  it("blocks data:text/html URIs", () => {
    expect(isSafeImageSrc("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("allows relative paths (no colon)", () => {
    expect(isSafeImageSrc("relative/path.png")).toBe(true);
  });

  it("allows dot-relative paths", () => {
    expect(isSafeImageSrc("./image.png")).toBe(true);
  });

  it("allows empty string", () => {
    expect(isSafeImageSrc("")).toBe(true);
  });
});
