import { createPreviewHandler, createResponsesPreviewHandler } from "../../../lib/preview";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const adapter = new URL(request.url).searchParams.get("adapter");
  return adapter === "openai-responses" ? createResponsesPreviewHandler()(request) : createPreviewHandler()(request);
}
