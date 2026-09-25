import type { AgentWidgetMessage, ClientChatRequest, ClientSession, ClientToolDefinition } from "./types";
import type { SteerAdmission } from "./live-input-contract";
import { VERSION } from "./version";

type DeliveryError = new (message: string, rejected: boolean) => Error;
type SteerPayload = { request: Omit<ClientChatRequest, "clientTools" | "clientToolsFingerprint">; tools?: ClientToolDefinition[]; conversationId?: string };
export type SteerPayloadCache = Map<string, SteerPayload>;
const DELIVERY_STATES = ["pending", "applied", "settled", "not_applied"];

export function validateSteer(session: ClientSession, messages: AgentWidgetMessage[], turnId: string, ErrorType: DeliveryError): void {
  if (!session.durableRecovery?.steer || messages.length !== 1 || messages[0]?.id !== turnId || messages[0]?.role !== "user") {
    throw new ErrorType("Live input steering requires a supported native durable agent session and new user messages only", true);
  }
}

export function freezeSteerPayload(cache: SteerPayloadCache, turnId: string, session: ClientSession, request: SteerPayload["request"], tools: SteerPayload["tools"], ErrorType: DeliveryError): SteerPayload {
  const cached = cache.get(turnId);
  if (cached) {
    if (cached.conversationId !== session.conversationId) throw new ErrorType("This delivery belongs to a different conversation", true);
    return { ...cached, request: { ...cached.request, sessionId: session.sessionId } };
  }
  if (cache.size >= 32) throw new ErrorType("Resolve unacknowledged deliveries before sending more messages", true);
  cache.set(turnId, structuredClone({ request, tools, conversationId: session.conversationId }));
  return { request, tools };
}

export async function readSteerAdmission(response: Response): Promise<SteerAdmission> {
  if (response.status === 202) {
    const receipt = await response.json();
    if (!receipt.executionId || !receipt.deliveryId || !DELIVERY_STATES.includes(receipt.deliveryStatus)) throw new Error("Invalid live input receipt");
    return { kind: "receipt", executionId: receipt.executionId, deliveryId: receipt.deliveryId, status: receipt.deliveryStatus };
  }
  const executionId = response.headers.get("X-Runtype-Execution-Id");
  const deliveryId = response.headers.get("X-Runtype-Delivery-Id");
  if (!response.headers.get("content-type")?.includes("text/event-stream") || !executionId || !deliveryId) throw new Error("Invalid live input stream admission");
  return { kind: "stream", executionId, deliveryId, status: "pending" };
}

export async function clientExecutionRequest(input: {
  session: ClientSession; visitorToken: string | null | undefined; apiUrl: string;
  executionId: string; operation: string; method: "GET" | "POST"; signal?: AbortSignal;
  errorFor: (response: Response) => Promise<Error>;
}): Promise<Response> {
  const { session, visitorToken, executionId, operation, method, signal } = input;
  if (!session.conversationId || !visitorToken || !session.durableRecovery?.steer) throw new Error("Live input steering is unavailable for this session");
  const path = `${input.apiUrl}/v1/client/conversations/${encodeURIComponent(session.conversationId)}/executions/${encodeURIComponent(executionId)}/${operation}`;
  const response = await fetch(`${path}?${new URLSearchParams({ sessionId: session.sessionId })}`, {
    method, headers: { "X-Persona-Version": VERSION, "X-Visitor-Token": visitorToken }, signal,
  });
  if (!response.ok && !(operation === "cancel" && response.status === 409)) throw await input.errorFor(response);
  return response;
}

export async function readDeliveryStatus(response: Response, executionId: string, deliveryId: string): Promise<SteerAdmission> {
  const receipt = await response.json();
  if (receipt.executionId !== executionId || receipt.deliveryId !== deliveryId || !DELIVERY_STATES.includes(receipt.status)) throw new Error("Invalid live input delivery status");
  return { kind: "receipt", executionId, deliveryId, status: receipt.status };
}

export async function readCancellation(response: Response, executionId: string): Promise<void> {
  const result = await response.json();
  if (result.executionId !== executionId || typeof result.accepted !== "boolean") throw new Error("Invalid execution cancellation acknowledgement");
}

export async function watchInputDelivery(input: {
  admission: SteerAdmission; signal: AbortSignal;
  update: (state: Partial<NonNullable<AgentWidgetMessage["delivery"]>>) => void;
  read: () => Promise<SteerAdmission>;
}): Promise<void> {
  const { signal, update } = input;
  let failures = 0;
  let receipt = input.admission;
  while (!signal.aborted) {
    update({ deliveryId: receipt.deliveryId, executionId: receipt.executionId, status: receipt.status });
    if (receipt.status === "settled" || receipt.status === "not_applied") return;
    await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
      const timer = setTimeout(done, Math.min(1000 * 2 ** failures, 30000));
      signal.addEventListener("abort", done, { once: true });
    });
    if (signal.aborted) return;
    try {
      receipt = await input.read();
      failures = 0;
      update({ error: undefined });
    } catch (error) {
      if (signal.aborted) return;
      failures++;
      update({ error: error instanceof Error ? error.message : String(error), ...(failures >= 6 ? { status: "unknown" as const } : {}) });
      if (failures >= 6) return;
    }
  }
}
