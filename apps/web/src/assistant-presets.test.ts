import { describe, expect, it } from "vitest";
import { createAssistantPreset } from "./assistant-presets";

const preset = (id: string) => createAssistantPreset(id, () => {});

describe("reference attachment presets", () => {
  it("keeps ChatGPT document cards wider than its square images with shared hover removal", () => {
    const config = preset("chatgpt");
    expect(config.attachments?.preview?.image?.fit).toBe("contain");
    expect(config.attachments?.preview?.file).toMatchObject({ layout: "vertical", name: "full", iconPlacement: "center", metadata: "none", remove: { placement: "overlap", visibility: "hover" } });
    expect(config.theme?.components?.attachment?.composer).toMatchObject({ image: { width: "120px", height: "120px" }, file: { width: "160px", minHeight: "120px", background: "#000000" }, remove: { foreground: "#242424", borderColor: "#000000", borderWidth: "3px" } });
  });

  it("pairs equal Gemini cards with contained images and a code tile", () => {
    const config = preset("gemini");
    expect(config.attachments?.preview?.image).toMatchObject({ fit: "contain", remove: { visibility: "hover", placement: "inside" } });
    expect(config.attachments?.preview?.file).toMatchObject({ name: "basename", iconName: "code-xml" });
    expect(config.theme?.components?.attachment?.composer).toMatchObject({ image: { width: "112px", height: "112px", borderRadius: "20px" }, file: { width: "112px", minHeight: "112px", borderRadius: "20px", background: "#383a3a", iconBackground: "#b9312b" }, remove: { background: "#ffffff" } });
  });

  it("keeps Copilot file removal independent and its controls in one row below attachments", () => {
    const config = preset("copilot");
    expect(config.composer?.attachmentLayout).toBe("single-row");
    expect(config.attachments?.preview?.file).toMatchObject({ layout: "horizontal", metadata: "none", remove: { visibility: "always" } });
    expect(config.theme?.components?.attachment?.composer).toMatchObject({ image: { width: "48px", height: "48px", remove: { foreground: "#ffffff" } }, file: { width: "188px", minHeight: "50px", iconSize: "28px", remove: { background: "transparent", hoverBackground: "#555555" } } });
  });

  it("uses compact outlined Perplexity chips with full names and hover inline removal", () => {
    const config = preset("perplexity");
    expect(config.attachments?.preview).toMatchObject({ image: { layout: "chip", name: "full", remove: { placement: "inline", visibility: "hover" } }, file: { layout: "horizontal", name: "full", metadata: "none", remove: { placement: "inline", visibility: "hover" } } });
    expect(config.theme?.components?.attachment?.composer).toMatchObject({ image: { width: "20px", height: "20px", chip: { minHeight: "30px", background: "transparent", fontSize: "14px", padding: "4px 8px" } }, file: { width: "auto", minHeight: "30px", background: "transparent", fontSize: "14px", iconSize: "18px", padding: "4px 8px" } });
  });

  it("preserves Claude's contained image and document treatment", () => {
    const config = preset("claude");
    expect(config.attachments?.preview?.image).toMatchObject({ fit: "contain", remove: { visibility: "hover" } });
    expect(config.attachments?.preview?.file).toMatchObject({ icon: false, name: "full", metadata: "line-count", badge: "extension" });
    expect(config.theme?.components?.attachment?.composer).toMatchObject({ image: { width: "124px", height: "124px" }, file: { width: "124px", minHeight: "124px" } });
  });
});
