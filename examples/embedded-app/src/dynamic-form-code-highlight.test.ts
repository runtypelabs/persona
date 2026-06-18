import { describe, expect, test } from "vitest";

import { highlightVariantConfig } from "./dynamic-form-code-highlight";

describe("highlightVariantConfig", () => {
  test("escapes variant config and wraps keys and string values in code token spans", () => {
    const html = highlightVariantConfig(`theme: {
  "primary": "#7c2d12",
  "label": "<Custom>"
}`);

    expect(html).toContain('<span class="prop">theme</span>: {');
    expect(html).toContain('<span class="property">&quot;primary&quot;</span>: <span class="string">&quot;#7c2d12&quot;</span>');
    expect(html).toContain('<span class="string">&quot;&lt;Custom&gt;&quot;</span>');
    expect(html).not.toContain("<Custom>");
  });
});
