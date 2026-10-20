import { defineTool } from "eve/tools";
import { milestones } from "../../app/lib/workspace";

export default defineTool({
  description: "Read the Atlas pilot milestones, owners, and release gates.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  execute() { return { milestones }; },
});
