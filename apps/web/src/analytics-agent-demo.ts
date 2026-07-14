import "@runtypelabs/persona/widget.css";

import {
  DEFAULT_WIDGET_CONFIG,
  componentRegistry,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
  type AgentWidgetConfig,
  type AgentWidgetInitHandle,
  type ComponentRenderer,
} from "@runtypelabs/persona";
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";
import type { ChartAssemblyInput } from "flint-chart";
import type { EChartsOption } from "echarts";
import {
  ANALYTICS_SCHEMA,
  AnalyticsDatabase,
  type AnalyticsQueryResult,
  type AnalyticsRow,
} from "./analytics-data";

interface RegisterableModelContext {
  registerTool(
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema?: object;
      annotations?: Record<string, unknown>;
      execute: (args: Record<string, unknown>) => unknown;
    },
    options?: { signal?: AbortSignal },
  ): void;
}

type FlintEncoding = string | { field: string };

type FlintArtifactProps = {
  title: string;
  description: string;
  sql: string;
  rowCount: number;
  elapsedMs: number;
  input: ChartAssemblyInput;
};

const FLINT_COMPONENT = "NorthstarFlintChart";
const database = new AnalyticsDatabase();
let widget: AgentWidgetInitHandle | null = null;

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const apiUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-analytics`
  : `http://localhost:${proxyPort}/api/chat/dispatch-analytics`;

const compactNumber = (value: number): string => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
};

const money = (value: number, compact = false): string =>
  compact
    ? `$${compactNumber(value)}`
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);

const readNumber = (row: AnalyticsRow | undefined, key: string): number => {
  const value = row?.[key];
  return typeof value === "number" ? value : Number(value ?? 0);
};

const createTextElement = (
  tag: keyof HTMLElementTagNameMap,
  className: string,
  text: string,
): HTMLElement => {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
};

const renderDataTable = (rows: AnalyticsRow[]): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = "northstar-artifact-panel";
  wrap.dataset.panel = "data";

  const table = document.createElement("table");
  table.className = "northstar-data-table";
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of columns) {
    headRow.appendChild(createTextElement("th", "", column));
  }
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  for (const row of rows.slice(0, 100)) {
    const tr = document.createElement("tr");
    for (const column of columns) {
      const value = row[column];
      tr.appendChild(createTextElement("td", "", value == null ? "—" : String(value)));
    }
    tbody.appendChild(tr);
  }
  table.append(thead, tbody);
  wrap.appendChild(table);
  return wrap;
};

