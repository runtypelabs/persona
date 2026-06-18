import type { ComponentRenderer } from "@runtypelabs/persona";

import type { GalleryComponent } from "./types";

/**
 * InfoCard — a titled gradient card with an icon and body copy. Display-only.
 */
export const InfoCard: ComponentRenderer = (props) => {
  const card = document.createElement("div");
  card.className = "info-card";
  card.style.cssText = `
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    max-width: 400px;
    margin: 1rem 0;
  `;

  const title = String(props.title || "Information");
  const content = String(props.content || "");
  const icon = String(props.icon || "ℹ️");

  card.innerHTML = `
    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
      <span style="font-size: 2rem;">${icon}</span>
      <h3 style="margin: 0; font-size: 1.5rem;">${title}</h3>
    </div>
    ${content ? `<p style="margin: 0; line-height: 1.6; opacity: 0.95;">${content}</p>` : ""}
  `;

  return card;
};

const infoCard: GalleryComponent = {
  name: "InfoCard",
  label: "Info card",
  renderer: InfoCard,
  sample: {
    text: "Preview: a streamed InfoCard component.",
    props: {
      title: "Next step",
      content: "The same directive path can render any host-provided UI component.",
      icon: "i",
    },
  },
};

export default infoCard;
