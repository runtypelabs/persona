// Seeded product catalog for Trail Supply Co. — the single source of truth for
// the storefront demo. Every product is generated DETERMINISTICALLY at module
// load (no Math.random), so the grid, the filter enums, and the model's tool
// schemas all agree run-to-run. The tool layer derives its enums by scanning
// PRODUCTS (see the exported CATEGORIES / BRANDS / COLORS / SIZES below), so the
// on-device model can only ever pick a facet value that actually exists.

export type Category =
  | "boots"
  | "jackets"
  | "tents"
  | "backpacks"
  | "sleeping-bags"
  | "accessories";

export interface Product {
  id: string;
  name: string;
  category: Category;
  brand: string;
  price: number;
  colors: string[];
  sizes: string[];
  waterproof: boolean;
  /** 3.0–5.0, one decimal. */
  rating: number;
  inStock: boolean;
  /** 0–99 deterministic rank; drives the "popularity" sort. */
  popularity: number;
  emoji: string;
}

// Named CSS colors → swatch hex. The card renders a gradient from a product's
// colors so the page is fully self-contained (no image assets).
export const COLOR_HEX: Record<string, string> = {
  black: "#2b2b2b",
  blue: "#2f6db3",
  green: "#3f7d4e",
  red: "#b3402f",
  orange: "#d17a2a",
  gray: "#8a8f96",
  tan: "#c8a97e",
  yellow: "#e0b93a",
};

// ── Generation pools (deterministic; not exported — the public enums below are
// derived from the finished catalog so they can never drift from it) ──────────

const BRAND_POOL = ["Summit", "TrailForge", "Northwind", "Cairn", "Rime", "Basecamp"];
const COLOR_POOL = ["black", "blue", "green", "red", "orange", "gray", "tan", "yellow"];
const SHOE_SIZES = ["7", "8", "9", "10", "11", "12"];
const APPAREL_SIZES = ["XS", "S", "M", "L", "XL"];

interface CategoryDef {
  category: Category;
  emoji: string;
  names: string[];
  priceBase: number;
  priceSpread: number;
  sizePool: string[];
  waterproof: (name: string, g: number) => boolean;
}

const CATEGORY_DEFS: CategoryDef[] = [
  {
    category: "boots",
    emoji: "🥾",
    names: [
      "Ridgeline Hiker",
      "Summit GTX Boot",
      "Trailhead Mid",
      "Alpine Ascent",
      "Canyon Low",
      "Bogtrotter",
      "Scree Scrambler",
      "Timberline Boot",
      "Pathfinder Mid",
      "Frostline Winter Boot",
      "Riverford Wading Boot",
      "Meadow Trail Shoe",
    ],
    priceBase: 70,
    priceSpread: 150,
    sizePool: SHOE_SIZES,
    waterproof: (name, g) => /gtx|frost|bog|river|wading|winter/i.test(name) || g % 3 !== 0,
  },
  {
    category: "jackets",
    emoji: "🧥",
    names: [
      "Stormshell Rain Jacket",
      "Downy Puffer",
      "Windbreak Shell",
      "Insulated Parka",
      "Fleece Pullover",
      "3-Layer Hardshell",
      "Packable Windbreaker",
      "Alpine Down Jacket",
      "Rainguard Anorak",
      "Thermal Vest",
    ],
    priceBase: 60,
    priceSpread: 240,
    sizePool: APPAREL_SIZES,
    waterproof: (name) => /rain|storm|shell|hardshell|guard|windbreak/i.test(name),
  },
  {
    category: "tents",
    emoji: "⛺",
    names: [
      "Backcountry 2P",
      "Basecamp 4P",
      "Ultralight Solo",
      "Family Dome 6P",
      "Ridge Tarp",
      "Stormdome 3P",
      "Trailhead Bivy",
      "Meadow 2P",
      "Expedition 4P",
      "Canopy Shelter",
    ],
    priceBase: 90,
    priceSpread: 320,
    sizePool: [],
    waterproof: (name, g) => /storm|dome|expedition|backcountry|bivy|canopy/i.test(name) || g % 4 !== 0,
  },
  {
    category: "backpacks",
    emoji: "🎒",
    names: [
      "Daypack 20L",
      "Trailhead 40L",
      "Expedition 65L",
      "Summit 55L",
      "Hydration Vest",
      "Overnight 45L",
      "Alpine 50L",
      "Scout 30L",
      "Portage 70L",
      "City Trail 25L",
    ],
    priceBase: 40,
    priceSpread: 200,
    sizePool: [],
    waterproof: (name, g) => /portage|expedition|hydration/i.test(name) || g % 3 === 0,
  },
  {
    category: "sleeping-bags",
    emoji: "🛌",
    names: [
      "Frostline -10 Bag",
      "Summer Quilt",
      "Mummy 20°",
      "Down Nest 0°",
      "Ultralight Quilt",
      "Base Camp Rectangular",
      "Alpine 15° Bag",
      "Kids Cocoon",
    ],
    priceBase: 55,
    priceSpread: 245,
    sizePool: ["regular", "long"],
    waterproof: (_name, g) => g % 4 === 0,
  },
  {
    category: "accessories",
    emoji: "🧰",
    names: [
      "Trekking Poles",
      "Headlamp 400",
      "Merino Wool Socks",
      "Insulated Bottle",
      "Camp Stove",
      "Dry Bag 10L",
      "Trail Gaiters",
      "Packable Sun Hat",
      "Carabiner Set",
      "Baseplate Compass",
    ],
    priceBase: 15,
    priceSpread: 85,
    sizePool: [],
    waterproof: (name) => /dry|gaiter|bottle|hat/i.test(name),
  },
];

