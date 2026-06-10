// Static product catalog for the WebMCP demo (ported verbatim from the
// embedded-app Switchback demo). The page's `search_products` tool filters this
// list; `add_to_cart` looks products up by SKU. Small and fictional (no real
// trademarks) but varied enough that "blue running shoes", "trail", "jacket", or
// "cheapest" return distinct results.

export interface CatalogProduct {
  sku: string;
  title: string;
  brand: string;
  category: string;
  color: string;
  price: number;
  description: string;
  imageUrl: string;
  imageAlt: string;
}

export const CATALOG: CatalogProduct[] = [
  {
    sku: "SHOE-001",
    title: "Trailblaze Pro",
    brand: "V612",
    category: "running shoes",
    color: "blue",
    price: 129,
    description: "Lightweight daily trainer with a responsive foam midsole.",
    imageUrl: "/switchback-products/shoe-001.jpg",
    imageAlt: "Blue Trailblaze Pro road running shoe",
  },
  {
    sku: "SHOE-002",
    title: "Trailblaze Pro",
    brand: "V612",
    category: "running shoes",
    color: "black",
    price: 129,
    description: "Lightweight daily trainer with a responsive foam midsole.",
    imageUrl: "/switchback-products/shoe-002.jpg",
    imageAlt: "Black Trailblaze Pro road running shoe",
  },
  {
    sku: "SHOE-003",
    title: "Cloudstrider 5",
    brand: "Aether",
    category: "running shoes",
    color: "white",
    price: 149,
    description: "Plush, high-stack cushioning for long easy miles.",
    imageUrl: "/switchback-products/shoe-003.jpg",
    imageAlt: "White Cloudstrider 5 high-cushion road running shoe",
  },
  {
    sku: "SHOE-004",
    title: "Cloudstrider 5",
    brand: "Aether",
    category: "running shoes",
    color: "blue",
    price: 149,
    description: "Plush, high-stack cushioning for long easy miles.",
    imageUrl: "/switchback-products/shoe-004.jpg",
    imageAlt: "Blue Cloudstrider 5 high-cushion road running shoe",
  },
  {
    sku: "SHOE-005",
    title: "Marathon Elite",
    brand: "Aether",
    category: "running shoes",
    color: "red",
    price: 179,
    description: "Carbon-plated racer tuned for tempo and race day.",
    imageUrl: "/switchback-products/shoe-005.jpg",
    imageAlt: "Red Marathon Elite carbon-plated racing shoe",
  },
  {
    sku: "SHOE-006",
    title: "TrailGrip GTX",
    brand: "Summit",
    category: "trail running shoes",
    color: "green",
    price: 159,
    description: "Aggressive lugs and a waterproof membrane for wet trails.",
    imageUrl: "/switchback-products/shoe-006.jpg",
    imageAlt: "Green TrailGrip GTX waterproof trail running shoe",
  },
  {
    sku: "SHOE-007",
    title: "TrailGrip GTX",
    brand: "Summit",
    category: "trail running shoes",
    color: "grey",
    price: 159,
    description: "Aggressive lugs and a waterproof membrane for wet trails.",
    imageUrl: "/switchback-products/shoe-007.jpg",
    imageAlt: "Grey TrailGrip GTX waterproof trail running shoe",
  },
  {
    sku: "JKT-001",
    title: "StormShell Jacket",
    brand: "Summit",
    category: "jacket",
    color: "blue",
    price: 89,
    description: "Packable, wind- and water-resistant running shell.",
    imageUrl: "/switchback-products/jkt-001.jpg",
    imageAlt: "Blue StormShell packable running jacket",
  },
  {
    sku: "JKT-002",
    title: "StormShell Jacket",
    brand: "Summit",
    category: "jacket",
    color: "black",
    price: 89,
    description: "Packable, wind- and water-resistant running shell.",
    imageUrl: "/switchback-products/jkt-002.jpg",
    imageAlt: "Black StormShell packable running jacket",
  },
  {
    sku: "SCK-001",
    title: "RunDry Socks (3-pack)",
    brand: "V612",
    category: "socks",
    color: "white",
    price: 18,
    description: "Moisture-wicking, cushioned crew socks.",
    imageUrl: "/switchback-products/sck-001.jpg",
    imageAlt: "White RunDry cushioned crew running socks three-pack",
  },
  {
    sku: "SHRT-001",
    title: "Tempo Shorts",
    brand: "Aether",
    category: "shorts",
    color: "navy",
    price: 39,
    description: "5-inch lined shorts with a zip pocket.",
    imageUrl: "/switchback-products/shrt-001.jpg",
    imageAlt: "Navy Tempo five-inch lined running shorts",
  },
];

// Promo codes the storefront honors (apply_promo validates against this).
export const PROMOS: Record<string, { rate: number; label: string }> = {
  TRAIL10: { rate: 0.1, label: "10% off — TRAIL10" },
  TRAILVIP: { rate: 0.15, label: "15% off — TRAILVIP" },
  SUMMIT20: { rate: 0.2, label: "20% off — SUMMIT20" },
};

// Named colors → swatch hex for the catalog grid. Curated outdoor-gear tones
// (lake, clay, fern, granite…) rather than stock framework hexes, so the
// swatches sit inside the storefront's pine + blaze palette.
export const COLOR_HEX: Record<string, string> = {
  blue: "#3e6e91", // lake
  black: "#23272a", // charcoal
  white: "#eceae2", // chalk
  red: "#b94a36", // clay
  green: "#4a7c59", // fern
  grey: "#8c9189", // granite
  gray: "#8c9189",
  navy: "#2e4257", // midnight
};

const STOPWORDS = new Set([
  "a", "an", "the", "me", "my", "for", "some", "with", "and", "to", "of",
  "i", "want", "need", "show", "find", "please", "buy", "get",
]);

// Query tokens that describe price intent rather than the product itself —
// dropped before matching so "waterproof trail shoe under $170" still matches on
// "waterproof/trail/shoe" (the agent reasons over the returned prices itself).
const PRICE_WORDS = new Set([
  "under", "below", "over", "above", "cheap", "cheapest", "budget", "than",
  "less", "more", "around", "about", "max", "min", "price", "priced",
]);

/**
 * Filter the catalog by a free-text query. A product matches when every
 * meaningful query token appears somewhere in its searchable text. Results are
 * sorted cheapest-first so "the cheapest blue running shoe" has a deterministic
 * top hit. An empty query returns the whole catalog (cheapest-first).
 */
export function searchCatalog(query: string): CatalogProduct[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (t) =>
        t.length >= 2 &&
        !STOPWORDS.has(t) &&
        !PRICE_WORDS.has(t) &&
        !/^\d+$/.test(t),
    );

  const byPrice = (a: CatalogProduct, b: CatalogProduct): number =>
    a.price - b.price;

  if (tokens.length === 0) {
    return [...CATALOG].sort(byPrice);
  }

  return CATALOG.filter((p) => {
    const haystack =
      `${p.title} ${p.brand} ${p.category} ${p.color} ${p.description}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  }).sort(byPrice);
}

/** Look up a single product by exact SKU (case-insensitive). */
export function findBySku(sku: string): CatalogProduct | undefined {
  const needle = sku.trim().toLowerCase();
  return CATALOG.find((p) => p.sku.toLowerCase() === needle);
}
