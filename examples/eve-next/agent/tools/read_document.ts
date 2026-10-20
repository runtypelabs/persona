import { defineTool } from "eve/tools";
import { documents, documentMarkdown } from "../../app/lib/workspace";

export default defineTool({
  description: "Read an Atlas sample project document. Available IDs: launch-brief, research-notes, release-plan.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
  execute(input: { id: string }) {
    const document = documents.find((item) => item.id === input.id);
    return document ? { content: documentMarkdown(document) } : { error: "Document not found." };
  },
});