const ACCESSORY_EMOJI: Record<string, string> = {
  "Trekking Poles": "🥢",
  "Headlamp 400": "🔦",
  "Merino Wool Socks": "🧦",
  "Insulated Bottle": "🍶",
  "Camp Stove": "🔥",
  "Dry Bag 10L": "🛍️",
  "Trail Gaiters": "🦵",
  "Packable Sun Hat": "🧢",
  "Carabiner Set": "🔗",
  "Baseplate Compass": "🧭",
};

const roundTo5 = (n: number): number => Math.round(n / 5) * 5;

function buildCatalog(): Product[] {
  const products: Product[] = [];
  let g = 0; // global deterministic counter across all categories
  for (const def of CATEGORY_DEFS) {
    def.names.forEach((name, i) => {
      const brand = BRAND_POOL[(g * 3 + 1) % BRAND_POOL.length];
      const colorCount = 1 + (g % 3);
      const start = (g * 5 + 2) % COLOR_POOL.length;
      const colors: string[] = [];
      for (let c = 0; c < colorCount; c++) {
        colors.push(COLOR_POOL[(start + c) % COLOR_POOL.length]);
      }
      const price = roundTo5(def.priceBase + ((g * 17) % (def.priceSpread + 1)));
      const rating = Math.round((3.0 + ((g * 7) % 21) / 10) * 10) / 10;
      const inStock = g % 7 !== 0;
      const popularity = (g * 13) % 100;
      let sizes: string[] = [];
      if (def.sizePool.length > 0) {
        const window = 3 + (g % 2);
        const sStart = def.sizePool.length > window ? g % (def.sizePool.length - window + 1) : 0;
        sizes = def.sizePool.slice(sStart, sStart + window);
      }
      products.push({
        id: `${def.category}-${i + 1}`,
        name,
        category: def.category,
        brand,
        price,
        colors: [...new Set(colors)],
        sizes,
        waterproof: def.waterproof(name, g),
        rating,
        inStock,
        popularity,
        emoji: def.category === "accessories" ? (ACCESSORY_EMOJI[name] ?? def.emoji) : def.emoji,
      });
      g++;
    });
  }
  return products;
}

export const PRODUCTS: Product[] = buildCatalog();

// ── Public enums, DERIVED from the finished catalog ───────────────────────────
// These feed both the filter UI and the WebMCP tool schemas, so the model's
// choices are guaranteed to correspond to real products.

const CATEGORY_ORDER: Category[] = [
  "boots",
  "jackets",
  "tents",
  "backpacks",
  "sleeping-bags",
  "accessories",
];

export const CATEGORIES: Category[] = CATEGORY_ORDER.filter((c) =>
  PRODUCTS.some((p) => p.category === c),
);

export const BRANDS: string[] = [...new Set(PRODUCTS.map((p) => p.brand))].sort();

export const COLORS: string[] = [...new Set(PRODUCTS.flatMap((p) => p.colors))].sort();

const SIZE_RANK = (s: string): number => {
  const apparel = APPAREL_SIZES.indexOf(s);
  if (apparel >= 0) return 100 + apparel;
  const num = Number(s);
  if (!Number.isNaN(num)) return num;
  return 200 + s.charCodeAt(0); // "regular" / "long"
};

export const SIZES: string[] = [...new Set(PRODUCTS.flatMap((p) => p.sizes))].sort(
  (a, b) => SIZE_RANK(a) - SIZE_RANK(b),
);

export const SORTS = ["popularity", "price-asc", "price-desc", "rating"] as const;
export type SortId = (typeof SORTS)[number];

/** CSS gradient for a product's color swatch, self-contained (no images). */
export function swatchGradient(colors: string[]): string {
  const hexes = colors.map((c) => COLOR_HEX[c] ?? "#9ca3af");
  if (hexes.length === 1) return `linear-gradient(135deg, ${hexes[0]}, ${hexes[0]})`;
  return `linear-gradient(135deg, ${hexes.join(", ")})`;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  boots: "Boots",
  jackets: "Jackets",
  tents: "Tents",
  backpacks: "Backpacks",
  "sleeping-bags": "Sleeping bags",
  accessories: "Accessories",
};

export const SORT_LABEL: Record<SortId, string> = {
  popularity: "Most popular",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  rating: "Highest rated",
};
