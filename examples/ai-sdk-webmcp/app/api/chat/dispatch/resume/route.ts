import { handleResume } from "../../shim";

// Must share the process (and the in-memory execution store) with the dispatch
// route, so this resume endpoint lives at `${apiUrl}/resume` where the widget
// POSTs tool outputs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  return handleResume(body);
}
