import { GridIconMap } from "./icons";
import type { PteVarName } from "./cssVars.generated";

/**
 * Theming API — an AG-Grid-style theme object.
 *
 * A {@link GridTheme} is an immutable value that resolves to a flat map of
 * `--pte-*` CSS custom properties. The grid applies that map as inline styles on
 * its root element (and on its portaled popups), so each grid instance can be
 * themed independently with no global stylesheet edits and no runtime injection.
 *
 * Two layers of customization:
 *  - **Semantic params** ({@link GridThemeParams}) — a small curated set
 *    (`accentColor`, `rowHeight`, `spacing`, …). One semantic param fans out to
 *    several atomic variables (e.g. `accentColor` drives selection, checkbox,
 *    spinner, and filter-active colors at once).
 *  - **Atomic escape hatch** (`vars`) — set any `--pte-*` variable directly, with
 *    the full name autocompleted and typo-checked via {@link PteVarName}. Atomic
 *    overrides always win over the semantic fan-out.
 *
 * Start from a preset and refine:
 * ```ts
 * themeDark.withParams({ accentColor: "#e11", rowHeight: 40 })
 * ```
 */
export interface GridThemeParams {
  /** Primary accent. Fans out to selection border, checkbox accent, select border,
   * loading-spinner head, filter-active indicator, and selected resize handle. */
  accentColor?: string;
  /** Grid surface background. Fans out to root, surface, and input backgrounds. */
  backgroundColor?: string;
  /** Column-header background. */
  headerBackgroundColor?: string;
  /** Primary text color. */
  textColor?: string;
  /** Secondary / muted text color. */
  mutedTextColor?: string;
  /** Border color. Fans out to the cell/row border and the outer frame border. */
  borderColor?: string;
  /** Row hover background. */
  rowHoverColor?: string;
  /** Column hover background (highlights a column when `columnHover` is enabled). */
  columnHoverColor?: string;
  /** Alternating (odd) row background for zebra striping (when `zebraRows` is enabled). */
  rowAltBackgroundColor?: string;
  /** Active (focused) cell outline color (when `highlightActiveCell` is enabled). */
  activeCellBorderColor?: string;
  /**
   * Keyboard focus ring for the grid's own controls (toolbar, paginator, quick filter, column
   * panel). Needs to clear 3:1 against the surface behind it to satisfy WCAG 2.4.11, so it is a
   * stronger blue than the selection colours rather than sharing `accentColor`.
   */
  focusRingColor?: string;
  /** Selected row/cell background. Fans out to the base and hover selected backgrounds. */
  selectedBackgroundColor?: string;
  /** Base font family. */
  fontFamily?: string;
  /** Base font size. A number is treated as pixels. */
  fontSize?: string | number;
  /** Header font weight (e.g. 500 or "600"). */
  headerFontWeight?: string | number;
  /** Data row height. A number is treated as pixels. */
  rowHeight?: string | number;
  /** Left/right cell padding. A number is treated as pixels. */
  cellHorizontalPadding?: string | number;
  /** Top/bottom cell padding. A number is treated as pixels. */
  cellVerticalPadding?: string | number;
  /** Convenience: sets both horizontal and vertical cell padding at once (pixels
   * when a number). Explicit `cellHorizontalPadding`/`cellVerticalPadding` win. */
  spacing?: string | number;
  /** Default (monochrome) icon color. */
  iconColor?: string;
  /** Scrollbar thumb color (webkit + firefox). */
  scrollbarThumbColor?: string;
  /** Aggregate footer background. Fans out to the aggregate row and cell backgrounds. */
  aggregateBackgroundColor?: string;
  /** Sparkline line color. */
  sparklineStrokeColor?: string;
  /** Sparkline bar/fill color. */
  sparklineBarColor?: string;
  /** ActionFrame border color (frame around a cell with an open popover). */
  actionFrameBorderColor?: string;
  /** ActionFrame border glow color. */
  actionFrameGlowColor?: string;
  /**
   * ActionFrame popover background.
   *
   * Like every `actionFramePopover*` param, this has **no effect** when the column runs with
   * `actionFrameOptions.escapeRootClip: true` — see {@link GridThemeParams.actionFramePopoverWidth}.
   */
  actionFramePopoverBackgroundColor?: string;
  /** ActionFrame popover text color. No effect under `escapeRootClip` — see
   * {@link GridThemeParams.actionFramePopoverWidth}. */
  actionFramePopoverTextColor?: string;
  /** ActionFrame popover border color. No effect under `escapeRootClip` — see
   * {@link GridThemeParams.actionFramePopoverWidth}. */
  actionFramePopoverBorderColor?: string;
  /** ActionFrame popover shadow. No effect under `escapeRootClip` — see
   * {@link GridThemeParams.actionFramePopoverWidth}. */
  actionFramePopoverShadow?: string;
  /** ActionFrame popover border radius. No effect under `escapeRootClip` — see
   * {@link GridThemeParams.actionFramePopoverWidth}. */
  actionFramePopoverRadius?: string | number;
  /**
   * ActionFrame popover width.
   *
   * **Not applied when the popover escapes the root clip.** Theme params are delivered as inline
   * `--pte-*` custom properties on the grid root, so they only reach elements inside that subtree.
   * With `actionFrameOptions.escapeRootClip: true` the popover is mounted in `document.body`, where
   * it inherits `--pte-action-frame-popover-width` from the stylesheet's `:root` block instead and
   * renders at the built-in default (300px). The same applies to every other
   * `actionFramePopover*` param.
   *
   * To size an escaped popover, either drop `escapeRootClip`, or set the variable at document scope
   * (which affects all grids on the page):
   * ```css
   * :root { --pte-action-frame-popover-width: 420px; }
   * ```
   */
  actionFramePopoverWidth?: string | number;
  /**
   * Tooltip background color.
   *
   * Tooltips portal to `document.body` when `tooltipOptions.escapeRootClip` is on, so the whole
   * `tooltip*` family is subject to the same limitation described on
   * {@link GridThemeParams.actionFramePopoverWidth}: those tooltips fall back to the stylesheet
   * defaults rather than the theme's values.
   */
  tooltipBackgroundColor?: string;
  /** Tooltip text color. */
  tooltipTextColor?: string;
  /** Tooltip border color. */
  tooltipBorderColor?: string;
  /** Tooltip border radius. */
  tooltipRadius?: string | number;
  /** Tooltip shadow. */
  tooltipShadow?: string;
  /** Tooltip max width. */
  tooltipMaxWidth?: string | number;
  /** Scrollbar thumb border radius. */
  scrollbarRadius?: string | number;
  /** Scrollbar thumb size / thickness. */
  scrollbarSize?: string | number;
  /** Scrollbar lane width (gutter) when visible. */
  scrollbarGutter?: string | number;
  /** Scrollbar lane width (gutter) in active state. */
  scrollbarGutterActive?: string | number;
  /** Minimum scrollbar lane width. */
  scrollbarLaneMin?: string | number;
  /** Thickness of borders between data rows. */
  rowBorderSize?: string | number;
  /** Height of the pagination/footer area. */
  paginationFooterHeight?: string | number;
  /** Width of the column panel when open. */
  columnPanelWidth?: string | number;
  /** Width of the collapsed column panel trigger area. */
  columnPanelGutterWidth?: string | number;
  /** Height of the column header row. */
  headerHeight?: string | number;
  /** Duration of cell flash highlight fade animation. */
  cellFlashFadeDuration?: string;
  /** Grid root element border radius. A number is treated as pixels. */
  rootBorderRadius?: string | number;
  /** Grid root element border width. A number is treated as pixels. */
  rootBorderWidth?: string | number;
  /** Hide the grid's outer border by making it transparent. */
  borderLessGrid?: boolean;

