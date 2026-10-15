/**
 * Layout-matrix harness — the browser half of `npm run probe:layout`.
 *
 * One grid, built from a small config object, inside a frame whose size the caller controls. Two
 * callers:
 *  - `scripts/layout-probe/run.mjs` drives it headlessly over the DevTools protocol through
 *    `window.__layoutMatrix` (mount a config, resize the frame, scroll, change options, check).
 *  - A person opens /layout-matrix.html on the vanilla dev server, picks a config, drags the frame's
 *    corner and reads the violations panel — the same invariants, live.
 *
 * It is not a playground page: layout lives in the core renderer that all three bindings share, so
 * one framework-free page covers them, and the page-parity rule for demos does not apply to a test
 * harness. The invariants are imported from scripts/layout-probe so the page and the runner can
 * never disagree about what "aligned" means.
 */
import "@grid/theme/table.css";
import "./roboto-font.css";
import "./style.css";
import "../../scripts/layout-probe/invariants.js";

import {
  AggregateType,
  ColumnType,
  createGrid,
  themeDark,
  themeLight,
  type ColDef,
  type CreateGridOptions,
  type GridTheme,
  type IGridAPI,
} from "@grid";

import { btn, checkbox, field, h, numberInput, select } from "./dom";
import { mulberry32, picker } from "./helpers";

/** Everything a case can vary. Every key has a default, so `{}` is a plain flat grid. */
export interface LayoutMatrixConfig {
  /** Column preset: flat leaves, two header levels, three levels, or flat plus twenty more. */
  columns?: "flat" | "groups2" | "groups3" | "many";
  /** Which edge columns (or groups) are pinned. */
  pinned?: "none" | "left" | "right" | "both";
  /** "wide" makes each pinned column 260px so the 35% clamp bites at every ladder width. */
  pinnedWidth?: "normal" | "wide";
  /** Data rows. 0 shows the empty overlay; a handful leaves the body without a vertical scrollbar. */
  rows?: number;
  rowNumbers?: boolean;
  /** Checkbox selection column and where it sits. */
  checkboxes?: "none" | "left" | "right" | "unpinned";
  /** SUM aggregates on the numeric columns (shows the aggregate row). */
  aggregates?: boolean;
  pagination?: boolean;
  pinnedRows?: "none" | "top" | "bottom" | "both";
  /** Row grouping on Region: plain group column, full-width group rows, or sticky group rows. */
  grouping?: "none" | "singleColumn" | "groupRows" | "sticky";
  /** Every seventh row renders as a user full-width row. */
  fullWidth?: boolean;
  /** "custom" is themeDark with `headerHeight: 56` and `rowHeight: 36` theme params. */
  theme?: "light" | "dark" | "custom";
  /** Explicit grid options; 0 means unset. */
  headerHeight?: number;
  rowHeight?: number;
  toolbar?: boolean;
}

export const LAYOUT_MATRIX_DEFAULTS: Required<LayoutMatrixConfig> = {
  columns: "flat",
  pinned: "none",
  pinnedWidth: "normal",
  rows: 400,
  rowNumbers: false,
  checkboxes: "none",
  aggregates: false,
  pagination: false,
  pinnedRows: "none",
  grouping: "none",
  fullWidth: false,
  theme: "light",
  headerHeight: 0,
  rowHeight: 0,
  toolbar: false,
};

export interface InvariantViolation {
  id: string;
  severity: "error" | "warn";
  message: string;
  details: Record<string, unknown>;
}

export interface InvariantReport {
  violations: InvariantViolation[];
  summary: Record<string, unknown>;
}

export interface LayoutMatrixHarness {
  mount(config?: LayoutMatrixConfig, opts?: { hidden?: boolean }): Promise<{ config: Required<LayoutMatrixConfig> }>;
  destroy(): void;
  /** Resolves after layout has had two frames to settle (ResizeObserver callbacks included). */
  settle(): Promise<void>;
  /** Frame size in CSS px; null restores the fluid width / default height. */
  setHostSize(width: number | null, height: number | null): Promise<{ width: number; height: number }>;
  /** Shows a frame mounted with `{ hidden: true }`. */
  reveal(): Promise<void>;
  /** Runs the invariants on the mounted grid; null when nothing is mounted. */
  check(): InvariantReport | null;
  scrollCenter(x: number | "max"): Promise<number>;
  scrollBody(y: number | "max"): Promise<number>;
  pin(colId: string, pinned: "left" | "right" | null): Promise<void>;
  hide(colId: string, hidden: boolean): Promise<void>;
  setGroupOpen(colId: string, open: boolean): Promise<void>;
  setTheme(name: NonNullable<LayoutMatrixConfig["theme"]>): Promise<void>;
  setHeaderHeight(px: number | undefined): Promise<void>;
  api(): IGridAPI | null;
  config(): Required<LayoutMatrixConfig> | null;
}

