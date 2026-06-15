// Renders the Skylark Air booking page from the BookingStore and re-renders on
// every change — so whether the human uses the on-page controls or the Copilot
// calls a tool, the same store drives the same UI. Returns a `flash` helper the
// tools call to pulse whatever the agent just touched.

import type { BookingStore } from "./store";
import { buildSeatMap, findSeat, searchFlights } from "./catalog";
import type { Cabin, Flight, Leg } from "./types";
import { AIRPORTS, CABINS } from "./types";

const FLASH_MS = 1200;

const fmtDuration = (mins: number): string =>
  `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;

const fmtMoney = (n: number): string => `$${n.toLocaleString("en-US")}`;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(node, rest);
  if (dataset) for (const [k, v] of Object.entries(dataset)) node.dataset[k] = v;
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
};

const defaultDepartDate = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
};

export const createApp = (
  store: BookingStore,
  root: HTMLElement,
): { flash: (keys: string[]) => void } => {
  // --- search bar (functional on-page controls, same store as the tools) ----
  const originInput = el("input", { className: "sk-field", value: "SFO", placeholder: "From" });
  const destInput = el("input", { className: "sk-field", value: "JFK", placeholder: "To" });
  const dateInput = el("input", { className: "sk-field", type: "date", value: defaultDepartDate() });
  const paxInput = el("input", { className: "sk-field sk-field-num", type: "number", min: "1", max: "6", value: "1" });
  const cabinSelect = el("select", { className: "sk-field" },
    CABINS.map((c) => el("option", { value: c, textContent: c[0].toUpperCase() + c.slice(1) })),
  );
  const searchButton = el("button", { className: "sk-btn sk-btn-primary", type: "button", textContent: "Search" });

  const datalist = el("datalist", { id: "sk-airports" }, AIRPORTS.map((a) => el("option", { value: a })));
  originInput.setAttribute("list", "sk-airports");
  destInput.setAttribute("list", "sk-airports");

  searchButton.addEventListener("click", () => {
    const origin = originInput.value.trim().toUpperCase();
    const destination = destInput.value.trim().toUpperCase();
    const departDate = dateInput.value;
    if (!origin || !destination || origin === destination || !departDate) return;
    const cabin = cabinSelect.value as Cabin;
    const passengerCount = Math.max(1, Number(paxInput.value) || 1);
    const results = searchFlights(origin, destination, departDate, cabin);
    store.commit((booking) => {
      booking.search = { origin, destination, departDate, passengerCount, cabin };
      booking.results = results;
    });
  });

  const searchBar = el("div", { className: "sk-search" }, [
    el("div", { className: "sk-search-fields" }, [
      originInput, el("span", { className: "sk-arrow", textContent: "→" }), destInput,
      dateInput, paxInput, cabinSelect, searchButton,
    ]),
    datalist,
  ]);

  const resultsCol = el("section", { className: "sk-results", ariaLabel: "Flight results" });
  const tripCol = el("section", { className: "sk-trip", ariaLabel: "Your trip" });

  root.classList.add("sk-app");
  root.append(searchBar, el("div", { className: "sk-columns" }, [resultsCol, tripCol]));

  // --- renderers ------------------------------------------------------------

  const flightCard = (f: Flight, selectedLeg: Leg | undefined): HTMLElement => {
    const select = (leg: Leg) =>
      el("button", {
        className: "sk-btn sk-btn-ghost",
        type: "button",
        textContent: selectedLeg === leg ? `✓ ${leg}` : `Select ${leg}`,
        onclick: () => {
          store.commit((booking) => {
            const prior = booking.selectedFlights[leg];
            if (prior && prior.id !== f.id) {
              booking.seatAssignments = booking.seatAssignments.filter((a) => a.flightId !== prior.id);
            }
            booking.selectedFlights[leg] = structuredClone(f);
          });
        },
      });
    return el("article", {
      className: `sk-flight${selectedLeg ? " is-selected" : ""}`,
      dataset: { flashKey: `flight:${f.id}` },
    }, [
      el("div", { className: "sk-flight-main" }, [
        el("div", { className: "sk-flight-time" }, [`${f.departTime} → ${f.arriveTime}`]),
        el("div", { className: "sk-flight-meta" }, [
          `${f.carrier} ${f.flightNumber} · ${fmtDuration(f.durationMinutes)} · ${f.stops === 0 ? "nonstop" : `${f.stops} stop`}`,
        ]),
      ]),
      el("div", { className: "sk-flight-side" }, [
        el("div", { className: "sk-flight-price" }, [fmtMoney(f.price)]),
        el("div", { className: "sk-flight-actions" }, [select("outbound"), select("return")]),
      ]),
    ]);
  };

  const renderResults = (): void => {
    resultsCol.replaceChildren();
    const { search, results } = store.booking;
    resultsCol.append(
      el("h2", { className: "sk-h", textContent: search
        ? `${search.origin} → ${search.destination} · ${search.departDate} · ${search.cabin}`
        : "Search to see flights" }),
    );
    if (!results.length) {
      resultsCol.append(el("p", { className: "sk-empty", textContent: "No flights yet. Try a search above, or ask the Copilot." }));
      return;
    }
    for (const f of results) resultsCol.append(flightCard(f, store.legOfFlight(f.id)));
  };

  const seatGrid = (flight: Flight): HTMLElement => {
    const map = buildSeatMap(flight.id, flight.cabin);
    const assignedSeats = new Set(
      store.booking.seatAssignments.filter((a) => a.flightId === flight.id).map((a) => a.seat),
    );
    const header = el("div", { className: "sk-seat-row sk-seat-head" }, [
      el("span", { className: "sk-seat-rownum" }, [""]),
      ...map.columns.map((c, i) =>
        el("span", { className: "sk-seat-col", title: map.columnTypes[i] }, [c]),
      ),
    ]);
    const rows = map.rows.map((row) =>
      el("div", { className: `sk-seat-row${row.exitRow ? " is-exit" : ""}` }, [
        el("span", { className: "sk-seat-rownum" }, [String(row.row)]),
        ...row.seats.map((seat) => {
          const assigned = assignedSeats.has(seat.seat);
          const cls = assigned
            ? "is-assigned"
            : seat.status === "taken"
              ? "is-taken"
              : "is-open";
          return el("button", {
            className: `sk-seat ${cls}`,
            type: "button",
            title: `${seat.seat} · ${seat.type}${seat.extraLegroom ? " · extra legroom" : ""}${seat.price ? ` · +$${seat.price}` : ""}`,
            disabled: seat.status === "taken" && !assigned,
            dataset: { flashKey: `seat:${flight.id}:${seat.seat}` },
            textContent: seat.seat.replace(/^\d+/, ""),
          });
        }),
      ]),
    );
    return el("div", { className: "sk-seatmap" }, [
      el("div", { className: "sk-seatmap-title" }, [`${flight.flightNumber} · ${flight.cabin}`]),
      header,
      ...rows,
    ]);
  };

  const renderTrip = (): void => {
    tripCol.replaceChildren();
    const { booking } = store;
    const selected = store.selectedFlightList();

    // Selected flights
    const flightsBlock = el("div", { className: "sk-block" }, [el("h3", { className: "sk-h", textContent: "Trip" })]);
    if (!selected.length) {
      flightsBlock.append(el("p", { className: "sk-empty", textContent: "No flights selected yet." }));
    } else {
      for (const leg of ["outbound", "return"] as Leg[]) {
        const f = booking.selectedFlights[leg];
        if (!f) continue;
        flightsBlock.append(
          el("div", { className: "sk-trip-leg", dataset: { flashKey: `flight:${f.id}` } }, [
            el("span", { className: "sk-tag", textContent: leg }),
            `${f.flightNumber} ${f.origin}→${f.destination} ${f.departTime} · ${fmtMoney(f.price)}`,
          ]),
        );
      }
    }
    tripCol.append(flightsBlock);

    // Passengers
    const paxBlock = el("div", { className: "sk-block" }, [el("h3", { className: "sk-h", textContent: `Passengers (${booking.passengers.length})` })]);
    if (!booking.passengers.length) {
      paxBlock.append(el("p", { className: "sk-empty", textContent: "Tell the Copilot who's flying." }));
    } else {
      for (const p of booking.passengers) {
        const name = `${p.firstName} ${p.lastName}`.trim() || "(unnamed)";
        const missing = !p.firstName || !p.lastName || !p.dateOfBirth;
        paxBlock.append(
          el("div", { className: `sk-pax${missing ? " is-incomplete" : ""}`, dataset: { flashKey: `passenger:${p.id}` } }, [
            el("span", { className: "sk-pax-name", textContent: name }),
            el("span", { className: "sk-pax-dob", textContent: p.dateOfBirth || "DOB needed" }),
          ]),
        );
      }
    }
    tripCol.append(paxBlock);

    // Seat maps for each selected flight
    if (selected.length && booking.passengers.length) {
      const seatsBlock = el("div", { className: "sk-block" }, [el("h3", { className: "sk-h", textContent: "Seats" })]);
      for (const f of selected) seatsBlock.append(seatGrid(f));
      tripCol.append(seatsBlock);
    }

    // Review / confirm
    const total = store.totalPrice((a) => {
      const f = store.findFlight(a.flightId);
      return f ? findSeat(buildSeatMap(f.id, f.cabin), a.seat)?.price ?? 0 : 0;
    });
    const reviewBlock = el("div", { className: "sk-block sk-review", dataset: { flashKey: "confirmation" } }, [
      el("div", { className: "sk-total" }, [el("span", { textContent: "Total" }), el("strong", { textContent: fmtMoney(total) })]),
    ]);
    if (booking.confirmation) {
      reviewBlock.append(
        el("div", { className: "sk-confirmed" }, [
          `✓ Booked — ${booking.confirmation.recordLocator}`,
        ]),
      );
    } else {
      reviewBlock.append(el("p", { className: "sk-hint", textContent: "Ask the Copilot to book when you're ready." }));
    }
    tripCol.append(reviewBlock);
  };

  const render = (): void => {
    renderResults();
    renderTrip();
  };

  store.subscribe(render);
  render();

  // --- agent-touch flash ----------------------------------------------------
  const flash = (keys: string[]): void => {
    // Re-render already ran synchronously inside commit(), so nodes exist.
    for (const key of keys) {
      document.querySelectorAll(`[data-flash-key="${CSS.escape(key)}"]`).forEach((node) => {
        node.classList.add("sk-agent-flash");
        window.setTimeout(() => node.classList.remove("sk-agent-flash"), FLASH_MS);
      });
    }
  };

  return { flash };
};
