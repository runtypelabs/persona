import { handleDispatch } from "../shim";

// Node runtime: the shim keeps paused executions in an in-memory Map across the
// dispatch → resume round-trip.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  return handleDispatch(body);
}