declare global {
  interface Window {
    __layoutInvariants: { check(root: Element): InvariantReport; checkAll(): InvariantReport[] };
    __layoutMatrix: LayoutMatrixHarness;
  }
}

/* ---------------------------------------------------------------- data ---------------------- */

type Row = {
  id: string;
  region: string;
  country: string;
  account: string;
  owner: string;
  status: string;
  units: number;
  revenue: number;
  margin: number;
  notes: string;
  fw: boolean;
} & Record<string, unknown>;

const REGIONS: Record<string, string[]> = {
  Americas: ["USA", "Canada", "Brazil"],
  EMEA: ["UK", "France", "Germany"],
  APAC: ["India", "Japan", "Australia"],
};
const OWNERS = ["Ava Chen", "Liam Patel", "Mia Kim", "Noah Garcia", "Emma Silva", "Oliver Brandt"];
const STATUSES = ["Qualified", "Negotiating", "Won", "Blocked"];
const NOTES = [
  "Renewal pending finance sign-off; expansion under discussion.",
  "Escalated ticket resolved; sentiment improved after the QBR.",
  "Multi-year contract; discount tier applies.",
  "Pilot converted to paid; onboarding scheduled.",
];

function buildRows(count: number, many: boolean): Row[] {
  const rand = mulberry32(42);
  const pick = picker(rand);
  return Array.from({ length: count }, (_, i) => {
    const region = pick(Object.keys(REGIONS));
    const row: Row = {
      id: `r${i + 1}`,
      region,
      country: pick(REGIONS[region]),
      account: `Account ${String(i + 1).padStart(4, "0")}`,
      owner: pick(OWNERS),
      status: pick(STATUSES),
      units: 1 + Math.floor(rand() * 500),
      revenue: 1_000 + Math.floor(rand() * 250_000),
      margin: Math.round(rand() * 6_000) / 100,
      notes: pick(NOTES),
      fw: i % 7 === 3,
    };
    if (many) {
      for (let c = 1; c <= 20; c++) row[`c${String(c).padStart(2, "0")}`] = Math.floor(rand() * 1_000);
    }
    return row;
  });
}

function pinnedRow(id: string, label: string): Row {
  return {
    id, region: label, country: "", account: label, owner: "", status: "",
    units: 1_234, revenue: 9_876_543, margin: 12.5, notes: "pinned", fw: false,
  };
}

/* ---------------------------------------------------------------- columns ------------------- */

function buildColumnDefs(config: Required<LayoutMatrixConfig>): ColDef[] {
  const wide = config.pinnedWidth === "wide";
  const pinLeft = config.pinned === "left" || config.pinned === "both";
  const pinRight = config.pinned === "right" || config.pinned === "both";
  const leaf = (colId: string, label: string, width: number, extra: Partial<ColDef> = {}): ColDef =>
    ({ colId, key: colId, label, width, ...extra });
  const group = (colId: string, label: string, children: ColDef[], pinned?: "left" | "right"): ColDef =>
    ({ colId, label, children, ...(pinned ? { pinned } : {}) });

  const region = leaf("region", "Region", wide ? 260 : 130);
  // `columnGroupShow: "open"` on one leaf per group gives that group a real expander (a group whose
  // children all behave alike gets none), so the groupToggle sequence has something to collapse.
  const country = leaf("country", "Country", wide ? 260 : 130, { columnGroupShow: "open" });
  const account = leaf("account", "Account", 170);
  const owner = leaf("owner", "Owner", 130, { columnGroupShow: "open" });
  const status = leaf("status", "Status", 110);
  const units = leaf("units", "Units", 100, { type: ColumnType.NUMBER });
  const revenue = leaf("revenue", "Revenue", 140, { type: ColumnType.CURRENCY });
  const margin = leaf("margin", "Margin %", wide ? 260 : 110, { type: ColumnType.NUMBER });
  const notes = leaf("notes", "Notes", wide ? 260 : 220);
  const extras: ColDef[] = config.columns === "many"
    ? Array.from({ length: 20 }, (_, c) => {
      const id = `c${String(c + 1).padStart(2, "0")}`;
      return leaf(id, id.toUpperCase(), 90, { type: ColumnType.NUMBER });
    })
    : [];

  switch (config.columns) {
    case "groups2":
      return [
        group("location", "Location", [region, country], pinLeft ? "left" : undefined),
        group("people", "People", [account, owner, status]),
        group("performance", "Performance", [units, revenue, ...extras]),
        group("other", "Other", [margin, notes], pinRight ? "right" : undefined),
      ];
    case "groups3":
      return [
        group("deal", "Deal", [
          group("location", "Location", [region, country]),
          group("people", "People", [account, owner]),
        ], pinLeft ? "left" : undefined),
        group("numbers", "Numbers", [
          group("performance", "Performance", [units, revenue, ...extras]),
          group("text", "Text", [status, margin, notes]),
        ], pinRight ? "right" : undefined),
      ];
    default: {
      delete country.columnGroupShow;
      delete owner.columnGroupShow;
      if (pinLeft) {
        region.pinned = "left";
        country.pinned = "left";
      }
      if (pinRight) {
        margin.pinned = "right";
        notes.pinned = "right";
      }
      return [region, country, account, owner, status, units, revenue, ...extras, margin, notes];
    }
  }
}

