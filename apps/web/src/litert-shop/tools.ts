// WebMCP tool surface for the storefront copilot — exactly three tools, all
// auto-approved. Every argument is an enum or a number pulled straight from the
// catalog (see the imported CATEGORIES / BRANDS / COLORS / SIZES), so a 2B
// on-device model almost cannot produce an invalid filter. Results are TINY:
// large tool results are the on-device performance killer, so set_filters hands
// back only a match count + the applied filters, and get_top_results caps at 5
// name/price pairs. Current filter state reaches the model via the page's
// contextProvider (shop_context), never via a read call.

import {
  BRANDS,
  CATEGORIES,
  COLORS,
  SIZES,
  SORTS,
  type Category,
} from "./catalog";
import type { FilterUpdate, ShopStore, FilterState } from "./store";

const OWNER = "__litertShopAbort";

declare global {
  interface Window {
    [OWNER]?: AbortController;
  }
}

type ToolDescriptor = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => unknown | Promise<unknown>;
};

type RegisterableModelContext = {
  registerTool: (tool: ToolDescriptor, options?: { signal?: AbortSignal }) => void;
};

const getModelContext = (): RegisterableModelContext | undefined =>
  (document as unknown as { modelContext?: RegisterableModelContext }).modelContext ??
  (navigator as unknown as { modelContext?: RegisterableModelContext }).modelContext;

const toolResult = (data: unknown, summary?: string): unknown => ({
  content: [
    {
      type: "text",
      text: `${summary ? `${summary}\n\n` : ""}${JSON.stringify(data, null, 2)}`,
    },
  ],
  structuredContent: data,
});

// A compact view of the active filters — what the model gets back so it can see
// the merge result without a read call.
function appliedFilters(state: FilterState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (state.category) out.category = state.category;
  if (state.brands.length) out.brands = state.brands;
  if (state.colors.length) out.colors = state.colors;
  if (state.size) out.size = state.size;
  if (state.priceMin != null) out.priceMin = state.priceMin;
  if (state.priceMax != null) out.priceMax = state.priceMax;
  if (state.waterproof != null) out.waterproof = state.waterproof;
  if (state.minRating != null) out.minRating = state.minRating;
  if (state.inStockOnly) out.inStockOnly = true;
  if (state.sort !== "popularity") out.sort = state.sort;
  return out;
}

// Build a typed FilterUpdate from the model's args: only keys the model actually
// sent become part of the update (merge semantics), and an explicit null clears
// that facet in the store.
function toUpdate(args: Record<string, unknown>): FilterUpdate {
  const update: FilterUpdate = {};
  if ("category" in args) update.category = (args.category as Category) ?? null;
  if ("brands" in args) update.brands = Array.isArray(args.brands) ? (args.brands as string[]) : [];
  if ("colors" in args) update.colors = Array.isArray(args.colors) ? (args.colors as string[]) : [];
  if ("size" in args) update.size = (args.size as string) ?? null;
  if ("priceMin" in args) update.priceMin = typeof args.priceMin === "number" ? args.priceMin : null;
  if ("priceMax" in args) update.priceMax = typeof args.priceMax === "number" ? args.priceMax : null;
  if ("waterproof" in args)
    update.waterproof = typeof args.waterproof === "boolean" ? args.waterproof : null;
  if ("minRating" in args)
    update.minRating = typeof args.minRating === "number" ? args.minRating : null;
  if ("inStockOnly" in args)
    update.inStockOnly = typeof args.inStockOnly === "boolean" ? args.inStockOnly : false;
  if ("sort" in args && typeof args.sort === "string") {
    update.sort = SORTS.includes(args.sort as (typeof SORTS)[number])
      ? (args.sort as (typeof SORTS)[number])
      : undefined;
  }
  return update;
}

export function setupShopTools(store: ShopStore): void {
  const modelContext = getModelContext();
  if (!modelContext) {
    console.warn("[Shop] document.modelContext unavailable; tools not registered");
    return;
  }

  window[OWNER]?.abort();
  const controller = new AbortController();
  window[OWNER] = controller;
  const signal = controller.signal;

  // `["string","null"]` unions let the model pass null to clear a single facet
  // while keeping the enum constraint when it sets one.
  const nullableEnum = (values: readonly string[]) => ({
    type: ["string", "null"],
    enum: [...values, null],
  });
  const nullableNumber = { type: ["number", "null"] };
  const nullableBoolean = { type: ["boolean", "null"] };

  const tools: ToolDescriptor[] = [
    {
      name: "set_filters",
      title: "Set store filters",
      description:
        "Set one or more storefront filters in a single call. MERGE semantics: only the facets you include change; everything else stays. Pass null on a facet to clear just that one (or use clear_filters to reset all). The result returns { matchCount, appliedFilters } — matchCount is how many products now match; read it and tell the user.",
      inputSchema: {
        type: "object",
        properties: {
          category: nullableEnum(CATEGORIES),
          brands: { type: "array", items: { type: "string", enum: BRANDS } },
          colors: { type: "array", items: { type: "string", enum: COLORS } },
          size: nullableEnum(SIZES),
          priceMin: nullableNumber,
          priceMax: nullableNumber,
          waterproof: nullableBoolean,
          minRating: { ...nullableNumber, description: "Minimum star rating, 3.0–5.0." },
          inStockOnly: nullableBoolean,
          sort: { type: "string", enum: [...SORTS] },
        },
        additionalProperties: false,
      },
      execute: (args) => {
        store.merge(toUpdate(args), "agent");
        const n = store.matchCount;
        // On zero matches, steer the model's REPLY from inside the tool result
        // (the freshest tokens win with a small model). Asking beats auto-fixing
        // here twice over: E2B reliably narrates a second tool call instead of
        // making it (observed live — "I relaxed the price filter", no call), and
        // silently overriding a budget the user just stated is bad UX anyway.
        const summary =
          n === 0
            ? "0 products match. You changed nothing else. Tell the user no products match these filters, and ASK whether they'd like to raise the price limit or drop one of the filters. Do NOT claim you relaxed or changed anything."
            : `${n} product${n === 1 ? "" : "s"} match.`;
        return toolResult({ matchCount: n, appliedFilters: appliedFilters(store.state) }, summary);
      },
    },
    {
      name: "clear_filters",
      title: "Clear all filters",
      description: "Remove every filter and show the full catalog. Returns { matchCount }.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => {
        store.clear("agent");
        return toolResult({ matchCount: store.matchCount }, "Filters cleared.");
      },
    },
    {
      name: "get_top_results",
      title: "Peek at top matches",
      description:
        "Return AT MOST 5 of the currently matching products as { name, price } only. Call this AFTER filtering, when the user asks what or which specific products match.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => {
        const top = store.apply().slice(0, 5).map((p) => ({ name: p.name, price: p.price }));
        return toolResult({ matchCount: store.matchCount, top });
      },
    },
  ];

  for (const tool of tools) {
    try {
      const descriptor = tool.title
        ? { ...tool, annotations: { title: tool.title, ...tool.annotations } }
        : tool;
      modelContext.registerTool(descriptor, { signal });
    } catch (error) {
      console.warn(`[Shop] Failed to register ${tool.name}`, error);
    }
  }
}
