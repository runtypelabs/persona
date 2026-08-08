import type {
  Booking,
  Flight,
  Leg,
  Passenger,
  SeatAssignment,
  SearchCriteria,
} from "./types";

const STORAGE_KEY = "persona-webmcp-flights-v1";
const PERSIST_DEBOUNCE_MS = 400;

const emptyBooking = (): Booking => ({
  search: null,
  results: [],
  selectedFlights: {},
  passengers: [],
  seatAssignments: [],
  confirmation: null,
});

/**
 * Single source of truth for the booking, shared by human gestures and agent
 * tools. Every mutation goes through `commit()`, so the page re-renders and
 * persists identically whether the user or the Copilot made the change.
 */
export class BookingStore {
  booking: Booking;

  private listeners = new Set<(store: BookingStore) => void>();
  private persistTimer: number | undefined;

  constructor() {
    this.booking = loadBooking() ?? emptyBooking();
  }

  subscribe(listener: (store: BookingStore) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** All mutations — human or agent — enter here. */
  commit(mutate: (booking: Booking) => void): void {
    const next = structuredClone(this.booking);
    mutate(next);
    this.booking = next;
    this.afterChange();
  }

  reset(): void {
    this.booking = emptyBooking();
    this.afterChange();
  }

  // ---- lookups -------------------------------------------------------------

  /** A flight by id from either the current results or the selected legs. */
  findFlight(flightId: string): Flight | undefined {
    if (this.booking.results.some((f) => f.id === flightId)) {
      return this.booking.results.find((f) => f.id === flightId);
    }
    return Object.values(this.booking.selectedFlights).find(
      (f) => f?.id === flightId,
    );
  }

  /** Every flight that is part of the trip (selected outbound/return). */
  selectedFlightList(): Flight[] {
    const { outbound, return: ret } = this.booking.selectedFlights;
    return [outbound, ret].filter((f): f is Flight => Boolean(f));
  }

  legOfFlight(flightId: string): Leg | undefined {
    const { outbound, return: ret } = this.booking.selectedFlights;
    if (outbound?.id === flightId) return "outbound";
    if (ret?.id === flightId) return "return";
    return undefined;
  }

  findPassenger(passengerId: string): Passenger | undefined {
    return this.booking.passengers.find((p) => p.id === passengerId);
  }

  seatFor(flightId: string, passengerId: string): SeatAssignment | undefined {
    return this.booking.seatAssignments.find(
      (a) => a.flightId === flightId && a.passengerId === passengerId,
    );
  }

  /** Total fare across selected flights × passengers, plus seat surcharges. */
  totalPrice(seatSurcharge: (a: SeatAssignment) => number): number {
    const paxCount = Math.max(this.booking.passengers.length, 1);
    const fares = this.selectedFlightList().reduce(
      (sum, f) => sum + f.price * paxCount,
      0,
    );
    const seats = this.booking.seatAssignments.reduce(
      (sum, a) => sum + seatSurcharge(a),
      0,
    );
    return fares + seats;
  }

  // ---- internals -----------------------------------------------------------

  private afterChange(): void {
    this.schedulePersist();
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this));
  }

  private schedulePersist(): void {
    window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(this.booking),
        );
      } catch {
        // Storage may be unavailable (private mode, quota) — demo keeps working.
      }
    }, PERSIST_DEBOUNCE_MS);
  }
}

const loadBooking = (): Booking | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Booking>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...emptyBooking(),
      ...parsed,
      selectedFlights: parsed.selectedFlights ?? {},
      results: parsed.results ?? [],
      passengers: parsed.passengers ?? [],
      seatAssignments: parsed.seatAssignments ?? [],
    };
  } catch {
    return null;
  }
};

export type { SearchCriteria };