/* ---------------------------------------------------------------- options ------------------- */

function themeFor(name: NonNullable<LayoutMatrixConfig["theme"]>): GridTheme {
  if (name === "dark") return themeDark;
  if (name === "custom") {
    return themeDark.withParams({ headerHeight: 56, rowHeight: 36, fontSize: 15, accentColor: "#e0a100" });
  }
  return themeLight;
}

function buildOptions(config: Required<LayoutMatrixConfig>, rows: Row[]): CreateGridOptions {
  const options: CreateGridOptions = {
    rowData: rows,
    columnDefs: buildColumnDefs(config),
    rowIdKey: "id",
    theme: themeFor(config.theme),
    rowNumbers: config.rowNumbers,
    pagination: config.pagination,
  };
  if (config.headerHeight > 0) options.headerHeight = config.headerHeight;
  if (config.rowHeight > 0) options.rowHeight = config.rowHeight;
  if (config.toolbar) options.toolbar = { sorting: true, grouping: true, quickFilter: true };
  if (config.checkboxes !== "none") {
    options.rowSelection = {
      checkboxes: true,
      checkboxColumnPinned: config.checkboxes === "unpinned" ? null : config.checkboxes,
    };
  }
  if (config.pinnedRows === "top" || config.pinnedRows === "both") {
    options.pinnedTopRowData = [pinnedRow("top-1", "Forecast"), pinnedRow("top-2", "Target")];
  }
  if (config.pinnedRows === "bottom" || config.pinnedRows === "both") {
    options.pinnedBottomRowData = [pinnedRow("bottom-1", "Totals")];
  }
  if (config.grouping !== "none") {
    options.groupDisplayType = config.grouping === "groupRows" ? "groupRows" : "singleColumn";
    options.groupRowsSticky = config.grouping === "sticky";
  }
  if (config.fullWidth) {
    options.isFullWidthRow = node => (node.data as Row | undefined)?.fw === true;
    options.fullWidthCellRenderer = params => {
      const data = (params as unknown as { data?: Row }).data;
      return h("div", { class: "lm-full-width", text: `Full-width row · ${data?.account ?? ""}` });
    };
  }
  return options;
}

/* ---------------------------------------------------------------- harness ------------------- */

const frame = h("div", { class: "lm-frame" });
const host = h("div", { class: "lm-host" });
frame.appendChild(host);

let api: IGridAPI | null = null;
let current: Required<LayoutMatrixConfig> | null = null;

function resolveConfig(config: LayoutMatrixConfig): Required<LayoutMatrixConfig> {
  return { ...LAYOUT_MATRIX_DEFAULTS, ...config };
}

function gridRoot(): HTMLElement | null {
  return host.querySelector<HTMLElement>(".pte-root");
}

async function settle(): Promise<void> {
  // Two frames, twice: a ResizeObserver callback runs after layout in the frame that follows the
  // change, and the grid's own rAF-batched work may queue another layout behind it.
  for (let i = 0; i < 2; i++) {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)));
    });
  }
}

function destroy(): void {
  api?.destroy();
  api = null;
  host.replaceChildren();
}

async function mount(
  config: LayoutMatrixConfig = {},
  opts: { hidden?: boolean } = {},
): Promise<{ config: Required<LayoutMatrixConfig> }> {
  destroy();
  current = resolveConfig(config);
  frame.style.display = opts.hidden ? "none" : "";
  const rows = buildRows(current.rows, current.columns === "many");
  api = createGrid(host, buildOptions(current, rows));
  if (current.aggregates) {
    api.setAggregates([
      { colId: "units", type: AggregateType.SUM },
      { colId: "revenue", type: AggregateType.SUM },
    ]);
  }
  if (current.grouping !== "none") {
    api.setRowGroupColumns(["region"]);
    api.setAllGroupsExpanded(true);
  }
  writeHash(current);
  await settle();
  return { config: current };
}