  /** Escape hatch: set any grid CSS variable directly. Wins over the semantic
   * fan-out above. Numbers are emitted verbatim (add your own unit). */
  vars?: Partial<Record<PteVarName, string | number>>;
  /** Per-icon overrides. Values may be a URL, data URI, `url(...)`, or inline SVG
   * markup. Merged into (and overridden by) `GridOptions.icons`. */
  icons?: GridIconMap;
}

/** A resolved, immutable theme. Produce new themes with {@link GridTheme.withParams}. */
export interface GridTheme {
  /** The merged semantic params that produced this theme (for inspection/debugging). */
  readonly params: Readonly<GridThemeParams>;
  /** Resolve to the flat `--pte-*` → value map applied to the grid root. */
  toCssVars(): Record<string, string>;
  /** The icon overrides carried by this theme, if any. */
  getIcons(): GridIconMap | undefined;
  /** Return a NEW theme with `overrides` merged on top of this one. */
  withParams(overrides: GridThemeParams): GridTheme;
}

type Fanout = { vars: PteVarName[]; px?: boolean };

/** Semantic-param → atomic-variable fan-out table. `px: true` appends "px" to a
 * bare number value. */
const FANOUT: Record<string, Fanout> = {
  accentColor: {
    vars: [
      "--pte-selected-border-color",
      "--pte-checkbox-accent-color",
      "--pte-select-border-color",
      "--pte-loading-spinner-head-color",
      "--pte-hcell-filter-active-color",
      "--pte-selected-resize-handle-color",
    ],
  },
  backgroundColor: {
    vars: ["--pte-root-bg-color", "--pte-surface-bg-color", "--pte-input-bg-color"],
  },
  headerBackgroundColor: { vars: ["--pte-header-background-color"] },
  textColor: { vars: ["--pte-text-color"] },
  mutedTextColor: { vars: ["--pte-muted-text-color"] },
  borderColor: { vars: ["--pte-border-color", "--pte-frame-border-color"] },
  rowHoverColor: { vars: ["--pte-hover-bg-color"] },
  columnHoverColor: { vars: ["--pte-column-hover-bg-color"] },
  rowAltBackgroundColor: { vars: ["--pte-row-alt-bg-color"] },
  activeCellBorderColor: { vars: ["--pte-active-cell-border-color"] },
  focusRingColor: { vars: ["--pte-focus-ring-color"] },
  selectedBackgroundColor: {
    vars: ["--pte-selected-bg-color", "--pte-selected-hover-bg-color"],
  },
  fontFamily: { vars: ["--pte-font-family"] },
  fontSize: { vars: ["--pte-font-size"], px: true },
  headerFontWeight: { vars: ["--pte-header-font-weight"] },
  rowHeight: { vars: ["--pte-row-height"], px: true },
  cellHorizontalPadding: {
    vars: ["--pte-cell-padding-left", "--pte-cell-padding-right"],
    px: true,
  },
  cellVerticalPadding: {
    vars: ["--pte-cell-padding-top", "--pte-cell-padding-bottom"],
    px: true,
  },
  iconColor: { vars: ["--pte-icon-color"] },
  scrollbarThumbColor: { vars: ["--pte-scrollbar-thumb-color"] },
  aggregateBackgroundColor: {
    vars: ["--pte-aggregate-row-bg-color", "--pte-aggregate-cell-bg-color"],
  },
  sparklineStrokeColor: { vars: ["--pte-sparkline-stroke-color"] },
  sparklineBarColor: { vars: ["--pte-sparkline-bar-color"] },
  actionFrameBorderColor: { vars: ["--pte-action-frame-border-color"] },
  actionFrameGlowColor: { vars: ["--pte-action-frame-glow"] },
  actionFramePopoverBackgroundColor: { vars: ["--pte-action-frame-popover-bg"] },
  actionFramePopoverTextColor: { vars: ["--pte-action-frame-popover-text-color"] },
  actionFramePopoverBorderColor: { vars: ["--pte-action-frame-popover-border-color"] },
  actionFramePopoverShadow: { vars: ["--pte-action-frame-popover-shadow"] },
  actionFramePopoverRadius: { vars: ["--pte-action-frame-popover-radius"] },
  actionFramePopoverWidth: { vars: ["--pte-action-frame-popover-width"] },
  tooltipBackgroundColor: { vars: ["--pte-tooltip-bg"] },
  tooltipTextColor: { vars: ["--pte-tooltip-text-color"] },
  tooltipBorderColor: { vars: ["--pte-tooltip-border-color"] },
  tooltipRadius: { vars: ["--pte-tooltip-radius"] },
  tooltipShadow: { vars: ["--pte-tooltip-shadow"] },
  tooltipMaxWidth: { vars: ["--pte-tooltip-max-width"] },
  scrollbarRadius: { vars: ["--pte-scrollbar-radius"] },
  scrollbarSize: { vars: ["--pte-scrollbar-size"] },
  scrollbarGutter: { vars: ["--pte-scrollbar-gutter"] },
  scrollbarGutterActive: { vars: ["--pte-scrollbar-gutter-active"] },
  scrollbarLaneMin: { vars: ["--pte-scrollbar-lane-min"] },
  rowBorderSize: { vars: ["--pte-row-border-size"] },
  paginationFooterHeight: { vars: ["--pte-pagination-footer-height"] },
  columnPanelWidth: { vars: ["--pte-column-panel-width"] },
  columnPanelGutterWidth: { vars: ["--pte-column-panel-gutter-width"] },
  headerHeight: { vars: ["--pte-rendered-header-height"] },
  cellFlashFadeDuration: { vars: ["--pte-cell-flash-fade-duration"] },
  rootBorderRadius: { vars: ["--pte-root-border-radius"], px: true },
  rootBorderWidth: { vars: ["--pte-root-border-width"], px: true },
};

