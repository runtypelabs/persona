// Filter state for the storefront — the single source of truth shared by the
// human (chip × dismissals) and the on-device copilot (WebMCP tools). Updates
// merge: only the facets present in an update change. Every mutation notifies
// subscribers so the chip row + product grid re-render, and remembers WHO set
// each facet group so the copilot's edits can render with an accent.

import {
  PRODUCTS,
  type Category,
  type Product,
  type SortId,
} from "./catalog";

export type FilterSource = "user" | "agent";

/** Which facet groups exist; used as provenance keys for chip accenting. */
export type FacetKey =
  | "category"
  | "brands"
  | "colors"
  | "size"
  | "price"
  | "waterproof"
  | "minRating"
  | "inStockOnly"
  | "sort";

export interface FilterState {
  category: Category | null;
  brands: string[];
  colors: string[];
  size: string | null;
  priceMin: number | null;
  priceMax: number | null;
  waterproof: boolean | null;
  minRating: number | null;
  inStockOnly: boolean;
  sort: SortId;
}

/** A partial update. `null` on a scalar facet clears it; `[]` clears an array. */
export type FilterUpdate = Partial<FilterState>;

const emptyState = (): FilterState => ({
  category: null,
  brands: [],
  colors: [],
  size: null,
  priceMin: null,
  priceMax: null,
  waterproof: null,
  minRating: null,
  inStockOnly: false,
  sort: "popularity",
});

export class ShopStore {
  state: FilterState = emptyState();

  /** Facet group → who last set it, for chip accenting. */
  private provenance = new Map<FacetKey, FilterSource>();
  private listeners = new Set<(store: ShopStore) => void>();

  subscribe(listener: (store: ShopStore) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sourceOf(key: FacetKey): FilterSource | undefined {
    return this.provenance.get(key);
  }

  /**
   * Merge an update. Only keys PRESENT in `update` change; a scalar set to null
   * clears that facet. Records provenance per touched group so agent edits can
   * be styled distinctly.
   */
  merge(update: FilterUpdate, source: FilterSource): void {
    const touched = (key: FacetKey): void => {
      this.provenance.set(key, source);
    };

    if ("category" in update) {
      this.state.category = update.category ?? null;
      this.mark("category", this.state.category !== null, touched);
    }
    if ("brands" in update) {
      this.state.brands = [...new Set(update.brands ?? [])];
      this.mark("brands", this.state.brands.length > 0, touched);
    }
    if ("colors" in update) {
      this.state.colors = [...new Set(update.colors ?? [])];
      this.mark("colors", this.state.colors.length > 0, touched);
    }
    if ("size" in update) {
      this.state.size = update.size ?? null;
      this.mark("size", this.state.size !== null, touched);
    }
    if ("priceMin" in update) {
      this.state.priceMin = update.priceMin ?? null;
      this.mark("price", this.state.priceMin !== null || this.state.priceMax !== null, touched);
    }
    if ("priceMax" in update) {
      this.state.priceMax = update.priceMax ?? null;
      this.mark("price", this.state.priceMin !== null || this.state.priceMax !== null, touched);
    }
    if ("waterproof" in update) {
      this.state.waterproof = update.waterproof ?? null;
      this.mark("waterproof", this.state.waterproof !== null, touched);
    }
    if ("minRating" in update) {
      this.state.minRating = update.minRating ?? null;
      this.mark("minRating", this.state.minRating !== null, touched);
    }
    if ("inStockOnly" in update) {
      this.state.inStockOnly = update.inStockOnly ?? false;
      this.mark("inStockOnly", this.state.inStockOnly, touched);
    }
    if ("sort" in update && update.sort) {
      this.state.sort = update.sort;
      this.mark("sort", this.state.sort !== "popularity", touched);
    }

    this.notify();
  }

  /** Clear every facet back to defaults. */
  clear(_source: FilterSource): void {
    this.state = emptyState();
    this.provenance.clear();
    this.notify();
  }

  /** Dismiss a single facet group (chip ×). For arrays, pass `value`. */
  dismiss(key: FacetKey, value?: string): void {
    switch (key) {
      case "category":
        this.state.category = null;
        break;
      case "brands":
        this.state.brands = value ? this.state.brands.filter((b) => b !== value) : [];
        break;
      case "colors":
        this.state.colors = value ? this.state.colors.filter((c) => c !== value) : [];
        break;
      case "size":
        this.state.size = null;
        break;
      case "price":
        this.state.priceMin = null;
        this.state.priceMax = null;
        break;
      case "waterproof":
        this.state.waterproof = null;
        break;
      case "minRating":
        this.state.minRating = null;
        break;
      case "inStockOnly":
        this.state.inStockOnly = false;
        break;
      case "sort":
        this.state.sort = "popularity";
        break;
    }
    // A human touched it; drop the accent unless the group still has a value.
    this.provenance.delete(key);
    this.notify();
  }

  /** Products matching the current filters, sorted. */
  apply(): Product[] {
    const s = this.state;
    const matched = PRODUCTS.filter((p) => {
      if (s.category && p.category !== s.category) return false;
      if (s.brands.length > 0 && !s.brands.includes(p.brand)) return false;
      if (s.colors.length > 0 && !s.colors.some((c) => p.colors.includes(c))) return false;
      if (s.size && !p.sizes.includes(s.size)) return false;
      if (s.priceMin != null && p.price < s.priceMin) return false;
      if (s.priceMax != null && p.price > s.priceMax) return false;
      if (s.waterproof != null && p.waterproof !== s.waterproof) return false;
      if (s.minRating != null && p.rating < s.minRating) return false;
      if (s.inStockOnly && !p.inStock) return false;
      return true;
    });
    return sortProducts(matched, s.sort);
  }

  get matchCount(): number {
    return this.apply().length;
  }

  private mark(key: FacetKey, active: boolean, touched: (key: FacetKey) => void): void {
    if (active) touched(key);
    else this.provenance.delete(key);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this));
  }
}

function sortProducts(products: Product[], sort: SortId): Product[] {
  const out = [...products];
  switch (sort) {
    case "price-asc":
      out.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      out.sort((a, b) => b.price - a.price);
      break;
    case "rating":
      out.sort((a, b) => b.rating - a.rating || b.popularity - a.popularity);
      break;
    case "popularity":
    default:
      out.sort((a, b) => b.popularity - a.popularity);
      break;
  }
  return out;
}