async function setHostSize(width: number | null, height: number | null) {
  frame.style.width = width ? `${width}px` : "";
  frame.style.height = height ? `${height}px` : "";
  await settle();
  return { width: frame.clientWidth, height: frame.clientHeight };
}

async function reveal(): Promise<void> {
  frame.style.display = "";
  await settle();
}

function check(): InvariantReport | null {
  const root = gridRoot();
  return root ? window.__layoutInvariants.check(root) : null;
}

async function scrollCenter(x: number | "max"): Promise<number> {
  const root = gridRoot();
  if (!root) return 0;
  // The strip is what a person drags; it is hidden while nothing overflows, in which case the centre
  // spacer (what a shift-wheel reaches) is the scroller.
  const strip = root.querySelector<HTMLElement>(".pte-scroller-horizontal-container .pte-scroller-horizontal-spacer");
  const target = strip && strip.offsetParent !== null ? strip : root.querySelector<HTMLElement>(".pte-spacer");
  if (!target) return 0;
  target.scrollLeft = x === "max" ? target.scrollWidth : x;
  await settle();
  return target.scrollLeft;
}

async function scrollBody(y: number | "max"): Promise<number> {
  const body = gridRoot()?.querySelector<HTMLElement>(".pte-body");
  if (!body) return 0;
  body.scrollTop = y === "max" ? body.scrollHeight : y;
  await settle();
  return body.scrollTop;
}

async function pin(colId: string, pinned: "left" | "right" | null): Promise<void> {
  api?.applyColumnState([{ colId, pinned }]);
  await settle();
}

async function hide(colId: string, hidden: boolean): Promise<void> {
  api?.applyColumnState([{ colId, hidden }]);
  await settle();
}

async function setGroupOpen(colId: string, open: boolean): Promise<void> {
  api?.setColumnGroupState([{ colId, open }]);
  await settle();
}

async function setTheme(name: NonNullable<LayoutMatrixConfig["theme"]>): Promise<void> {
  api?.updateGridOptions({ theme: themeFor(name) });
  await settle();
}

/** `undefined` hands the height back to the theme param / default, as the wrappers' props do. */
async function setHeaderHeight(px: number | undefined): Promise<void> {
  api?.updateGridOptions({ headerHeight: px });
  await settle();
}

const harness: LayoutMatrixHarness = {
  mount, destroy, settle, setHostSize, reveal, check, scrollCenter, scrollBody,
  pin, hide, setGroupOpen, setTheme, setHeaderHeight,
  api: () => api,
  config: () => current,
};
window.__layoutMatrix = harness;

/* ---------------------------------------------------------------- hash --------------------- */

function nonDefault(config: Required<LayoutMatrixConfig>): LayoutMatrixConfig {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(LAYOUT_MATRIX_DEFAULTS) as Array<keyof LayoutMatrixConfig>) {
    if (config[key] !== LAYOUT_MATRIX_DEFAULTS[key]) out[key] = config[key];
  }
  return out as LayoutMatrixConfig;
}

function writeHash(config: Required<LayoutMatrixConfig>): void {
  const slim = nonDefault(config);
  const next = Object.keys(slim).length ? `#${encodeURIComponent(JSON.stringify(slim))}` : "";
  if (next !== window.location.hash) history.replaceState(null, "", `${window.location.pathname}${next}`);
}

function readHash(): LayoutMatrixConfig {
  const raw = window.location.hash.slice(1);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    return parsed && typeof parsed === "object" ? parsed as LayoutMatrixConfig : {};
  } catch {
    return {};
  }
}

/* ---------------------------------------------------------------- page --------------------- */

type FieldSpec =
  | { key: keyof LayoutMatrixConfig; label: string; kind: "select"; options: readonly string[] }
  | { key: keyof LayoutMatrixConfig; label: string; kind: "number" }
  | { key: keyof LayoutMatrixConfig; label: string; kind: "bool" };