function toCssValue(value: string | number, px: boolean): string {
  return typeof value === "number" && px ? `${value}px` : String(value);
}

function resolveVars(params: GridThemeParams): Record<string, string> {
  const out: Record<string, string> = {};

  // `spacing` seeds cell padding; explicit horizontal/vertical padding overrides it.
  if (params.spacing != null) {
    const px = FANOUT.cellHorizontalPadding.px ?? false;
    const v = toCssValue(params.spacing, px);
    for (const name of FANOUT.cellHorizontalPadding.vars) out[name] = v;
    for (const name of FANOUT.cellVerticalPadding.vars) out[name] = v;
  }

  // Semantic params fan out to their atomic variables.
  for (const [key, fan] of Object.entries(FANOUT)) {
    const value = (params as Record<string, unknown>)[key];
    if (value == null) continue;
    const css = toCssValue(value as string | number, fan.px ?? false);
    for (const name of fan.vars) out[name] = css;
  }

  // `borderLess` hides the border by making it transparent.
  if (params.borderLessGrid) {
    out["--pte-frame-border-color"] = "transparent";
  }

  // Atomic escape hatch wins over everything.
  if (params.vars) {
    for (const [name, value] of Object.entries(params.vars)) {
      if (value == null) continue;
      out[name] = String(value);
    }
  }

  return out;
}

