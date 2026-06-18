import type { ComponentRenderer } from "@runtypelabs/persona";

import type { GalleryComponent } from "./types";

/**
 * SimpleChart — a static bar chart built from `data` (numbers) and optional
 * `labels`. A display-only example: it reads props and returns DOM, no state.
 */
export const SimpleChart: ComponentRenderer = (props) => {
  const chart = document.createElement("div");
  chart.className = "simple-chart";
  chart.style.cssText = `
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1.5rem;
    background: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    max-width: 500px;
    margin: 1rem 0;
  `;

  const title = String(props.title || "Chart");
  const data = Array.isArray(props.data) ? props.data : [];
  const labels = Array.isArray(props.labels) ? props.labels : [];

  const maxValue =
    data.length > 0
      ? Math.max(...(data as number[]).map((v) => (typeof v === "number" ? v : 0)))
      : 100;

  chart.innerHTML = `
    <h3 style="margin: 0 0 1rem 0; color: #333; font-size: 1.25rem;">${title}</h3>
    <div style="display: flex; align-items: flex-end; gap: 0.5rem; height: 200px; border-bottom: 2px solid #e0e0e0;">
      ${data
        .map((value, index) => {
          const numValue = typeof value === "number" ? value : 0;
          const height = (numValue / maxValue) * 100;
          const label = labels[index] || `Item ${index + 1}`;
          return `
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%;">
            <div style="
              width: 100%;
              background: linear-gradient(to top, #2196f3, #64b5f6);
              height: ${height}%;
              min-height: ${height > 0 ? "4px" : "0"};
              border-radius: 4px 4px 0 0;
              margin-bottom: 0.5rem;
              transition: height 0.3s ease;
            "></div>
            <div style="font-size: 0.75rem; color: #666; text-align: center; transform: rotate(-45deg); transform-origin: center; white-space: nowrap;">
              ${label}
            </div>
            <div style="font-size: 0.8rem; font-weight: bold; color: #333; margin-top: 0.25rem;">
              ${numValue}
            </div>
          </div>
        `;
        })
        .join("")}
    </div>
  `;

  return chart;
};

const simpleChart: GalleryComponent = {
  name: "SimpleChart",
  label: "Chart",
  renderer: SimpleChart,
  sample: {
    text: "Preview: a streamed SimpleChart component.",
    props: {
      title: "Quarterly pipeline",
      data: [42, 68, 91, 76],
      labels: ["Q1", "Q2", "Q3", "Q4"],
    },
  },
};

export default simpleChart;
