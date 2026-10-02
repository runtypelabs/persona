// Data model for the WebMCP flight-booking demo ("Skylark Air"). The booking
// is a multi-step form: search criteria → selected flights → passengers →
// seat assignments → confirmation. Every field is filled by either a human
// gesture or an agent tool, through the same BookingStore.

export type Cabin = "economy" | "premium" | "business";

export type Flight = {
  id: string;
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  /** ISO date, e.g. "2026-06-19". */
  date: string;
  /** Local 24h time, e.g. "08:15". */
  departTime: string;
  arriveTime: string;
  /** Whole minutes. */
  durationMinutes: number;
  stops: number;
  cabin: Cabin;
  /** Base fare per passenger, USD. */
  price: number;
};

export type Leg = "outbound" | "return";

export type Passenger = {
  id: string;
  firstName: string;
  lastName: string;
  /** ISO date of birth, e.g. "1990-04-12". */
  dateOfBirth: string;
};

export type SeatType = "window" | "middle" | "aisle";
export type SeatStatus = "available" | "taken";

export type Seat = {
  /** e.g. "14A". */
  seat: string;
  status: SeatStatus;
  type: SeatType;
  exitRow: boolean;
  extraLegroom: boolean;
  /** Seat surcharge on top of the fare, USD. */
  price: number;
};

export type SeatRow = {
  row: number;
  exitRow: boolean;
  extraLegroom: boolean;
  seats: Seat[];
};

/**
 * Seat map shaped as a grid (rows × columns) so the agent can reason about
 * human seat concepts directly from the data layout: `columnTypes` is the
 * spatial legend (window seats are the first/last columns), each cell repeats
 * its own type/legroom/status so it is self-describing, adjacency is the row
 * array order, and "near the front" is ascending `row`.
 */
export type SeatMap = {
  flightId: string;
  cabin: Cabin;
  columns: string[];
  columnTypes: SeatType[];
  rows: SeatRow[];
};

/** A finalized seat choice for one passenger on one flight. */
export type SeatAssignment = {
  flightId: string;
  passengerId: string;
  seat: string;
};

export type SearchCriteria = {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  passengerCount: number;
  cabin: Cabin;
};

export type Confirmation = {
  recordLocator: string;
  bookedAt: string;
  totalPrice: number;
};

export type Booking = {
  search: SearchCriteria | null;
  /** Last search's results, kept so the UI can render the options list. */
  results: Flight[];
  selectedFlights: Partial<Record<Leg, Flight>>;
  passengers: Passenger[];
  seatAssignments: SeatAssignment[];
  confirmation: Confirmation | null;
};

let idCounter = 0;

/** Short unique id, readable in tool output (e.g. "pax-kf3a9x-7"). */
export const makeId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const AIRPORTS = ["SFO", "JFK", "LAX", "ORD", "SEA", "BOS", "DEN", "AUS"];

export const CABINS: Cabin[] = ["economy", "premium", "business"];
