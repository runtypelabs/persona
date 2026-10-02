// Static, deterministic flight catalog + seat-map generator for the Skylark Air
// demo. Nothing here calls a network or a clock with real fares — given the
// same search (or the same flightId) it always returns the same flights and the
// same taken seats, so demo prompts are reproducible.

import type { Cabin, Flight, Seat, SeatMap, SeatRow, SeatType } from "./types";

const CARRIERS: Array<{ name: string; code: string }> = [
  { name: "Skylark Air", code: "SK" },
  { name: "Meridian", code: "MR" },
  { name: "Northwind", code: "NW" },
];

/** Cheap deterministic 32-bit hash so results are stable per input string. */
const hash = (input: string): number => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Deterministic pseudo-random in [0, 1) seeded by a string. */
const rand = (seed: string): number => (hash(seed) % 100000) / 100000;

const CABIN_MULTIPLIER: Record<Cabin, number> = {
  economy: 1,
  premium: 1.8,
  business: 3.2,
};

const pad = (n: number): string => String(n).padStart(2, "0");

const minutesToTime = (mins: number): string => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/**
 * Generate the flight options for one leg of a search. Deterministic in
 * (origin, destination, date, cabin); returns 3–5 options sorted by departure.
 */
export const searchFlights = (
  origin: string,
  destination: string,
  date: string,
  cabin: Cabin,
): Flight[] => {
  const o = origin.toUpperCase();
  const d = destination.toUpperCase();
  const base = `${o}-${d}-${date}-${cabin}`;
  const count = 3 + (hash(base) % 3); // 3..5
  // A stable "distance" gives plausible, route-consistent durations & fares.
  const distance = 60 + (hash(`${o}-${d}`) % 360); // 60..419 (×10 min)
  const baseFare = 90 + (hash(`${o}-${d}-fare`) % 260); // 90..349

  const flights: Flight[] = [];
  for (let i = 0; i < count; i++) {
    const seed = `${base}-${i}`;
    const carrier = CARRIERS[hash(seed) % CARRIERS.length];
    const departMins = 6 * 60 + Math.floor(rand(`${seed}-dep`) * 15 * 60); // 06:00..21:00
    const durationMinutes = distance * 10 + Math.floor(rand(`${seed}-dur`) * 90);
    const stops = rand(`${seed}-stops`) < 0.65 ? 0 : 1;
    const fare = Math.round(
      (baseFare + Math.floor(rand(`${seed}-price`) * 120) + (stops ? -40 : 30)) *
        CABIN_MULTIPLIER[cabin],
    );
    flights.push({
      id: `${carrier.code}${100 + (hash(seed) % 899)}-${date}`,
      carrier: carrier.name,
      flightNumber: `${carrier.code}${100 + (hash(seed) % 899)}`,
      origin: o,
      destination: d,
      date,
      departTime: minutesToTime(departMins),
      arriveTime: minutesToTime(departMins + durationMinutes),
      durationMinutes,
      stops,
      cabin,
      price: fare,
    });
  }
  return flights.sort((a, b) => a.departTime.localeCompare(b.departTime));
};

// ---------------------------------------------------------------------------
// Seat maps

type CabinLayout = {
  columns: string[];
  columnTypes: SeatType[];
  firstRow: number;
  lastRow: number;
  /** 1-based row offsets (from firstRow) that are exit rows / extra legroom. */
  exitRowOffsets: number[];
  basePrice: number;
};

const LAYOUTS: Record<Cabin, CabinLayout> = {
  business: {
    columns: ["A", "C", "D", "F"],
    columnTypes: ["window", "aisle", "aisle", "window"],
    firstRow: 1,
    lastRow: 5,
    exitRowOffsets: [],
    basePrice: 0,
  },
  premium: {
    columns: ["A", "B", "C", "D", "E", "F"],
    columnTypes: ["window", "middle", "aisle", "aisle", "middle", "window"],
    firstRow: 6,
    lastRow: 12,
    exitRowOffsets: [0],
    basePrice: 18,
  },
  economy: {
    columns: ["A", "B", "C", "D", "E", "F"],
    columnTypes: ["window", "middle", "aisle", "aisle", "middle", "window"],
    firstRow: 14,
    lastRow: 32,
    // Rows 14 & 15 sit at the over-wing exits with extra legroom.
    exitRowOffsets: [0, 1],
    basePrice: 0,
  },
};

/**
 * Build the seat map for a flight. Taken seats are deterministic in the
 * flightId so re-reading the map is stable across turns. Business rows and the
 * exit rows carry extra legroom; window/aisle/middle come from column position.
 */
export const buildSeatMap = (flightId: string, cabin: Cabin): SeatMap => {
  const layout = LAYOUTS[cabin];
  const rows: SeatRow[] = [];
  for (let r = layout.firstRow; r <= layout.lastRow; r++) {
    const offset = r - layout.firstRow;
    const isExit = layout.exitRowOffsets.includes(offset);
    const extraLegroom = isExit || cabin === "business";
    const seats: Seat[] = layout.columns.map((col, i) => {
      const type = layout.columnTypes[i];
      const taken = rand(`${flightId}-${r}${col}`) < 0.4;
      const legroomSurcharge = extraLegroom ? 15 : 0;
      const windowAisleSurcharge = type === "middle" ? 0 : 6;
      return {
        seat: `${r}${col}`,
        status: taken ? "taken" : "available",
        type,
        exitRow: isExit,
        extraLegroom,
        price: layout.basePrice + legroomSurcharge + windowAisleSurcharge,
      };
    });
    rows.push({ row: r, exitRow: isExit, extraLegroom, seats });
  }
  return {
    flightId,
    cabin,
    columns: layout.columns,
    columnTypes: layout.columnTypes,
    rows,
  };
};

/** Look up a single seat in a flight's map (or undefined if it doesn't exist). */
export const findSeat = (map: SeatMap, seat: string): Seat | undefined => {
  const target = seat.toUpperCase();
  for (const row of map.rows) {
    const found = row.seats.find((s) => s.seat === target);
    if (found) return found;
  }
  return undefined;
};