const FlintChartRenderer: ComponentRenderer = (rawProps) => {
  const props = rawProps as FlintArtifactProps;
  const root = document.createElement("section");
  root.className = "northstar-artifact";

  const hero = document.createElement("header");
  hero.className = "northstar-artifact-hero";
  const heroCopy = document.createElement("div");
  heroCopy.append(
    createTextElement("div", "northstar-artifact-kicker", "Generated analysis"),
    createTextElement("h2", "", props.title),
    createTextElement("p", "northstar-artifact-description", props.description),
  );
  const badges = document.createElement("div");
  badges.className = "northstar-artifact-badges";
  const flintBadge = createTextElement("span", "northstar-artifact-badge", "Compiled with ");
  const flintName = createTextElement("strong", "", "Flint");
  flintBadge.appendChild(flintName);
  badges.append(
    flintBadge,
    createTextElement("span", "northstar-artifact-badge", `${props.rowCount} rows`),
  );
  hero.append(heroCopy, badges);

  const shell = document.createElement("div");
  shell.className = "northstar-chart-shell";
  const toolbar = document.createElement("div");
  toolbar.className = "northstar-chart-toolbar";
  const tabs = document.createElement("div");
  tabs.className = "northstar-chart-tabs";
  const tabDefinitions = [
    ["chart", "Chart"],
    ["data", "Data"],
    ["sql", "SQL"],
  ] as const;
  for (const [id, label] of tabDefinitions) {
    const button = createTextElement("button", `northstar-chart-tab${id === "chart" ? " active" : ""}`, label) as HTMLButtonElement;
    button.type = "button";
    button.dataset.tab = id;
    tabs.appendChild(button);
  }
  const queryMeta = document.createElement("div");
  queryMeta.className = "northstar-query-meta";
  queryMeta.appendChild(createTextElement("span", "", `Browser SQL · ${props.elapsedMs.toFixed(1)} ms`));
  toolbar.append(tabs, queryMeta);

  const chartView = document.createElement("div");
  chartView.className = "northstar-chart-view";
  chartView.dataset.panel = "chart";
  const chartCanvas = document.createElement("div");
  chartCanvas.className = "northstar-chart-canvas";
  const loading = createTextElement("div", "northstar-chart-loading", "Compiling the Flint chart…");
  chartView.append(chartCanvas, loading);

  const rows = (props.input.data as { values?: AnalyticsRow[] }).values ?? [];
  const dataPanel = renderDataTable(rows);
  const sqlPanel = document.createElement("div");
  sqlPanel.className = "northstar-artifact-panel";
  sqlPanel.dataset.panel = "sql";
  const sql = createTextElement("pre", "northstar-sql", props.sql);
  sqlPanel.appendChild(sql);

  shell.append(toolbar, chartView, dataPanel, sqlPanel);
  root.append(hero, shell);

  tabs.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-tab]");
    if (!button) return;
    const selected = button.dataset.tab;
    tabs.querySelectorAll<HTMLElement>("[data-tab]").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === selected);
    });
    shell.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => {
      if (panel.dataset.panel === "chart") {
        panel.classList.toggle("hidden", selected !== "chart");
      } else {
        panel.classList.toggle("active", panel.dataset.panel === selected);
      }
    });
  });

  window.setTimeout(async () => {
    try {
      const [{ assembleECharts }, echarts] = await Promise.all([
        import("flint-chart"),
        import("echarts"),
      ]);
      const option = assembleECharts(props.input) as EChartsOption;
      option.backgroundColor = "transparent";
      option.animationDuration = 620;
      option.color = ["#6d5dfc", "#0c956b", "#e49a2d", "#3686e9", "#cd5f91", "#52a9a3"];
      const chart = echarts.init(chartCanvas, undefined, { renderer: "canvas" });
      chart.setOption(option, true);
      loading.remove();

      const resizeObserver = new ResizeObserver(() => chart.resize());
      resizeObserver.observe(chartCanvas);
      const connectionObserver = new MutationObserver(() => {
        if (root.isConnected) return;
        resizeObserver.disconnect();
        connectionObserver.disconnect();
        chart.dispose();
      });
      connectionObserver.observe(document.body, { childList: true, subtree: true });
    } catch (error) {
      loading.className = "northstar-artifact-error";
      loading.textContent = `Flint could not compile this chart: ${error instanceof Error ? error.message : String(error)}`;
    }
  }, 0);

  return root;
};

componentRegistry.register(FLINT_COMPONENT, FlintChartRenderer);

const renderArtifactCard: NonNullable<
  NonNullable<NonNullable<AgentWidgetConfig["features"]>["artifacts"]>["renderCard"]
> = ({ artifact }) => {
  const card = document.createElement("div");
  card.className = "northstar-artifact-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("data-open-artifact", artifact.artifactId);
  card.setAttribute("aria-label", `Open ${artifact.title}`);
  card.append(
    createTextElement("div", "northstar-artifact-card-icon", "✦"),
  );
  const copy = document.createElement("div");
  copy.className = "northstar-artifact-card-copy";
  copy.append(
    createTextElement("strong", "", artifact.title || "Generated analysis"),
    createTextElement("span", "", "Interactive Flint chart · Open full screen"),
  );
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  arrow.setAttribute("viewBox", "0 0 20 20");
  arrow.innerHTML = '<path d="m7 4 6 6-6 6"/>';
  card.append(copy, arrow);
  return card;
};

const normalizeEncodings = (value: unknown): Record<string, { field: string }> => {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error("encodings must be an object mapping channels to fields.");
  }
  const normalized: Record<string, { field: string }> = {};
  for (const [channel, rawEncoding] of Object.entries(value)) {
    const encoding = rawEncoding as FlintEncoding;
    const field = typeof encoding === "string" ? encoding : encoding?.field;
    if (typeof field !== "string" || !field.trim()) {
      throw new Error(`Encoding "${channel}" needs a field name.`);
    }
    normalized[channel] = { field: field.trim() };
  }
  return normalized;
};

