export class InputDeliveryError extends Error {
  constructor(message: string, readonly rejected: boolean) { super(message); this.name = "InputDeliveryError"; }
}

export type JoinAdmission = {
  kind: "stream" | "receipt";
  executionId: string;
  deliveryId: string;
  status: "pending" | "applied" | "settled" | "not_applied";
};
