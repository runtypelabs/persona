import alasql from "alasql";

export type AnalyticsRow = Record<string, string | number | boolean | null>;

export type AnalyticsQueryResult = {
  columns: string[];
  rows: AnalyticsRow[];
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
};

type CustomerRow = AnalyticsRow & {
  customer_id: string;
  created_date: string;
  created_month: string;
  region: string;
  segment: string;
  acquisition_channel: string;
  company_size: number;
};

type OrderRow = AnalyticsRow & {
  order_id: string;
  customer_id: string;
  order_date: string;
  order_month: string;
  product: string;
  plan_name: string;
  revenue: number;
  discount: number;
  status: string;
  region: string;
  channel: string;
};

type SessionRow = AnalyticsRow & {
  session_id: string;
  customer_id: string;
  session_date: string;
  session_month: string;
  source: string;
  device: string;
  converted: number;
  duration_seconds: number;
};

type SubscriptionSnapshotRow = AnalyticsRow & {
  snapshot_month: string;
  customer_id: string;
  plan_name: string;
  mrr: number;
  status: string;
};

type CampaignRow = AnalyticsRow & {
  campaign_id: string;
  campaign_name: string;
  channel: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  start_date: string;
};

export type AnalyticsDataset = {
  customers: CustomerRow[];
  orders: OrderRow[];
  sessions: SessionRow[];
  subscription_snapshots: SubscriptionSnapshotRow[];
  campaigns: CampaignRow[];
};

export const ANALYTICS_SCHEMA = {
  customers: {
    description: "One row per customer account.",
    columns: {
      customer_id: "STRING primary key",
      created_date: "YYYY-MM-DD",
      created_month: "YYYY-MM",
      region: "North America | Europe | Asia Pacific | Latin America",
      segment: "Startup | SMB | Mid-market | Enterprise",
      acquisition_channel: "Organic | Paid search | Partner | Referral | Events",
      company_size: "employee count",
    },
  },
  orders: {
    description: "One row per completed or refunded product order.",
    columns: {
      order_id: "STRING primary key",
      customer_id: "joins customers.customer_id",
      order_date: "YYYY-MM-DD",
      order_month: "YYYY-MM",
      product: "Analytics | Automations | Data Cloud | AI Copilot",
      plan_name: "Starter | Growth | Scale | Enterprise",
      revenue: "gross order revenue in USD",
      discount: "discount amount in USD",
      status: "completed | refunded",
      region: "copied from the customer at purchase time",
      channel: "acquisition channel at purchase time",
    },
  },
  sessions: {
    description: "Sampled web sessions used for funnel and acquisition analysis.",
    columns: {
      session_id: "STRING primary key",
      customer_id: "nullable-style visitor/customer key; joins customers.customer_id",
      session_date: "YYYY-MM-DD",
      session_month: "YYYY-MM",
      source: "Organic | Paid search | Partner | Referral | Events",
      device: "Desktop | Mobile | Tablet",
      converted: "1 when the session led to an order, otherwise 0",
      duration_seconds: "session duration in seconds",
    },
  },
  subscription_snapshots: {
    description: "Monthly subscription state for every customer since signup.",
    columns: {
      snapshot_month: "YYYY-MM",
      customer_id: "joins customers.customer_id",
      plan_name: "Starter | Growth | Scale | Enterprise",
      mrr: "monthly recurring revenue in USD",
      status: "active | churned",
    },
  },
  campaigns: {
    description: "Marketing campaign delivery and spend facts.",
    columns: {
      campaign_id: "STRING primary key",
      campaign_name: "human-readable campaign name",
      channel: "Paid search | Partner | Referral | Events",
      spend: "campaign spend in USD",
      impressions: "served impressions",
      clicks: "recorded clicks",
      conversions: "attributed conversions",
      start_date: "YYYY-MM-DD",
    },
  },
} as const;

export type AnalyticsStarterScenario = {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  prompt: string;
  description: string;
  sql: string;
  chartType: string;
  encodings: Record<string, string>;
  semanticTypes: Record<string, string>;
};

/**
 * Each starter includes a known-good reference recipe for compilation tests,
 * but the UI submits the natural-language prompt through Atlas so the agent
 * still inspects the warehouse, writes SQL, and builds the Flint artifact.
 */