const normalizeSemanticTypes = (value: unknown): Record<string, string> => {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error("semanticTypes must be an object mapping fields to Flint semantic types.");
  }
  return Object.fromEntries(
    Object.entries(value).map(([field, type]) => {
      if (typeof type !== "string" || !type.trim()) {
        throw new Error(`Semantic type for "${field}" must be a string.`);
      }
      return [field, type.trim()];
    }),
  );
};

const registerAnalyticsTools = (): AbortController => {
  initializeWebMCPPolyfill();
  const modelContext = (
    document as Document & { modelContext?: RegisterableModelContext }
  ).modelContext;
  if (!modelContext) throw new Error("WebMCP modelContext is unavailable.");

  const controller = new AbortController();
  const options = { signal: controller.signal };

  modelContext.registerTool(
    {
      name: "describe_analytics_data",
      title: "Inspect the analytics warehouse",
      description:
        "Return the browser-local analytics database schema, table sizes, sample rows, and SQL tips. Call this before the first query when the required columns are not already obvious.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => database.describe(),
    },
    options,
  );

  modelContext.registerTool(
    {
      name: "run_analytics_sql",
      title: "Query the browser-local warehouse",
      description:
        "Run one read-only SELECT query against the Northstar analytics database in the browser. Returns up to 500 result rows, column names, total row count, truncation status, and elapsed milliseconds.",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "A single read-only SELECT query." },
        },
        required: ["sql"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: ({ sql }) => {
        if (typeof sql !== "string") throw new Error("sql is required.");
        return database.query(sql);
      },
    },
    options,
  );

  modelContext.registerTool(
    {
      name: "create_flint_chart",
      title: "Create an interactive Flint chart",
      description:
        "Run a read-only SQL query, compile the result through Microsoft's Flint visualization language, and open it as a full-screen Persona component artifact. Use after validating the SQL with run_analytics_sql.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Concise chart title." },
          description: { type: "string", description: "One-sentence analytical takeaway." },
          sql: { type: "string", description: "SELECT query returning chart-ready rows." },
          chartType: {
            type: "string",
            description:
              "A Flint chart type such as Line Chart, Area Chart, Bar Chart, Grouped Bar Chart, Scatter Plot, Donut Chart, or Heatmap.",
          },
          encodings: {
            type: "object",
            description:
              "Map Flint channels to result fields, e.g. {\"x\":\"order_month\",\"y\":\"revenue\",\"color\":\"product\"}.",
            additionalProperties: {
              anyOf: [
                { type: "string" },
                { type: "object", properties: { field: { type: "string" } }, required: ["field"] },
              ],
            },
          },
          semanticTypes: {
            type: "object",
            description:
              "Map every encoded field to a Flint semantic type, e.g. {\"order_month\":\"YearMonth\",\"revenue\":\"Revenue\",\"product\":\"Category\"}.",
            additionalProperties: { type: "string" },
          },
        },
        required: ["title", "description", "sql", "chartType", "encodings", "semanticTypes"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async ({ title, description, sql, chartType, encodings, semanticTypes }) => {
        if (
          typeof title !== "string" ||
          typeof description !== "string" ||
          typeof sql !== "string" ||
          typeof chartType !== "string"
        ) {
          throw new Error("title, description, sql, and chartType are required strings.");
        }

        const result = database.query(sql, 1000);
        if (result.rows.length === 0) throw new Error("The query returned no rows to chart.");
        const input = {
          data: { values: result.rows },
          semantic_types: normalizeSemanticTypes(semanticTypes),
          chart_spec: {
            chartType,
            encodings: normalizeEncodings(encodings),
            baseSize: { width: 980, height: 520 },
          },
        } as ChartAssemblyInput;

        // Compile before opening the artifact so invalid chart specs return a
        // useful tool error to the agent rather than a blank artifact surface.
        const { assembleECharts } = await import("flint-chart");
        assembleECharts(input);
        if (!widget) throw new Error("The Persona analytics agent is not ready yet.");

        const id = `flint-${Date.now()}`;
        widget.upsertArtifact({
          id,
          artifactType: "component",
          title: title.trim(),
          component: FLINT_COMPONENT,
          props: {
            title: title.trim(),
            description: description.trim(),
            sql: sql.trim(),
            rowCount: result.rowCount,
            elapsedMs: result.elapsedMs,
            input,
          },
        });
        widget.showArtifacts();
        return {
          created: true,
          artifactId: id,
          title: title.trim(),
          chartType,
          plottedRows: result.rows.length,
          message: "The interactive Flint chart is open in the full-screen artifact workspace.",
        };
      },
    },
    options,
  );

  return controller;
};