function mergeParams(base: GridThemeParams, overrides: GridThemeParams): GridThemeParams {
  return {
    ...base,
    ...overrides,
    // `vars` and `icons` are merged key-wise so partial overrides don't wipe the base.
    vars: { ...base.vars, ...overrides.vars },
    icons: { ...base.icons, ...overrides.icons },
  };
}

/** Create a theme from raw params. Prefer the exported presets + `withParams`. */
export function createTheme(params: GridThemeParams = {}): GridTheme {
  const frozen = Object.freeze({ ...params });
  return {
    params: frozen,
    toCssVars: () => resolveVars(frozen),
    getIcons: () =>
      frozen.icons && Object.keys(frozen.icons).length > 0 ? frozen.icons : undefined,
    withParams: (overrides) => createTheme(mergeParams(frozen, overrides)),
  };
}

/**
 * The default light theme. Emits no inline variables — the grid falls back to the
 * light defaults baked into the stylesheet. Use as a base for light customizations.
 */
export const themeLight: GridTheme = createTheme();

/**
 * Full dark-mode variable set, applied inline on the grid root (and its popups) so
 * a single grid can be dark without any `.pte-theme-dark` ancestor class. Kept in
 * sync with the `.pte-theme-dark` block in `src/theme/table.css`.
 */