export const ANALYTICS_STARTER_SCENARIOS: readonly AnalyticsStarterScenario[] = [
  {
    id: "revenue-momentum",
    index: "01",
    eyebrow: "Stacked area",
    title: "Map product revenue momentum",
    prompt:
      "Analyze how product revenue has shifted over the last 18 months. Write and validate the SQL, then create an interactive Flint stacked area chart with month on the x-axis, revenue on the y-axis, and product as the color series. Summarize the most important change in the mix.",
    description:
      "An 18-month view of revenue momentum reveals how each product contributes to the total growth curve.",
    sql:
      "SELECT order_month, product, ROUND(SUM(revenue), 2) AS revenue FROM orders WHERE status = 'completed' GROUP BY order_month, product ORDER BY order_month, product",
    chartType: "Area Chart",
    encodings: { x: "order_month", y: "revenue", color: "product" },
    semanticTypes: { order_month: "YearMonth", product: "Category", revenue: "Revenue" },
  },
  {
    id: "acquisition-quality",
    index: "02",
    eyebrow: "Bubble scatter",
    title: "Compare acquisition quality",
    prompt:
      "Compare acquisition source quality using conversion rate, average session duration, and session volume. Write and validate the SQL, then create an interactive Flint bubble scatter chart with conversion rate on x, engagement on y, source as color, and session volume as bubble size. Call out the strongest efficient channel.",
    description:
      "Conversion rate, engagement, and session volume make channel quality and scale visible in a single view.",
    sql:
      "SELECT source, ROUND(100 * SUM(converted) / COUNT(*), 2) AS conversion_rate, ROUND(AVG(duration_seconds), 2) AS avg_duration_seconds, COUNT(*) AS sessions FROM sessions GROUP BY source ORDER BY source",
    chartType: "Scatter Plot",
    encodings: {
      x: "conversion_rate",
      y: "avg_duration_seconds",
      color: "source",
      size: "sessions",
    },
    semanticTypes: {
      source: "Category",
      conversion_rate: "Percentage",
      avg_duration_seconds: "Duration",
      sessions: "Quantity",
    },
  },
] as const;

const REGIONS = ["North America", "Europe", "Asia Pacific", "Latin America"] as const;
const SEGMENTS = ["Startup", "SMB", "Mid-market", "Enterprise"] as const;
const CHANNELS = ["Organic", "Paid search", "Partner", "Referral", "Events"] as const;
const PRODUCTS = ["Analytics", "Automations", "Data Cloud", "AI Copilot"] as const;
const PLANS = ["Starter", "Growth", "Scale", "Enterprise"] as const;
const DEVICES = ["Desktop", "Mobile", "Tablet"] as const;

const PLAN_MRR: Record<(typeof PLANS)[number], number> = {
  Starter: 79,
  Growth: 249,
  Scale: 699,
  Enterprise: 1850,
};

const mulberry32 = (seed: number): (() => number) => {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)]!;

const weightedPick = <T>(
  items: readonly T[],
  weights: readonly number[],
  random: () => number,
): T => {
  const roll = random() * weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  for (let i = 0; i < items.length; i += 1) {
    cursor += weights[i] ?? 0;
    if (roll <= cursor) return items[i]!;
  }
  return items[items.length - 1]!;
};

const pad = (value: number): string => String(value).padStart(2, "0");

