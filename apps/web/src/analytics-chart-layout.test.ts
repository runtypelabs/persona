import { describe, expect, it } from "vitest";
import type { ChartAssemblyInput } from "flint-chart";
import { fitFlintInputToCanvas } from "./analytics-chart-layout";

const input: ChartAssemblyInput = {
  data: { values: [{ month: "2026-01", revenue: 100 }] },
  semantic_types: { month: "YearMonth", revenue: "Revenue" },
  chart_spec: {
    chartType: "Line Chart",
    encodings: { x: "month", y: "revenue" },
    baseSize: { width: 980, height: 520 },
  },
};

describe("fitFlintInputToCanvas", () => {
  it("uses the live artifact canvas without mutating the stored recipe", () => {
    const fitted = fitFlintInputToCanvas(input, 744.4, 508.6);

    expect(fitted.chart_spec.baseSize).toEqual({ width: 744, height: 509 });
    expect(fitted.chart_spec.canvasSize).toEqual({ width: 744, height: 509 });
    expect(input.chart_spec).not.toHaveProperty("canvasSize");
    expect(input.chart_spec.baseSize).toEqual({ width: 980, height: 520 });
  });

  it("keeps narrow or temporarily unmeasured canvases usable", () => {
    const fitted = fitFlintInputToCanvas(input, 0, 120);

    expect(fitted.chart_spec.baseSize).toEqual({ width: 320, height: 280 });
    expect(fitted.chart_spec.canvasSize).toEqual({ width: 320, height: 280 });
  });
});
