// The case matrix for `npm run probe:layout`. Every case is a config for the vanilla harness
// (apps/vanilla-playground/layout-matrix.ts) plus the extra transition sequences worth running on
// it; every case gets the width ladder and the height steps. Sequence names map to functions in
// run.mjs. `known` lists violations a case is expected to raise at given steps (a filed finding
// that is not a layout defect); they are reported as "known" and do not fail the run.

export const WIDTH_LADDER = [1400, 1200, 1000, 800, 650, 520, 420, 360];
export const HEIGHT_STEPS = [320, 180];
export const SMOKE_WIDTHS = [1400, 900, 520];

export const CASES = [
  { name: "flat", config: {} },
  { name: "flat-left", config: { pinned: "left" } },
  { name: "flat-right", config: { pinned: "right" } },
  {
    name: "flat-both",
    config: { pinned: "both" },
    sequences: ["scrolled", "pinToggle", "hideToggle", "themeSwap", "headerHeight", "hiddenMount", "bodyScroll", "window", "growTall"],
  },
  { name: "flat-both-few-rows", config: { pinned: "both", rows: 6 }, sequences: ["headerHeight"] },
  { name: "flat-both-empty", config: { pinned: "both", rows: 0 } },
  { name: "flat-both-wide-pins", config: { pinned: "both", pinnedWidth: "wide" }, sequences: ["scrolled", "window"] },
  { name: "groups2-both", config: { columns: "groups2", pinned: "both" }, sequences: ["groupToggle", "hideToggle", "scrolled"] },
  { name: "groups3-both", config: { columns: "groups3", pinned: "both", headerHeight: 36 }, sequences: ["groupToggle", "headerHeight"] },
  { name: "many-both", config: { columns: "many", pinned: "both" }, sequences: ["scrolled", "hiddenMount"] },
  { name: "row-numbers-checkboxes-left", config: { pinned: "both", rowNumbers: true, checkboxes: "left" }, sequences: ["scrolled"] },
  { name: "checkboxes-right", config: { pinned: "both", checkboxes: "right" } },
  { name: "checkboxes-unpinned", config: { pinned: "left", checkboxes: "unpinned" } },
  { name: "aggregates", config: { pinned: "both", aggregates: true }, sequences: ["scrolled", "headerHeight"] },
  { name: "pagination", config: { pinned: "both", pagination: true } },
  { name: "pinned-rows", config: { pinned: "both", pinnedRows: "both" }, sequences: ["scrolled", "bodyScroll", "hiddenMount", "growTall"] },
  {
    name: "kitchen",
    config: {
      columns: "groups2", pinned: "both", rowNumbers: true, checkboxes: "left", aggregates: true,
      pinnedRows: "both", pagination: true, toolbar: true,
    },
    sequences: ["scrolled", "themeSwap", "headerHeight", "hiddenMount", "window", "growTall"],
    // Toolbar + two header levels + three pinned rows + aggregate row + strip + pagination is
    // 364px of fixed chrome; below that the body has nothing left. Filed as A3.14 (the bands
    // should yield before the body) — reported as known, not as a failure.
    known: [{ steps: /^(height@(320|180)|growTall@300)$/, ids: ["stack-overflow", "body-collapsed", "root-overflow"], reason: "A3.14 fixed chrome taller than the root" }],
  },
  { name: "grouping", config: { grouping: "singleColumn" } },
  { name: "grouping-both-sticky", config: { pinned: "both", grouping: "sticky" }, sequences: ["bodyScroll", "scrolled"] },
  { name: "grouping-group-rows", config: { pinned: "both", grouping: "groupRows" }, sequences: ["bodyScroll", "scrolled"] },
  { name: "full-width-rows", config: { pinned: "both", fullWidth: true }, sequences: ["bodyScroll"] },
  { name: "theme-dark", config: { pinned: "both", theme: "dark" } },
  { name: "theme-custom-heights", config: { pinned: "both", theme: "custom" }, sequences: ["headerHeight", "themeSwap"] },
  { name: "explicit-heights", config: { columns: "groups2", pinned: "both", headerHeight: 60, rowHeight: 28 } },
  {
    name: "toolbar-pagination-aggregates",
    config: { pinned: "left", toolbar: true, pagination: true, aggregates: true },
    // 192px of fixed chrome in a 180px root: the same A3.14 question as the kitchen case.
    known: [{ steps: /^height@180$/, ids: ["stack-overflow", "body-collapsed", "root-overflow"], reason: "A3.14 fixed chrome taller than the root" }],
  },
  { name: "no-vertical-scroll-right-pin", config: { pinned: "right", rows: 5 } },
  // wrapHeaderText + autoHeaderHeight on every leaf and group: measured level heights must keep the
  // wrapper, every section's cells, the body frame and the pinned sections in step.
  {
    name: "wrap-header",
    config: { columns: "groups2", pinned: "both", headerWrap: true },
    sequences: ["headerHeight", "scrolled", "hideToggle"],
    // Two wrapped levels are ~200px of fixed chrome; at the two smallest heights the body keeps
    // its floor instead of the chrome yielding (the same A3.14 shape as the kitchen case).
    known: [{ steps: /^height@(320|180)$/, ids: ["stack-overflow", "body-collapsed", "root-overflow"], reason: "A3.14 fixed chrome taller than the root" }],
  },
];
