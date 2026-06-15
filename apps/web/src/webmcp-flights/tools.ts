import type { BookingStore } from "./store";
import type {
  Cabin,
  Flight,
  Leg,
  Passenger,
  SeatAssignment,
} from "./types";
import { CABINS, makeId } from "./types";
import { buildSeatMap, findSeat, searchFlights } from "./catalog";

// WebMCP tool surface for the Skylark Air booking demo. The page registers
// these on document.modelContext; the Persona widget snapshots them every turn
// and forwards them as clientTools[], so the in-code WEBMCP_FLIGHTS_FLOW drives
// them and the widget executes them here, on the page.
//
// Every tool returns structured JSON (the ids/seats it touched) so the model
// can chain calls without re-reading state. Reads + ordinary form fills
// auto-approve; only the irreversible commit (confirm_booking) and reset raise
// Persona's approval bubble — see the sets below + main.ts's autoApprove.

const OWNER = "__webmcpFlightsAbort";

declare global {
  interface Window {
    [OWNER]?: AbortController;
  }
}

// Only the irreversible / destructive tools confirm; everything else
// auto-approves so the user can watch the Copilot fill the form live.
export const APPROVAL_REQUIRED_TOOL_NAMES = new Set([
  "confirm_booking",
  "reset_booking",
]);

export const READ_ONLY_TOOL_NAMES = new Set([
  "get_booking_state",
  "search_flights",
  "get_seat_map",
]);

type ToolDescriptor = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => unknown | Promise<unknown>;
};

type RegisterableModelContext = {
  registerTool: (
    tool: ToolDescriptor & { annotations?: Record<string, unknown> },
    options?: { signal?: AbortSignal },
  ) => void;
};

const getModelContext = (): RegisterableModelContext | undefined =>
  (document as unknown as { modelContext?: RegisterableModelContext })
    .modelContext ??
  (navigator as unknown as { modelContext?: RegisterableModelContext })
    .modelContext;

const toolResult = (data: unknown, summary?: string): unknown => ({
  content: [
    {
      type: "text",
      text: `${summary ? `${summary}\n\n` : ""}${JSON.stringify(data, null, 2)}`,
    },
  ],
  structuredContent: data,
});

const registerTool = (
  modelContext: RegisterableModelContext,
  tool: ToolDescriptor,
  signal: AbortSignal,
): void => {
  try {
    // The WebMCP spec carries the display title on the descriptor, but the
    // current @mcp-b SDK only surfaces annotations.title to consumers (Persona
    // approval bubbles, Chrome DevTools MCP) — mirror it there.
    const descriptor = tool.title
      ? { ...tool, annotations: { title: tool.title, ...tool.annotations } }
      : tool;
    modelContext.registerTool(descriptor, { signal });
  } catch (error) {
    console.warn(`[Flights] Failed to register ${tool.name}`, error);
  }
};

// ---------------------------------------------------------------------------
// Serialization + pricing helpers

const seatSurcharge = (store: BookingStore) => (a: SeatAssignment): number => {
  const flight = store.findFlight(a.flightId);
  if (!flight) return 0;
  const seat = findSeat(buildSeatMap(flight.id, flight.cabin), a.seat);
  return seat?.price ?? 0;
};

const passengerIsComplete = (p: Passenger): boolean =>
  Boolean(p.firstName?.trim() && p.lastName?.trim() && p.dateOfBirth?.trim());

const publicFlight = (f: Flight): Record<string, unknown> => ({
  id: f.id,
  carrier: f.carrier,
  flightNumber: f.flightNumber,
  route: `${f.origin}→${f.destination}`,
  date: f.date,
  depart: f.departTime,
  arrive: f.arriveTime,
  durationMinutes: f.durationMinutes,
  stops: f.stops,
  cabin: f.cabin,
  price: f.price,
});

const bookingSnapshot = (store: BookingStore): Record<string, unknown> => {
  const { booking } = store;
  return {
    search: booking.search,
    selectedFlights: {
      outbound: booking.selectedFlights.outbound
        ? publicFlight(booking.selectedFlights.outbound)
        : null,
      return: booking.selectedFlights.return
        ? publicFlight(booking.selectedFlights.return)
        : null,
    },
    passengers: booking.passengers.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      complete: passengerIsComplete(p),
    })),
    seatAssignments: booking.seatAssignments,
    totalPrice: store.totalPrice(seatSurcharge(store)),
    confirmation: booking.confirmation,
  };
};

const normalizeCabin = (value: unknown, fallback: Cabin): Cabin =>
  CABINS.includes(value as Cabin) ? (value as Cabin) : fallback;

// ---------------------------------------------------------------------------
// Tool definitions