const FIELDS: FieldSpec[] = [
  { key: "columns", label: "Columns", kind: "select", options: ["flat", "groups2", "groups3", "many"] },
  { key: "pinned", label: "Pinned", kind: "select", options: ["none", "left", "right", "both"] },
  { key: "pinnedWidth", label: "Pinned width", kind: "select", options: ["normal", "wide"] },
  { key: "rows", label: "Rows", kind: "number" },
  { key: "rowNumbers", label: "Row numbers", kind: "bool" },
  { key: "checkboxes", label: "Checkboxes", kind: "select", options: ["none", "left", "right", "unpinned"] },
  { key: "aggregates", label: "Aggregates", kind: "bool" },
  { key: "pagination", label: "Pagination", kind: "bool" },
  { key: "pinnedRows", label: "Pinned rows", kind: "select", options: ["none", "top", "bottom", "both"] },
  { key: "grouping", label: "Grouping", kind: "select", options: ["none", "singleColumn", "groupRows", "sticky"] },
  { key: "fullWidth", label: "Full-width rows", kind: "bool" },
  { key: "theme", label: "Theme", kind: "select", options: ["light", "dark", "custom"] },
  { key: "headerHeight", label: "headerHeight", kind: "number" },
  { key: "rowHeight", label: "rowHeight", kind: "number" },
  { key: "toolbar", label: "Toolbar", kind: "bool" },
];

const style = document.createElement("style");
style.textContent = `
  .lm-page { display: flex; flex-direction: column; gap: 10px; padding: 10px; height: 100%; box-sizing: border-box; }
  .lm-panel { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; font-size: 13px; }
  .lm-panel input[type=number] { width: 64px; }
  .lm-frame { width: 100%; height: 600px; flex: 0 0 auto; resize: both; overflow: hidden; box-sizing: border-box; border: 1px dashed #9ca3af; }
  .lm-host { width: 100%; height: 100%; }
  .lm-report { font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; margin: 0; max-height: 32vh; overflow: auto; }
  .lm-report.lm-fail { color: #b91c1c; }
  .lm-report.lm-ok { color: #047857; }
  .lm-full-width { display: flex; align-items: center; height: 100%; padding: 0 12px; font-style: italic; box-sizing: border-box; }
`;
document.head.appendChild(style);

function buildPage(): void {
  const draft: Required<LayoutMatrixConfig> = resolveConfig(readHash());
  const panel = h("div", { class: "lm-panel" });
  for (const spec of FIELDS) {
    const key = spec.key;
    let control: HTMLElement;
    if (spec.kind === "select") {
      control = select(spec.options, String(draft[key]), value => {
        (draft as Record<string, unknown>)[key] = value;
      });
    } else if (spec.kind === "number") {
      control = numberInput(Number(draft[key]), value => {
        (draft as Record<string, unknown>)[key] = Number(value) || 0;
      }, { min: 0 });
    } else {
      control = checkbox(Boolean(draft[key]), value => {
        (draft as Record<string, unknown>)[key] = value;
      });
    }
    panel.appendChild(field(spec.label, control));
  }

  const report = h("pre", { class: "lm-report", text: "No grid mounted." });
  const render = (): void => {
    const result = check();
    if (!result) {
      report.textContent = "No grid mounted.";
      report.className = "lm-report";
      return;
    }
    const errors = result.violations.filter(v => v.severity === "error");
    const warnings = result.violations.filter(v => v.severity === "warn");
    const lines = [
      `${errors.length} error(s), ${warnings.length} warning(s) · ${JSON.stringify(result.summary)}`,
      ...result.violations.map(v => `${v.severity === "error" ? "✘" : "△"} ${v.id}: ${v.message} ${JSON.stringify(v.details)}`),
    ];
    report.textContent = lines.join("\n");
    report.className = `lm-report ${errors.length ? "lm-fail" : "lm-ok"}`;
  };

  const widthInput = numberInput("", value => { void setHostSize(Number(value) || null, Number(heightInput.value) || null).then(render); }, { placeholder: "fluid" });
  const heightInput = numberInput(600, value => { void setHostSize(Number(widthInput.value) || null, Number(value) || null).then(render); });

  panel.appendChild(btn("Apply", () => { void mount(draft).then(render); }));
  panel.appendChild(field("Frame width", widthInput));
  panel.appendChild(field("Frame height", heightInput));
  panel.appendChild(btn("Check", render));

  document.getElementById("root")!.appendChild(h("div", { class: "lm-page" }, panel, frame, report));

  // Dragging the frame's corner (CSS resize) is the manual version of the runner's width ladder.
  let scheduled = false;
  new ResizeObserver(() => {
    if (scheduled) return;
    scheduled = true;
    void settle().then(() => { scheduled = false; render(); });
  }).observe(frame);

  void mount(draft).then(render);
}

buildPage();
