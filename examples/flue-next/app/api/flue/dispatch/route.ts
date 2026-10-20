import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createFlueClient } from "@flue/sdk";
import { streamFlueConversation } from "../../../lib/flue-adapter";
import {
  personaMessagesToChat,
  type PersonaDispatchBody,
} from "../../../lib/persona-wire";
import { previewResponse } from "../../../lib/preview";
import { getRelease } from "../../../lib/releases";

export const runtime = "nodejs";
export const maxDuration = 120;
const cookieName = "orbit_flue_session";

function sessionId(request: Request, secret: string) {
  const sign = (id: string) =>
    createHmac("sha256", secret).update(id).digest("hex");
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  const [id = "", signature = ""] = (value ?? "").split(".");
  if (
    /^[a-f0-9-]{36}$/.test(id) &&
    /^[a-f0-9]{64}$/.test(signature) &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(sign(id)))
  )
    return { id, cookie: `${id}.${signature}` };
  const fresh = randomUUID();
  return { id: fresh, cookie: `${fresh}.${sign(fresh)}` };
}

export async function POST(request: Request) {
  let body: PersonaDispatchBody;
  try {
    const parsed: unknown = await request.json();
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as PersonaDispatchBody).messages)
    )
      throw new Error("Invalid messages");
    body = parsed as PersonaDispatchBody;
    if (
      !body.messages?.every((message) => message && typeof message === "object")
    )
      throw new Error("Invalid message");
  } catch {
    return Response.json(
      { error: "Send a JSON body with a messages array." },
      { status: 400 }
    );
  }
  const prompt = personaMessagesToChat(body.messages)
    .filter((message) => message.role === "user")
    .at(-1)
    ?.content.trim();
  if (!prompt || prompt.length > 20_000)
    return Response.json(
      { error: "Send a message between 1 and 20,000 characters." },
      { status: 400 }
    );
  const release = getRelease(body.context?.release);
  const mode = new URL(request.url).searchParams.get("mode");
  if (mode !== "live")
    return previewResponse(prompt, release.id, request.signal);
  const url = process.env.FLUE_AGENT_URL;
  const token = process.env.FLUE_TOKEN;
  if (!url || !token)
    return Response.json(
      {
        error:
          "Live mode is not configured. Use Preview or configure the Flue service.",
      },
      { status: 503 }
    );
  const conversationId = body.context?.conversationId;
  if (
    typeof conversationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      conversationId
    )
  ) {
    return Response.json(
      { error: "A valid conversation identifier is required in Live mode." },
      { status: 400 }
    );
  }
  const session = sessionId(request, token);
  const upstreamId = createHmac("sha256", token)
    .update(`${session.id}:${release.id}:${conversationId.toLowerCase()}`)
    .digest("hex");
  const client = createFlueClient({
    url: `${url.replace(/\/$/, "")}/${upstreamId}`,
    token,
  });
  const response = streamFlueConversation(
    client,
    `Current release: ${release.id} (Orbit ${release.version}).\nUser request: ${prompt}`,
    request.signal
  );
  response.headers.append(
    "set-cookie",
    `${cookieName}=${
      session.cookie
    }; HttpOnly; SameSite=Strict; Path=/api/flue; Max-Age=86400${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`
  );
  return response;
}