const analyticsTheme: NonNullable<AgentWidgetConfig["theme"]> = {
  palette: {
    colors: {
      primary: {
        50: "#f5f3ff",
        100: "#ece9ff",
        200: "#d8d2ff",
        300: "#b8adff",
        400: "#9182ff",
        500: "#6d5dfc",
        600: "#5a49eb",
        700: "#4939cc",
        800: "#3d32a5",
        900: "#342d83",
        950: "#211c4c",
      },
      gray: {
        50: "#f8faf9",
        100: "#f0f3f1",
        200: "#e4e9e6",
        300: "#ccd4cf",
        400: "#96a29b",
        500: "#6f7c75",
        600: "#56635d",
        700: "#404b46",
        800: "#29332f",
        900: "#18211d",
        950: "#101713",
      },
    },
    radius: { sm: "6px", md: "8px", lg: "12px", xl: "16px", "2xl": "18px" },
    typography: {
      fontFamily: {
        sans: "Inter, 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        mono: "'SFMono-Regular', Consolas, monospace",
      },
    },
  },
  semantic: {
    colors: {
      accent: "#6d5dfc",
      surface: "#ffffff",
      background: "#f8faf9",
      container: "#f0f3f1",
      text: "#17211e",
      textMuted: "#718079",
      border: "#e1e6e3",
      divider: "#edf0ee",
    },
  },
  components: {
    button: { primary: { background: "#6d5dfc", foreground: "#ffffff" } },
    panel: {
      border: "1px solid #e1e6e3",
      borderRadius: "16px",
      shadow: "0 28px 80px rgba(29, 38, 34, .18)",
    },
    message: {
      user: { background: "#ece9ff", text: "#30256f", borderRadius: "13px" },
      assistant: { background: "#ffffff", text: "#17211e", borderRadius: "13px" },
    },
    input: { background: "#ffffff" },
    artifact: {
      pane: { background: "#f8faf9" },
    },
  },
};

