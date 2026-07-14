import { describe, expect, it } from "vitest";
import { assembleECharts, type ChartAssemblyInput } from "flint-chart";
import {
  AnalyticsDatabase,
  ANALYTICS_STARTER_SCENARIOS,
  generateAnalyticsDataset,
  validateReadOnlySql,
} from "./analytics-data";

describe("analytics demo data", () => {
  it("generates a deterministic, relational browser dataset", () => {
    const now = new Date("2026-07-14T00:00:00Z");
    const first = generateAnalyticsDataset(now, 42);
    const second = generateAnalyticsDataset(now, 42);

    expect(first.customers).toHaveLength(1200);
    expect(first.orders).toHaveLength(11800);
    expect(first.sessions).toHaveLength(24600);
    expect(first.campaigns).toHaveLength(12);
    expect(first.orders[0]).toEqual(second.orders[0]);
    expect(first.subscription_snapshots.length).toBeGreaterThan(9000);
    expect(new Set(first.customers.map((row) => row.customer_id)).has(first.orders[0]!.customer_id))
      .toBe(true);
  });

  it("executes grouped SELECT queries and reports result metadata", () => {
    const database = new AnalyticsDatabase(new Date("2026-07-14T00:00:00Z"), 42);
    const result = database.query(
      "SELECT product, ROUND(SUM(revenue), 2) AS revenue FROM orders WHERE status = 'completed' GROUP BY product ORDER BY revenue DESC",
    );

    expect(result.rows).toHaveLength(4);
    expect(result.columns).toEqual(["product", "revenue"]);
    expect(result.rowCount).toBe(4);
    expect(result.truncated).toBe(false);
    expect(result.rows.every((row) => Number(row.revenue) > 0)).toBe(true);
    expect(database.latestMonth).toBe("2026-07");
  });

  it("allows one SELECT and rejects mutations or stacked statements", () => {
    expect(validateReadOnlySql(" SELECT * FROM orders; ")).toBe("SELECT * FROM orders");
    expect(() => validateReadOnlySql("DELETE FROM orders")).toThrow(/Only SELECT/);
    expect(() => validateReadOnlySql("SELECT * FROM orders; DROP TABLE orders")).toThrow(
      /one SELECT statement/,
    );
    expect(() => validateReadOnlySql("SELECT * INTO backup FROM orders")).toThrow(/read-only/);
  });

  it("compiles SQL result rows into an ECharts option through Flint", () => {
    const database = new AnalyticsDatabase(new Date("2026-07-14T00:00:00Z"), 42);
    const rows = database.query(
      "SELECT order_month, ROUND(SUM(revenue), 2) AS revenue FROM orders WHERE status = 'completed' GROUP BY order_month ORDER BY order_month",
    ).rows;
    const option = assembleECharts({
      data: { values: rows },
      semantic_types: { order_month: "YearMonth", revenue: "Revenue" },
      chart_spec: {
        chartType: "Line Chart",
        encodings: { x: { field: "order_month" }, y: { field: "revenue" } },
        baseSize: { width: 900, height: 500 },
      },
    } as ChartAssemblyInput) as { series?: unknown[] };

    expect(option.series).toHaveLength(1);
  });

  it("compiles both deterministic starter scenarios into varied Flint charts", () => {
    const database = new AnalyticsDatabase(new Date("2026-07-14T00:00:00Z"), 42);
    const scenarios: ChartAssemblyInput[] = ANALYTICS_STARTER_SCENARIOS.map((scenario) => ({
      data: { values: database.query(scenario.sql).rows },
      semantic_types: scenario.semanticTypes,
      chart_spec: {
        chartType: scenario.chartType,
        encodings: Object.fromEntries(
          Object.entries(scenario.encodings).map(([channel, field]) => [channel, { field }]),
        ),
      },
    })) as ChartAssemblyInput[];

    expect(ANALYTICS_STARTER_SCENARIOS).toHaveLength(2);
    for (const scenario of scenarios) {
      const option = assembleECharts(scenario) as { series?: unknown[] };
      expect(option.series?.length).toBeGreaterThan(0);
    }
    expect(new Set(scenarios.map((scenario) => scenario.chart_spec.chartType)).size).toBe(2);
  });
});