const isoDate = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const isoMonth = (date: Date): string => isoDate(date).slice(0, 7);

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const monthStart = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const addMonths = (date: Date, months: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

const randomDateBetween = (start: Date, end: Date, random: () => number): Date => {
  const span = Math.max(1, end.getTime() - start.getTime());
  return new Date(start.getTime() + Math.floor(random() * span));
};

export function generateAnalyticsDataset(
  now = new Date(),
  seed = 20260714,
): AnalyticsDataset {
  const random = mulberry32(seed);
  const end = addMonths(monthStart(now), 1);
  const start = addMonths(monthStart(now), -17);

  const customers: CustomerRow[] = Array.from({ length: 1200 }, (_, index) => {
    const created = randomDateBetween(start, end, random);
    const segment = weightedPick(SEGMENTS, [28, 38, 23, 11], random);
    const sizeRanges: Record<(typeof SEGMENTS)[number], [number, number]> = {
      Startup: [3, 45],
      SMB: [25, 220],
      "Mid-market": [180, 1500],
      Enterprise: [1200, 12000],
    };
    const [minSize, maxSize] = sizeRanges[segment];
    return {
      customer_id: `cus_${String(index + 1).padStart(5, "0")}`,
      created_date: isoDate(created),
      created_month: isoMonth(created),
      region: weightedPick(REGIONS, [42, 29, 21, 8], random),
      segment,
      acquisition_channel: weightedPick(CHANNELS, [31, 27, 17, 16, 9], random),
      company_size: Math.round(minSize + random() * (maxSize - minSize)),
    };
  });

  const orders: OrderRow[] = Array.from({ length: 11800 }, (_, index) => {
    const customer = pick(customers, random);
    const customerStart = new Date(`${customer.created_date}T00:00:00Z`);
    const orderDate = randomDateBetween(customerStart, end, random);
    const plan = weightedPick(PLANS, [29, 36, 24, 11], random);
    const product = weightedPick(PRODUCTS, [38, 24, 23, 15], random);
    const productFactor: Record<(typeof PRODUCTS)[number], number> = {
      Analytics: 1,
      Automations: 0.82,
      "Data Cloud": 1.35,
      "AI Copilot": 1.18,
    };
    const quantityFactor = 1 + Math.floor(random() * (plan === "Enterprise" ? 5 : 3));
    const gross = PLAN_MRR[plan] * productFactor[product] * quantityFactor;
    const discount = random() < 0.34 ? gross * weightedPick([0.05, 0.1, 0.15], [5, 4, 1], random) : 0;
    return {
      order_id: `ord_${String(index + 1).padStart(6, "0")}`,
      customer_id: customer.customer_id,
      order_date: isoDate(orderDate),
      order_month: isoMonth(orderDate),
      product,
      plan_name: plan,
      revenue: Math.round((gross - discount) * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      status: random() < 0.035 ? "refunded" : "completed",
      region: customer.region,
      channel: customer.acquisition_channel,
    };
  });

  const sessions: SessionRow[] = Array.from({ length: 24600 }, (_, index) => {
    const customer = pick(customers, random);
    const sessionDate = randomDateBetween(start, end, random);
    const source = weightedPick(CHANNELS, [34, 29, 15, 14, 8], random);
    const conversionBoost = source === "Referral" || source === "Partner" ? 0.045 : 0;
    return {
      session_id: `ses_${String(index + 1).padStart(6, "0")}`,
      customer_id: customer.customer_id,
      session_date: isoDate(sessionDate),
      session_month: isoMonth(sessionDate),
      source,
      device: weightedPick(DEVICES, [58, 35, 7], random),
      converted: random() < 0.105 + conversionBoost ? 1 : 0,
      duration_seconds: Math.round(24 + Math.pow(random(), 0.62) * 820),
    };
  });

  const subscription_snapshots: SubscriptionSnapshotRow[] = [];
  for (const customer of customers) {
    const firstMonth = monthStart(new Date(`${customer.created_date}T00:00:00Z`));
    const initialPlan = weightedPick(PLANS, [32, 37, 22, 9], random);
    const churnMonth = random() < 0.16
      ? addMonths(firstMonth, 2 + Math.floor(random() * 12))
      : null;
    for (let month = firstMonth; month <= monthStart(end); month = addMonths(month, 1)) {
      const churned = churnMonth != null && month >= churnMonth;
      subscription_snapshots.push({
        snapshot_month: isoMonth(month),
        customer_id: customer.customer_id,
        plan_name: initialPlan,
        mrr: churned ? 0 : PLAN_MRR[initialPlan],
        status: churned ? "churned" : "active",
      });
    }
  }

  const campaignNames = [
    "Signal over noise",
    "Ship the insight",
    "Data week",
    "Operators series",
    "Modern warehouse",
    "AI analyst launch",
    "Revenue room",
    "Founders in data",
    "Scale without sprawl",
    "Pipeline clarity",
    "Metrics that move",
    "Board-ready analytics",
  ];
  const campaigns: CampaignRow[] = campaignNames.map((campaign_name, index) => {
    const channel = weightedPick(CHANNELS.slice(1), [40, 24, 16, 20], random);
    const spend = Math.round(5500 + random() * 38000);
    const impressions = Math.round(spend * (20 + random() * 54));
    const clicks = Math.round(impressions * (0.018 + random() * 0.055));
    const conversions = Math.round(clicks * (0.045 + random() * 0.13));
    return {
      campaign_id: `cmp_${String(index + 1).padStart(3, "0")}`,
      campaign_name,
      channel,
      spend,
      impressions,
      clicks,
      conversions,
      start_date: isoDate(randomDateBetween(start, end, random)),
    };
  });

  return { customers, orders, sessions, subscription_snapshots, campaigns };
}

const TABLE_DEFINITIONS = [
  "CREATE TABLE customers (customer_id STRING, created_date STRING, created_month STRING, region STRING, segment STRING, acquisition_channel STRING, company_size INT)",
  "CREATE TABLE orders (order_id STRING, customer_id STRING, order_date STRING, order_month STRING, product STRING, plan_name STRING, revenue NUMBER, discount NUMBER, status STRING, region STRING, channel STRING)",
  "CREATE TABLE sessions (session_id STRING, customer_id STRING, session_date STRING, session_month STRING, source STRING, device STRING, converted INT, duration_seconds INT)",
  "CREATE TABLE subscription_snapshots (snapshot_month STRING, customer_id STRING, plan_name STRING, mrr NUMBER, status STRING)",
  "CREATE TABLE campaigns (campaign_id STRING, campaign_name STRING, channel STRING, spend NUMBER, impressions INT, clicks INT, conversions INT, start_date STRING)",
] as const;

const MUTATING_SQL = /\b(insert|update|delete|drop|alter|create|truncate|replace|attach|detach|use|into)\b/i;

export function validateReadOnlySql(sql: string): string {
  const normalized = sql.trim().replace(/;+\s*$/, "");
  if (!/^select\b/i.test(normalized)) {
    throw new Error("Only SELECT queries are allowed in this demo database.");
  }
  if (normalized.includes(";")) {
    throw new Error("Run one SELECT statement at a time.");
  }
  if (MUTATING_SQL.test(normalized)) {
    throw new Error("This database is read-only; mutating SQL is not allowed.");
  }
  return normalized;
}

export class AnalyticsDatabase {
  readonly dataset: AnalyticsDataset;
  readonly rowCount: number;
  readonly latestMonth: string;
  private readonly database: InstanceType<typeof alasql.Database>;

  constructor(now = new Date(), seed = 20260714) {
    this.dataset = generateAnalyticsDataset(now, seed);
    this.database = new alasql.Database();

    for (const definition of TABLE_DEFINITIONS) this.database.exec(definition);
    for (const [table, rows] of Object.entries(this.dataset)) {
      this.database.exec(`INSERT INTO ${table} SELECT * FROM ?`, [rows]);
    }

    this.rowCount = Object.values(this.dataset).reduce((sum, rows) => sum + rows.length, 0);
    this.latestMonth = this.dataset.orders.reduce(
      (latest, order) => order.order_month > latest ? order.order_month : latest,
      "0000-00",
    );
  }

  query(sql: string, limit = 500): AnalyticsQueryResult {
    const safeSql = validateReadOnlySql(sql);
    const started = performance.now();
    const raw = this.database.exec<unknown>(safeSql);
    if (!Array.isArray(raw)) {
      throw new Error("The query did not return a row set.");
    }

    const rows = raw.filter(
      (row): row is AnalyticsRow => typeof row === "object" && row != null && !Array.isArray(row),
    );
    const elapsedMs = Math.max(0, performance.now() - started);
    const limitedRows = rows.slice(0, limit);
    return {
      columns: limitedRows[0] ? Object.keys(limitedRows[0]) : [],
      rows: limitedRows,
      rowCount: rows.length,
      truncated: rows.length > limit,
      elapsedMs: Math.round(elapsedMs * 10) / 10,
    };
  }

  describe(): object {
    return {
      database: "Northstar demo warehouse",
      dialect: "AlaSQL (browser-local, read-only SELECT queries)",
      latestMonth: this.latestMonth,
      totalRows: this.rowCount,
      tables: Object.fromEntries(
        Object.entries(ANALYTICS_SCHEMA).map(([name, schema]) => [
          name,
          {
            ...schema,
            rowCount: this.dataset[name as keyof AnalyticsDataset].length,
            sample: this.dataset[name as keyof AnalyticsDataset].slice(0, 2),
          },
        ]),
      ),
      queryTips: [
        "Use precomputed YYYY-MM fields such as order_month and session_month for time series.",
        "Use ROUND(number, 2), SUM, AVG, COUNT, COUNT(DISTINCT field), GROUP BY, ORDER BY and LIMIT.",
        "Treat refunded orders separately from completed orders when calculating revenue.",
        "subscription_snapshots is a monthly snapshot table; group by snapshot_month before summing MRR.",
      ],
    };
  }
}