const renderDashboard = (): void => {
  const monthly = database.query(
    "SELECT order_month, ROUND(SUM(revenue), 2) AS revenue FROM orders WHERE status = 'completed' GROUP BY order_month ORDER BY order_month",
  ).rows.slice(-12);
  const firstMonth = String(monthly[0]?.order_month ?? "0000-00");
  const revenue = database.query(
    `SELECT ROUND(SUM(revenue), 2) AS revenue FROM orders WHERE status = 'completed' AND order_month >= '${firstMonth}'`,
  );
  const activeCustomers = database.query(
    `SELECT COUNT(*) AS customers, ROUND(SUM(mrr), 2) AS mrr FROM subscription_snapshots WHERE snapshot_month = '${database.latestMonth}' AND status = 'active'`,
  );
  const conversion = database.query(
    `SELECT ROUND(100 * SUM(converted) / COUNT(*), 2) AS rate FROM sessions WHERE session_month >= '${firstMonth}'`,
  );

  const revenueValue = readNumber(revenue.rows[0], "revenue");
  const customerValue = readNumber(activeCustomers.rows[0], "customers");
  const mrrValue = readNumber(activeCustomers.rows[0], "mrr");
  const conversionValue = readNumber(conversion.rows[0], "rate");
  document.getElementById("metric-revenue")!.textContent = money(revenueValue, true);
  document.getElementById("metric-customers")!.textContent = customerValue.toLocaleString();
  document.getElementById("metric-mrr")!.textContent = money(mrrValue, true);
  document.getElementById("metric-conversion")!.textContent = `${conversionValue.toFixed(1)}%`;
  document.getElementById("chart-revenue-total")!.textContent = money(revenueValue, true);
  document.getElementById("database-status")!.textContent = `5 tables · ${compactNumber(database.rowCount)} rows · browser-local`;

  const values = monthly.map((row) => readNumber(row, "revenue"));
  const max = Math.max(...values, 1) * 1.1;
  const width = 840;
  const height = 208;
  const left = 42;
  const top = 20;
  const points = values.map((value, index) => ({
    x: left + index * (width / Math.max(1, values.length - 1)),
    y: top + height - (value / max) * height,
  }));
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const previous = points.map((point, index) => {
    const factor = 1.12 + Math.sin(index * 1.4) * .07;
    const y = top + height - ((values[index] ?? 0) / factor / max) * height;
    return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  document.getElementById("revenue-current-line")!.setAttribute("d", line);
  document.getElementById("revenue-previous-line")!.setAttribute("d", previous);
  document.getElementById("revenue-area-path")!.setAttribute(
    "d",
    `${line} L${points[points.length - 1]?.x ?? left} ${top + height} L${left} ${top + height} Z`,
  );
  const pointsGroup = document.getElementById("revenue-points")!;
  for (const point of points) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(point.x));
    circle.setAttribute("cy", String(point.y));
    circle.setAttribute("r", "3.2");
    pointsGroup.appendChild(circle);
  }
  const labels = document.getElementById("revenue-month-labels")!;
  for (const row of monthly.filter((_, index) => index % 2 === 0 || index === monthly.length - 1)) {
    const date = new Date(`${String(row.order_month)}-01T00:00:00Z`);
    labels.appendChild(createTextElement("span", "", date.toLocaleDateString("en-US", { month: "short" })));
  }

  const productMix = database.query(
    `SELECT product, ROUND(SUM(revenue), 2) AS revenue FROM orders WHERE status = 'completed' AND order_month >= '${firstMonth}' GROUP BY product ORDER BY revenue DESC`,
  ).rows;
  const mixTotal = productMix.reduce((sum, row) => sum + readNumber(row, "revenue"), 0);
  const mixColors = ["#6d5dfc", "#39a983", "#f0a841", "#69a7ef"];
  const mixList = document.getElementById("product-mix-list")!;
  productMix.forEach((row, index) => {
    const lineItem = document.createElement("div");
    lineItem.className = "mix-row";
    const swatch = document.createElement("span");
    swatch.className = "mix-swatch";
    swatch.style.background = mixColors[index] ?? "#98a19d";
    lineItem.append(
      swatch,
      createTextElement("span", "", String(row.product)),
      createTextElement("strong", "", `${Math.round(readNumber(row, "revenue") / mixTotal * 100)}%`),
    );
    mixList.appendChild(lineItem);
  });

  const sessionRows = database.query(
    `SELECT source, COUNT(*) AS sessions, ROUND(100 * SUM(converted) / COUNT(*), 2) AS conversion FROM sessions WHERE session_month >= '${firstMonth}' GROUP BY source ORDER BY sessions DESC`,
  ).rows;
  const revenueRows = database.query(
    `SELECT channel, ROUND(SUM(revenue), 2) AS revenue FROM orders WHERE status = 'completed' AND order_month >= '${firstMonth}' GROUP BY channel`,
  ).rows;
  const revenueByChannel = new Map(revenueRows.map((row) => [String(row.channel), readNumber(row, "revenue")]));
  const channelBody = document.getElementById("channel-table-body")!;
  const channelClass: Record<string, string> = {
    Organic: "organic",
    "Paid search": "paid",
    Partner: "partner",
    Referral: "referral",
    Events: "events",
  };
  sessionRows.forEach((row, rowIndex) => {
    const channel = String(row.source);
    const tr = document.createElement("tr");
    const nameCell = document.createElement("td");
    const nameWrap = document.createElement("span");
    nameWrap.className = "channel-name";
    nameWrap.append(
      createTextElement("span", `channel-icon ${channelClass[channel] ?? "organic"}`, channel.slice(0, 2).toUpperCase()),
      document.createTextNode(channel),
    );
    nameCell.appendChild(nameWrap);
    tr.append(
      nameCell,
      createTextElement("td", "", readNumber(row, "sessions").toLocaleString()),
      createTextElement("td", "", `${readNumber(row, "conversion").toFixed(1)}%`),
      createTextElement("td", "", money(revenueByChannel.get(channel) ?? 0, true)),
    );
    const trendCell = document.createElement("td");
    const trend = document.createElement("span");
    trend.className = "trend-mini";
    [8, 12, 7, 15, 11, 17].forEach((heightValue, index) => {
      const bar = document.createElement("i");
      bar.style.height = `${heightValue + ((rowIndex + index) % 3) * 2}px`;
      trend.appendChild(bar);
    });
    trendCell.appendChild(trend);
    tr.appendChild(trendCell);
    channelBody.appendChild(tr);
  });
};

renderDashboard();
const toolController = registerAnalyticsTools();