export const themeDark: GridTheme = createTheme({
  vars: {
    "--pte-root-bg-color": "#0f172a",
    "--pte-text-color": "#e2e8f0",
    "--pte-muted-text-color": "#94a3b8",
    "--pte-header-background-color": "#1f2937",
    "--pte-frame-border-color": "#334155",
    "--pte-border-color": "#2a364a",
    "--pte-resize-handle-color": "#475569",
    "--pte-selected-resize-handle-color": "#60a5fa",
    "--pte-hover-bg-color": "#13223a",
    "--pte-selected-bg-color": "#1e3a8a",
    "--pte-selected-hover-bg-color": "#27459b",
    "--pte-selected-border-color": "#60a5fa",
    "--pte-active-cell-border-color": "#93c5fd",
    "--pte-focus-ring-color": "#60a5fa",
    "--pte-row-alt-bg-color": "#131f36",
    "--pte-group-row-bg-color": "#1e293b",
    "--pte-column-hover-bg-color": "#13223a",
    "--pte-input-bg-color": "#111827",
    "--pte-select-border-color": "#60a5fa",
    "--pte-hcell-filter-active-color": "#60a5fa",
    "--pte-icon-color": "#9ca3af",
    "--pte-shadow-color": "rgba(0, 0, 0, 0.45)",
    "--pte-overlay-shadow": "0 10px 30px rgba(0, 0, 0, 0.6)",
    "--pte-drag-shadow": "0 6px 18px rgba(0, 0, 0, 0.6)",
    "--pte-scrollbar-track-color": "#0b1220",
    "--pte-scrollbar-thumb-color": "#334155",
    "--pte-scrollbar-thumb-hover-color": "#475569",
    "--pte-checkbox-accent-color": "#60a5fa",
    "--pte-aggregate-row-bg-color": "#1e293b",
    "--pte-aggregate-cell-bg-color": "#1e293b",
    "--pte-surface-bg-color": "#0f172a",
    "--pte-sheet-tab-bg": "#182338",
    "--pte-sheet-tab-hover-bg": "#22304a",
    "--pte-overlay-border-color": "rgba(148, 163, 184, 0.25)",
    "--pte-control-border-color": "rgba(148, 163, 184, 0.35)",
    "--pte-button-primary-bg": "#2563eb",
    "--pte-button-primary-text": "#ffffff",
    "--pte-loading-overlay-bg": "rgba(15, 23, 42, 0.7)",
    "--pte-loading-spinner-track-color": "#334155",
    "--pte-loading-spinner-head-color": "#60a5fa",
    "--pte-loading-label-color": "#e2e8f0",
    "--pte-column-drag-ghost-bg": "#1f2937",
    "--pte-column-drag-ghost-border-color": "#334155",
    "--pte-column-drag-ghost-text-color": "#e2e8f0",
    "--pte-menu-btn-hover-bg": "#334155",
    "--pte-not-allowed-icon-color": "#f87171",
    "--pte-sparkline-stroke-color": "#38bdf8",
    "--pte-sparkline-bar-color": "#60a5fa",
    "--pte-cell-flash-up-bg-color": "rgba(34, 197, 94, 0.55)",
    "--pte-cell-flash-down-bg-color": "rgba(239, 68, 68, 0.55)",
    "--pte-cell-flash-neutral-bg-color": "rgba(148, 163, 184, 0.45)",
    "--pte-action-frame-border-color": "#a78bfa",
    "--pte-action-frame-glow": "rgba(167, 139, 250, 0.3)",
    "--pte-action-frame-popover-bg": "#1e293b",
    "--pte-action-frame-popover-text-color": "#e2e8f0",
    "--pte-action-frame-popover-border-color": "#334155",
    "--pte-action-frame-popover-shadow": "0 8px 26px rgba(0, 0, 0, 0.6)",
    "--pte-action-frame-popover-radius": "8px",
    "--pte-action-frame-popover-width": "300px",
    "--pte-tooltip-bg": "#0f172a",
    "--pte-tooltip-text-color": "#e2e8f0",
    "--pte-tooltip-border-color": "#334155",
    "--pte-tooltip-shadow": "0 4px 14px rgba(0, 0, 0, 0.5)",
    "--pte-tooltip-max-width": "320px",
    "--pte-tooltip-radius": "6px",
    "--pte-scrollbar-gutter": "15px",
    "--pte-scrollbar-gutter-active": "15px",
    "--pte-scrollbar-lane-min": "12px",
    "--pte-scrollbar-radius": "10px",
    "--pte-scrollbar-size": "10px",
    "--pte-row-border-size": "1px",
    "--pte-pagination-footer-height": "49px",
    "--pte-column-panel-width": "304px",
    "--pte-column-panel-gutter-width": "36px",
    "--pte-rendered-header-height": "43px",
    "--pte-cell-flash-fade-duration": "1000ms",
    "--pte-root-border-radius": "8px",
    "--pte-root-border-width": "1px",
  },
});
