// Static product catalog for the WebMCP demo. The page's `search_products`
// tool filters this list and returns realistic hits the agent can reason over;
// `add_to_cart` looks products up here by SKU. Kept deliberately small and
// fictional (no real trademarks) but varied enough that queries like "blue
// running shoes", "trail", "jacket", or "cheapest" return distinct results.

export interface CatalogProduct {
  sku: string;
  title: string;
  brand: string;
  category: string;
  color: string;
  price: number;
  description: string;
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
  },
  {
    sku: "SHOE-002",
    title: "Trailblaze Pro",
    brand: "V612",
    category: "running shoes",
    color: "black",
    price: 129,
    description: "Lightweight daily trainer with a responsive foam midsole.",
  },
  {
    sku: "SHOE-003",
    title: "Cloudstrider 5",
    brand: "Aether",
    category: "running shoes",
    color: "white",
    price: 149,
    description: "Plush, high-stack cushioning for long easy miles.",
  },
  {
    sku: "SHOE-004",
    title: "Cloudstrider 5",
    brand: "Aether",
    category: "running shoes",
    color: "blue",
    price: 149,
    description: "Plush, high-stack cushioning for long easy miles.",
  },
  {
    sku: "SHOE-005",
    title: "Marathon Elite",
    brand: "Aether",
    category: "running shoes",
    color: "red",
    price: 179,
    description: "Carbon-plated racer tuned for tempo and race day.",
  },
  {
    sku: "SHOE-006",
    title: "TrailGrip GTX",
    brand: "Summit",
    category: "trail running shoes",
    color: "green",
    price: 159,
    description: "Aggressive lugs and a waterproof membrane for wet trails.",
  },
  {
    sku: "SHOE-007",
    title: "TrailGrip GTX",
    brand: "Summit",
    category: "trail running shoes",
    color: "grey",
    price: 159,
    description: "Aggressive lugs and a waterproof membrane for wet trails.",
  },
  {
    sku: "JKT-001",
    title: "StormShell Jacket",
    brand: "Summit",
    category: "jacket",
    color: "blue",
    price: 89,
    description: "Packable, wind- and water-resistant running shell.",
  },
  {
    sku: "JKT-002",
    title: "StormShell Jacket",
    brand: "Summit",
    category: "jacket",
    color: "black",
    price: 89,
    description: "Packable, wind- and water-resistant running shell.",
  },
  {
    sku: "SCK-001",
    title: "RunDry Socks (3-pack)",
    brand: "V612",
    category: "socks",
    color: "white",
    price: 18,
    description: "Moisture-wicking, cushioned crew socks.",
  },
  {
    sku: "SHRT-001",
    title: "Tempo Shorts",
    brand: "Aether",
    category: "shorts",
    color: "navy",
    price: 39,
    description: "5-inch lined shorts with a zip pocket.",
  },
];

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
 * meaningful query token appears somewhere in its searchable text
 * (title/brand/category/color/description). Results are sorted cheapest-first so
 * prompts like "the cheapest blue running shoe" have a deterministic top hit. An
 * empty query returns the whole catalog (cheapest-first).
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
        !/^\d+$/.test(t), // bare numbers (e.g. a "$170" budget) aren't catalog text
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
