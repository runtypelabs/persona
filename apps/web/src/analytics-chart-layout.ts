import type { ChartAssemblyInput } from "flint-chart";

const MIN_CHART_WIDTH = 320;
const MIN_CHART_HEIGHT = 280;

/**
 * Flint uses the declared canvas to place legends and other chart furniture.
 * Reassemble against the live artifact pane instead of the recipe's desktop
 * fallback so those absolute positions remain useful at every split width.
 */
export const fitFlintInputToCanvas = (
  input: ChartAssemblyInput,
  width: number,
  height: number,
): ChartAssemblyInput => {
  const fittedWidth = Math.max(MIN_CHART_WIDTH, Math.round(width));
  const fittedHeight = Math.max(MIN_CHART_HEIGHT, Math.round(height));

  return {
    ...input,
    chart_spec: {
      ...input.chart_spec,
      baseSize: { width: fittedWidth, height: fittedHeight },
      canvasSize: { width: fittedWidth, height: fittedHeight },
    },
  };
};
