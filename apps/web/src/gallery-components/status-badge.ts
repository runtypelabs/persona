import type { ComponentRenderer } from "@runtypelabs/persona";

import type { GalleryComponent } from "./types";

/**
 * StatusBadge — a small colored pill keyed off a `status` string. The simplest
 * possible example: map a prop to a color and return a single element.
 */
export const StatusBadge: ComponentRenderer = (props) => {
  const badge = document.createElement("div");
  badge.className = "status-badge";

  const status = String(props.status || "unknown").toLowerCase();
  const message = String(props.message || status);

  const colorMap: Record<string, string> = {
    success: "#4caf50",
    error: "#f44336",
    warning: "#ff9800",
    info: "#2196f3",
    pending: "#9e9e9e",
  };

  const color = colorMap[status] || colorMap.info;

  badge.style.cssText = `
    display: inline-block;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    background: ${color}20;
    color: ${color};
    border: 1px solid ${color};
    font-size: 0.9rem;
    font-weight: 500;
    margin: 0.5rem 0;
  `;

  badge.textContent = message;

  return badge;
};

const statusBadge: GalleryComponent = {
  name: "StatusBadge",
  label: "Status badge",
  renderer: StatusBadge,
  sample: {
    text: "Preview: a streamed StatusBadge component.",
    props: {
      status: "success",
      message: "Account verified",
    },
  },
};

export default statusBadge;
