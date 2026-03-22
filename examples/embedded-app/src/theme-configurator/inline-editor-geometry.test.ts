// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';

import {
  getPopoverPosition,
  getRectRelativeToParent,
} from './inline-editor-geometry';

describe('inline editor geometry', () => {
  test('positions overlay rects relative to the parent scroll box', () => {
    expect(
      getRectRelativeToParent(
        { left: 220, top: 340, width: 180, height: 36 },
        { left: 100, top: 200, width: 0, height: 0 },
        12,
        48
      )
    ).toEqual({
      left: 132,
      top: 188,
      width: 180,
      height: 36,
    });
  });

  test('centers the popover on the anchor and places it above when requested', () => {
    expect(
      getPopoverPosition(
        { x: 320, y: 420, width: 180, height: 36 },
        { width: 260, height: 180 },
        { width: 1024, height: 768 },
        true
      )
    ).toEqual({
      left: 280,
      top: 232,
    });
  });

  test('clamps the popover inside the viewport when the anchor is near an edge', () => {
    expect(
      getPopoverPosition(
        { x: 18, y: 40, width: 120, height: 36 },
        { width: 260, height: 180 },
        { width: 320, height: 240 },
        true
      )
    ).toEqual({
      left: 8,
      top: 8,
    });
  });
});
