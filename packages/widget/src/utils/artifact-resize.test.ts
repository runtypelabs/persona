import { describe, expect, it } from "vitest";
import {
  ARTIFACT_RESIZE_CHAT_MIN_PX,
  ARTIFACT_RESIZE_RAILED_TRANSCRIPT_MIN_PX,
  clampArtifactPaneWidth,
  maxArtifactWidthFromSplit,
  parseArtifactResizeMaxPxOptional,
  parseArtifactResizePx,
  resolveArtifactPaneWidthPx,
} from "./artifact-resize";

describe("parseArtifactResizePx", () => {
  it("parses px strings", () => {
    expect(parseArtifactResizePx("240px", 99)).toBe(240);
    expect(parseArtifactResizePx("  12.5px ", 99)).toBe(12.5);
  });
  it("falls back on invalid or empty", () => {
    expect(parseArtifactResizePx(undefined, 200)).toBe(200);
    expect(parseArtifactResizePx("2rem", 200)).toBe(200);
    expect(parseArtifactResizePx("50%", 200)).toBe(200);
  });
});

describe("parseArtifactResizeMaxPxOptional", () => {
  it("returns null when unset or invalid", () => {
    expect(parseArtifactResizeMaxPxOptional(undefined)).toBe(null);
    expect(parseArtifactResizeMaxPxOptional("40rem")).toBe(null);
  });
  it("parses px", () => {
    expect(parseArtifactResizeMaxPxOptional("400px")).toBe(400);
  });
});

describe("clampArtifactPaneWidth", () => {
  it("clamps to range", () => {
    expect(clampArtifactPaneWidth(100, 200, 400)).toBe(200);
    expect(clampArtifactPaneWidth(500, 200, 400)).toBe(400);
    expect(clampArtifactPaneWidth(300, 200, 400)).toBe(300);
  });
  it("returns min when max below min", () => {
    expect(clampArtifactPaneWidth(300, 200, 100)).toBe(200);
  });
});

describe("maxArtifactWidthFromSplit", () => {
  it("subtracts chat min, gaps, and handle", () => {
    const split = 800;
    const gap = 8;
    const handle = 6;
    const chatMin = ARTIFACT_RESIZE_CHAT_MIN_PX;
    expect(maxArtifactWidthFromSplit(split, gap, handle, chatMin)).toBe(800 - 200 - 16 - 6);
  });
});

describe("resolveArtifactPaneWidthPx", () => {
  it("applies config min and layout max", () => {
    const w = resolveArtifactPaneWidthPx(500, 800, 8, 6, "250px", undefined);
    expect(w).toBeGreaterThanOrEqual(250);
    expect(w).toBeLessThanOrEqual(800 - 200 - 16 - 6);
  });
  it("respects optional max cap", () => {
    const w = resolveArtifactPaneWidthPx(900, 1200, 8, 6, "200px", "320px");
    expect(w).toBeLessThanOrEqual(320);
  });

  it("defaults the chat minimum to the flat reserve", () => {
    const explicit = resolveArtifactPaneWidthPx(
      2000,
      1200,
      8,
      6,
      "200px",
      undefined,
      ARTIFACT_RESIZE_CHAT_MIN_PX
    );
    expect(resolveArtifactPaneWidthPx(2000, 1200, 8, 6, "200px")).toBe(explicit);
    expect(explicit).toBe(1200 - ARTIFACT_RESIZE_CHAT_MIN_PX - 16 - 6);
  });

  it("shrinks the max by a larger chat minimum (docked rail + transcript)", () => {
    const railed = 260 + ARTIFACT_RESIZE_RAILED_TRANSCRIPT_MIN_PX;
    const w = resolveArtifactPaneWidthPx(2000, 1200, 8, 6, "200px", undefined, railed);
    expect(w).toBe(1200 - railed - 16 - 6);
    expect(w).toBeLessThan(resolveArtifactPaneWidthPx(2000, 1200, 8, 6, "200px"));
  });

  it("keeps min over max when the chat minimum eats the row", () => {
    // 1200 - 1100 - gaps - handle < the 200px pane min: min still wins.
    const w = resolveArtifactPaneWidthPx(2000, 1200, 8, 6, "200px", undefined, 1100);
    expect(w).toBe(200);
  });
});