const config: AgentWidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl,
  postprocessMessage: ({ text }) => markdownPostprocessor(text),
  storageAdapter: createLocalStorageAdapter("persona-state-analytics-agent"),
  theme: analyticsTheme,
  colorScheme: "light",
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    showWelcomeCard: true,
    welcomeTitle: "Meet Atlas, your data analyst",
    welcomeSubtitle:
      "Ask a business question in plain English. Atlas writes SQL against this browser-local warehouse and turns the result into an interactive Flint chart.",
    inputPlaceholder: "Ask anything about your data…",
  },
  suggestionChips: [
    "Chart monthly revenue by product",
    "Which channels convert best?",
    "Show MRR by plan over time",
    "Find an unexpected growth signal",
  ],
  messageActions: { showCopy: true, showUpvote: false, showDownvote: false },
  features: {
    ...DEFAULT_WIDGET_CONFIG.features,
    showReasoning: true,
    showToolCalls: true,
    artifacts: {
      enabled: true,
      allowedTypes: ["component"],
      renderCard: renderArtifactCard,
      layout: {
        splitGap: "0",
        paneWidth: "calc(100% - 380px)",
        paneMaxWidth: "none",
        paneMinWidth: "0",
        paneAppearance: "seamless",
        paneBorderLeft: "1px solid #e1e6e3",
        paneBackground: "#f8faf9",
        panePadding: "24px",
        paneShadow: "none",
        paneBorderRadius: "0",
        toolbarPreset: "document",
        documentToolbarIconColor: "#718079",
        documentToolbarToggleActiveBackground: "#ece9ff",
        documentToolbarToggleActiveBorderColor: "#d8d2ff",
        expandLauncherPanelWhenOpen: false,
      },
    },
  },
  webmcp: {
    enabled: true,
    allowlist: ["describe_analytics_data", "run_analytics_sql", "create_flint_chart"],
    autoApprove: () => true,
  },
  layout: {
    header: { layout: "minimal", showCloseButton: true },
    messages: { layout: "bubble", timestamp: { show: false }, avatar: { show: false } },
    contentMaxWidth: "720px",
  },
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    enabled: true,
    mountMode: "composer-bar",
    title: "Atlas",
    subtitle: "Ask your data",
    agentIconText: "✦",
    agentIconName: undefined,
    agentIconBackgroundColor: "#6d5dfc",
    autoExpand: false,
    zIndex: 100000,
    composerBar: {
      collapsedMaxWidth: "720px",
      bottomOffset: "18px",
      expandOnSubmit: true,
      expandedSize: "anchored",
      expandedMaxWidth: "900px",
      expandedTopOffset: "96px",
      contentMaxWidth: "720px",
    },
  },
};

const mount = document.getElementById("analytics-agent-root");
if (!mount) throw new Error("#analytics-agent-root is missing.");
widget = initAgentWidget({
  target: mount,
  useShadowDom: false,
  windowKey: "northstarAtlas",
  config,
});

document.querySelectorAll<HTMLElement>("[data-ask]").forEach((button) => {
  button.addEventListener("click", () => {
    const question = button.dataset.ask;
    if (!question || !widget) return;
    widget.open();
    widget.setMessage(question);
    window.setTimeout(() => widget?.focusInput(), 280);
  });
});

const syncArtifactFullscreen = (): void => {
  const pane = mount.querySelector<HTMLElement>(".persona-artifact-pane");
  const wrapper = mount.querySelector<HTMLElement>(".persona-widget-wrapper");
  const visible =
    wrapper?.dataset.state === "expanded" &&
    pane != null &&
    !pane.classList.contains("persona-hidden");
  document.body.classList.toggle("analytics-artifact-open", visible);
};

const artifactObserver = new MutationObserver(syncArtifactFullscreen);
artifactObserver.observe(mount, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class", "data-state"],
});
syncArtifactFullscreen();

window.addEventListener("beforeunload", () => {
  artifactObserver.disconnect();
  toolController.abort();
});

declare global {
  interface Window {
    northstarAnalytics?: {
      database: AnalyticsDatabase;
      schema: typeof ANALYTICS_SCHEMA;
      query: (sql: string) => AnalyticsQueryResult;
    };
  }
}

window.northstarAnalytics = {
  database,
  schema: ANALYTICS_SCHEMA,
  query: (sql: string) => database.query(sql),
};