const buildTools = (
  store: BookingStore,
  flash: (keys: string[]) => void,
): ToolDescriptor[] => [
  {
    name: "get_booking_state",
    title: "Read the booking",
    description:
      "Read the whole trip: search criteria, selected outbound/return flights, passengers (with whether each has all required details), seat assignments, the running price total, and any confirmation. The same state rides along every turn as booking_context, so call this only when you need a fresh read after several changes.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute() {
      return toolResult(bookingSnapshot(store));
    },
  },
  {
    name: "search_flights",
    title: "Search flights",
    description:
      "Search the catalog for one leg and store the results (also sets the trip's search criteria). Returns flight options with id, times, duration, stops, cabin, and per-passenger price. Always search before selecting a flight — never invent flight ids, times, or fares.",
    inputSchema: {
      type: "object",
      required: ["origin", "destination", "departDate"],
      properties: {
        origin: { type: "string", description: "Origin airport code, e.g. 'SFO'." },
        destination: { type: "string", description: "Destination airport code, e.g. 'JFK'." },
        departDate: { type: "string", description: "Outbound date, ISO 'YYYY-MM-DD'." },
        returnDate: {
          type: "string",
          description: "Optional return date, ISO 'YYYY-MM-DD'. Must be on or after departDate.",
        },
        passengers: { type: "number", description: "Number of passengers (default 1)." },
        cabin: { type: "string", enum: ["economy", "premium", "business"] },
      },
    },
    execute(args) {
      const origin = String(args.origin ?? "").trim().toUpperCase();
      const destination = String(args.destination ?? "").trim().toUpperCase();
      const departDate = String(args.departDate ?? "").trim();
      const returnDate =
        typeof args.returnDate === "string" && args.returnDate.trim()
          ? args.returnDate.trim()
          : undefined;
      if (!origin || !destination) throw new Error("origin and destination are required.");
      if (origin === destination) throw new Error("origin and destination must differ.");
      if (!departDate) throw new Error("departDate is required (ISO YYYY-MM-DD).");
      if (returnDate && returnDate < departDate) {
        throw new Error(
          `returnDate (${returnDate}) is before departDate (${departDate}). The return must be on or after the outbound date.`,
        );
      }
      const passengerCount =
        typeof args.passengers === "number" && args.passengers > 0
          ? Math.floor(args.passengers)
          : store.booking.search?.passengerCount ?? 1;
      const cabin = normalizeCabin(args.cabin, store.booking.search?.cabin ?? "economy");

      const results = searchFlights(origin, destination, departDate, cabin);
      store.commit((booking) => {
        booking.search = { origin, destination, departDate, returnDate, passengerCount, cabin };
        booking.results = results;
      });
      return toolResult(
        { count: results.length, cabin, flights: results.map(publicFlight) },
        `Found ${results.length} ${cabin} flights ${origin}→${destination} on ${departDate}.`,
      );
    },
  },
  {
    name: "get_seat_map",
    title: "Read a seat map",
    description:
      "Read a flight's seat map as a grid. `columns` + `columnTypes` are the spatial legend (window seats are the first & last columns; aisle seats border the middle gap). Each row object has its absolute `row` number (lower = nearer the front) and a `seats` array in left-to-right column order, so seats next to each other in the array are physically adjacent. Each seat carries its own type, exitRow, extraLegroom, status, and surcharge. Use this to pick seats by human description (e.g. 'two windows together near the front with extra legroom').",
    inputSchema: {
      type: "object",
      required: ["flightId"],
      properties: {
        flightId: { type: "string", description: "A selected flight's id." },
      },
    },
    annotations: { readOnlyHint: true },
    execute(args) {
      const flightId = String(args.flightId ?? "");
      const flight = store.findFlight(flightId);
      if (!flight) {
        throw new Error(
          `No flight "${flightId}". Search and select a flight first, then read its seat map.`,
        );
      }
      const map = buildSeatMap(flight.id, flight.cabin);
      const available = map.rows.reduce(
        (n, r) => n + r.seats.filter((s) => s.status === "available").length,
        0,
      );
      return toolResult(
        map,
        `Seat map for ${flight.flightNumber} (${flight.cabin}): ${available} seats available.`,
      );
    },
  },
  {
    name: "select_flight",
    title: "Select a flight",
    description:
      "Add a flight to the trip as the outbound or return leg. The flight id must come from a search_flights result. Selecting a leg replaces any prior choice for that leg (and clears seats assigned on the replaced flight).",
    inputSchema: {
      type: "object",
      required: ["flightId", "leg"],
      properties: {
        flightId: { type: "string", description: "A flight id from search_flights." },
        leg: { type: "string", enum: ["outbound", "return"] },
      },
    },
    execute(args) {
      const flightId = String(args.flightId ?? "");
      const leg = String(args.leg ?? "") as Leg;
      if (leg !== "outbound" && leg !== "return") {
        throw new Error("leg must be 'outbound' or 'return'.");
      }
      const flight = store.booking.results.find((f) => f.id === flightId);
      if (!flight) {
        throw new Error(
          `No flight "${flightId}" in the latest search results. Call search_flights first.`,
        );
      }
      store.commit((booking) => {
        const prior = booking.selectedFlights[leg];
        if (prior && prior.id !== flight.id) {
          booking.seatAssignments = booking.seatAssignments.filter(
            (a) => a.flightId !== prior.id,
          );
        }
        booking.selectedFlights[leg] = structuredClone(flight);
      });
      flash([`flight:${flight.id}`]);
      return toolResult(
        { leg, flight: publicFlight(flight) },
        `Selected ${flight.flightNumber} as the ${leg} flight.`,
      );
    },
  },
  {
    name: "set_passengers",
    title: "Set the passenger list",
    description:
      "Replace the whole passenger list. Each passenger needs firstName, lastName, and dateOfBirth (ISO YYYY-MM-DD). Returns the passengers with their assigned ids — use those ids for assign_seat and update_passenger.",
    inputSchema: {
      type: "object",
      required: ["passengers"],
      properties: {
        passengers: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["firstName", "lastName"],
            properties: {
              firstName: { type: "string" },
              lastName: { type: "string" },
              dateOfBirth: { type: "string", description: "ISO YYYY-MM-DD." },
            },
          },
        },
      },
    },
    execute(args) {
      const list = Array.isArray(args.passengers) ? args.passengers : [];
      if (!list.length) throw new Error("Provide at least one passenger.");
      const passengers: Passenger[] = list.map((raw) => {
        const p = (raw ?? {}) as Record<string, unknown>;
        return {
          id: makeId("pax"),
          firstName: String(p.firstName ?? "").trim(),
          lastName: String(p.lastName ?? "").trim(),
          dateOfBirth: String(p.dateOfBirth ?? "").trim(),
        };
      });
      store.commit((booking) => {
        booking.passengers = passengers;
        // Passenger ids changed, so prior seat assignments no longer resolve.
        booking.seatAssignments = [];
      });
      flash(passengers.map((p) => `passenger:${p.id}`));
      return toolResult(
        {
          passengers: passengers.map((p) => ({
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            dateOfBirth: p.dateOfBirth || null,
            complete: passengerIsComplete(p),
          })),
        },
        `Set ${passengers.length} passenger(s).`,
      );
    },
  },
  {
    name: "update_passenger",
    title: "Update a passenger",
    description:
      "Patch one passenger's details (e.g. fill in a missing date of birth or fix a name). Identify the passenger by passengerId or 1-based index. Omitted fields are unchanged.",
    inputSchema: {
      type: "object",
      properties: {
        passengerId: { type: "string" },
        index: { type: "number", description: "1-based passenger index (alternative to passengerId)." },
        firstName: { type: "string" },
        lastName: { type: "string" },
        dateOfBirth: { type: "string", description: "ISO YYYY-MM-DD." },
      },
    },
    execute(args) {
      const { passengers } = store.booking;
      let passenger: Passenger | undefined;
      if (typeof args.passengerId === "string" && args.passengerId) {
        passenger = passengers.find((p) => p.id === args.passengerId);
      } else if (typeof args.index === "number") {
        passenger = passengers[Math.floor(args.index) - 1];
      }
      if (!passenger) {
        throw new Error(
          "No matching passenger. Pass a valid passengerId or 1-based index, or call set_passengers first.",
        );
      }
      const targetId = passenger.id;
      store.commit((booking) => {
        const p = booking.passengers.find((x) => x.id === targetId);
        if (!p) return;
        if (typeof args.firstName === "string") p.firstName = args.firstName.trim();
        if (typeof args.lastName === "string") p.lastName = args.lastName.trim();
        if (typeof args.dateOfBirth === "string") p.dateOfBirth = args.dateOfBirth.trim();
      });
      flash([`passenger:${targetId}`]);
      const fresh = store.findPassenger(targetId);
      return toolResult({
        passenger: fresh && {
          id: fresh.id,
          firstName: fresh.firstName,
          lastName: fresh.lastName,
          dateOfBirth: fresh.dateOfBirth || null,
          complete: passengerIsComplete(fresh),
        },
      });
    },
  },
  {
    name: "assign_seat",
    title: "Assign a seat",
    description:
      "Assign one seat to one passenger on a selected flight. The seat must exist in that flight's seat map and be available; a passenger can hold only one seat per flight, and a seat can't be given to two passengers. Read get_seat_map first to choose a real, available seat.",
    inputSchema: {
      type: "object",
      required: ["flightId", "passengerId", "seat"],
      properties: {
        flightId: { type: "string", description: "A selected flight's id." },
        passengerId: { type: "string", description: "A passenger id from set_passengers." },
        seat: { type: "string", description: "Seat number, e.g. '14A'." },
      },
    },
    execute(args) {
      const flightId = String(args.flightId ?? "");
      const passengerId = String(args.passengerId ?? "");
      const seat = String(args.seat ?? "").trim().toUpperCase();
      const flight = store.findFlight(flightId);
      if (!flight || !store.legOfFlight(flightId)) {
        throw new Error(`Flight "${flightId}" isn't selected for this trip. Select it first.`);
      }
      const passenger = store.findPassenger(passengerId);
      if (!passenger) {
        throw new Error(`No passenger "${passengerId}". Call set_passengers first.`);
      }
      const map = buildSeatMap(flight.id, flight.cabin);
      const seatInfo = findSeat(map, seat);
      if (!seatInfo) {
        throw new Error(`Seat "${seat}" doesn't exist on ${flight.flightNumber}. Read get_seat_map.`);
      }
      if (seatInfo.status === "taken") {
        throw new Error(`Seat ${seat} on ${flight.flightNumber} is already taken. Pick an available seat.`);
      }
      const clash = store.booking.seatAssignments.find(
        (a) => a.flightId === flightId && a.seat === seat && a.passengerId !== passengerId,
      );
      if (clash) {
        throw new Error(`Seat ${seat} is already assigned to another passenger on this flight.`);
      }
      store.commit((booking) => {
        booking.seatAssignments = booking.seatAssignments.filter(
          (a) => !(a.flightId === flightId && a.passengerId === passengerId),
        );
        booking.seatAssignments.push({ flightId, passengerId, seat });
      });
      flash([`seat:${flightId}:${seat}`, `passenger:${passengerId}`]);
      return toolResult(
        {
          flightId,
          passengerId,
          seat,
          type: seatInfo.type,
          extraLegroom: seatInfo.extraLegroom,
          surcharge: seatInfo.price,
        },
        `Assigned seat ${seat} (${seatInfo.type}${seatInfo.extraLegroom ? ", extra legroom" : ""}) to ${passenger.firstName || "passenger"}.`,
      );
    },
  },
  {
    name: "confirm_booking",
    title: "Confirm and book the trip",
    description:
      "Finalize the booking. This is the irreversible commit — only call it when the traveler has explicitly said to book. It validates that an outbound flight is selected, every passenger has all required details, and every passenger has a seat on every selected flight; it relays any problem instead of booking. Returns a record locator on success.",
    inputSchema: { type: "object", properties: {} },
    annotations: { destructiveHint: true },
    execute() {
      const { booking } = store;
      const problems: string[] = [];
      if (!booking.selectedFlights.outbound) problems.push("no outbound flight is selected");
      if (!booking.passengers.length) problems.push("there are no passengers");
      const incomplete = booking.passengers.filter((p) => !passengerIsComplete(p));
      if (incomplete.length) {
        problems.push(
          `${incomplete.length} passenger(s) are missing a name or date of birth`,
        );
      }
      for (const flight of store.selectedFlightList()) {
        const seated = booking.seatAssignments.filter((a) => a.flightId === flight.id).length;
        if (seated < booking.passengers.length) {
          problems.push(
            `${booking.passengers.length - seated} passenger(s) still need a seat on ${flight.flightNumber}`,
          );
        }
      }
      if (problems.length) {
        throw new Error(`Can't confirm yet: ${problems.join("; ")}.`);
      }
      const total = store.totalPrice(seatSurcharge(store));
      const recordLocator = makeId("SKY").slice(-6).toUpperCase();
      store.commit((b) => {
        b.confirmation = {
          recordLocator,
          bookedAt: new Date().toISOString(),
          totalPrice: total,
        };
      });
      flash(["confirmation"]);
      return toolResult(
        { recordLocator, totalPrice: total, passengers: booking.passengers.length },
        `Booked! Record locator ${recordLocator}, total $${total}.`,
      );
    },
  },
  {
    name: "reset_booking",
    title: "Start over",
    description: "Clear the entire booking — search, flights, passengers, seats, and any confirmation.",
    inputSchema: { type: "object", properties: {} },
    annotations: { destructiveHint: true },
    execute() {
      store.reset();
      return toolResult({ ok: true }, "Cleared the booking.");
    },
  },
];

// ---------------------------------------------------------------------------
// Registration

export const setupFlightTools = (
  store: BookingStore,
  flash: (keys: string[]) => void,
): boolean => {
  const modelContext = getModelContext();
  if (!modelContext?.registerTool) {
    console.warn("[Flights] WebMCP unavailable — no modelContext found on this page.");
    return false;
  }
  window[OWNER]?.abort?.();
  const controller = new AbortController();
  window[OWNER] = controller;
  for (const tool of buildTools(store, flash)) {
    registerTool(modelContext, tool, controller.signal);
  }
  return true;
};
