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
   * Quick-filter find highlight. One color drives all three of its variables: the tint on every
   * matching cell (35% alpha), the stronger tint on the active match (65%), and that match's
   * outline (the color as given). An alpha in the input is multiplied through, so a translucent
   * color stays translucent.
   *
   * Unlike the other params this one derives values, so it needs a color it can read the channels
   * of: hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) or `rgb()` / `rgba()`. Anything else — a
   * named color, `hsl()`, `oklch()`, a gradient — is ignored with a console warning rather than
   * guessed at; set `--pte-find-match-bg-color`, `--pte-find-match-active-bg-color` and
   * `--pte-find-match-active-border-color` through `vars` to use those, or to choose the alphas
   * yourself.
   */
  findMatchColor?: string;
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
  /**
   * Data row height, in pixels (a number, or a `"42px"` string). Read when the grid is created and
   * applied like the `rowHeight` grid option; an explicit `rowHeight` grid option wins. Swapping the
   * theme on a mounted grid does not resize its rows — row height is fixed at creation.
   */
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
  /** Progress renderer (`cellRenderer: "progress"`) track color. */
  progressTrackColor?: string;
  /** Progress renderer bar color. */
  progressBarColor?: string;
  /** Rating renderer (`cellRenderer: "rating"`) filled-star color. */
  ratingColor?: string;
  /** Rating renderer empty-star color. */
  ratingEmptyColor?: string;
  /** Link renderer (`cellRenderer: "link"`) text color. */
  linkColor?: string;
  /** ActionFrame border color (frame around a cell with an open popover). */
  actionFrameBorderColor?: string;
  /** ActionFrame border glow color. */
  actionFrameGlowColor?: string;
  /**
   * ActionFrame popover background.
   *
   * Like every `actionFramePopover*` and `tooltip*` param, this also applies when the popover runs
   * with `actionFrameOptions.escapeRootClip: true` — see {@link GridThemeParams.actionFramePopoverWidth}.
   */
  actionFramePopoverBackgroundColor?: string;
  /** ActionFrame popover text color. */
  actionFramePopoverTextColor?: string;
  /** ActionFrame popover border color. */
  actionFramePopoverBorderColor?: string;
  /** ActionFrame popover shadow. */
  actionFramePopoverShadow?: string;
  /** ActionFrame popover border radius. */
  actionFramePopoverRadius?: string | number;
  /**
   * ActionFrame popover width.
   *
   * Theme params are delivered as inline `--pte-*` custom properties on the grid root. Layers that
   * are portaled out of the root — a popover or tooltip under `escapeRootClip`, and the column drag
   * ghost — get the same inline properties mirrored onto them while they are mounted (kept in sync
   * across `setTheme`), so every theme param applies to them exactly as inside the root. Under a
   * shadow-root mount they are portaled into the grid's own shadow root rather than
   * `document.body`, so the grid's stylesheet reaches them too.
   */
  actionFramePopoverWidth?: string | number;
  /**
   * Tooltip background color. Applies to tooltips portaled under `tooltipOptions.escapeRootClip`
   * too — see {@link GridThemeParams.actionFramePopoverWidth}.
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
  /**
   * Height of each header level, in pixels (a number, `"48"` or `"48px"`). Read once when the grid
   * is created, like `rowHeight`: it seeds the `headerHeight` grid option, which wins when both are
   * set, and swapping the theme on a mounted grid does not resize the header.
   */
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
  progressTrackColor: { vars: ["--pte-progress-track-color"] },
  progressBarColor: { vars: ["--pte-progress-bar-color"] },
  ratingColor: { vars: ["--pte-rating-color"] },
  ratingEmptyColor: { vars: ["--pte-rating-empty-color"] },
  linkColor: { vars: ["--pte-link-color"] },
  actionFrameBorderColor: { vars: ["--pte-action-frame-border-color"] },
  actionFrameGlowColor: { vars: ["--pte-action-frame-glow"] },
  actionFramePopoverBackgroundColor: { vars: ["--pte-action-frame-popover-bg"] },
  actionFramePopoverTextColor: { vars: ["--pte-action-frame-popover-text-color"] },
  actionFramePopoverBorderColor: { vars: ["--pte-action-frame-popover-border-color"] },
  actionFramePopoverShadow: { vars: ["--pte-action-frame-popover-shadow"] },
  actionFramePopoverRadius: { vars: ["--pte-action-frame-popover-radius"], px: true },
  actionFramePopoverWidth: { vars: ["--pte-action-frame-popover-width"], px: true },
  tooltipBackgroundColor: { vars: ["--pte-tooltip-bg"] },
  tooltipTextColor: { vars: ["--pte-tooltip-text-color"] },
  tooltipBorderColor: { vars: ["--pte-tooltip-border-color"] },
  tooltipRadius: { vars: ["--pte-tooltip-radius"], px: true },
  tooltipShadow: { vars: ["--pte-tooltip-shadow"] },
  tooltipMaxWidth: { vars: ["--pte-tooltip-max-width"], px: true },
  scrollbarRadius: { vars: ["--pte-scrollbar-radius"], px: true },
  scrollbarSize: { vars: ["--pte-scrollbar-size"], px: true },
  scrollbarGutter: { vars: ["--pte-scrollbar-gutter"], px: true },
  scrollbarGutterActive: { vars: ["--pte-scrollbar-gutter-active"], px: true },
  scrollbarLaneMin: { vars: ["--pte-scrollbar-lane-min"], px: true },
  rowBorderSize: { vars: ["--pte-row-border-size"], px: true },
  paginationFooterHeight: { vars: ["--pte-pagination-footer-height"], px: true },
  columnPanelWidth: { vars: ["--pte-column-panel-width"], px: true },
  columnPanelGutterWidth: { vars: ["--pte-column-panel-gutter-width"], px: true },
  headerHeight: { vars: ["--pte-header-height"], px: true },
  cellFlashFadeDuration: { vars: ["--pte-cell-flash-fade-duration"] },
  rootBorderRadius: { vars: ["--pte-root-border-radius"], px: true },
  rootBorderWidth: { vars: ["--pte-root-border-width"], px: true },
};

/** Colors already warned about, so a per-render resolve cannot spam the console. */
const warnedFindMatchColors = new Set<string>();

/** Trim trailing zeros off a derived alpha so the emitted value reads as authored. */
function round(alpha: number): string {
  return String(Math.round(alpha * 1000) / 1000);
}

/**
 * Read a color's channels, for the one param that has to derive values from them. Deliberately
 * narrow — hex and `rgb()`/`rgba()`, the forms the presets and app themes actually use — and null
 * for everything else rather than half-parsing a color space.
 */
function parseRgba(color: string): { r: number; g: number; b: number; a: number } | null {
  const value = color.trim();

  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    const digits = hex[1];
    // #rgb / #rgba expand each digit; #rrggbb / #rrggbbaa read pairs. Other lengths are invalid.
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b, a] = [...digits].map(d => parseInt(d + d, 16));
      return { r, g, b, a: digits.length === 4 ? a / 255 : 1 };
    }
    if (digits.length === 6 || digits.length === 8) {
      const pair = (i: number) => parseInt(digits.slice(i * 2, i * 2 + 2), 16);
      return { r: pair(0), g: pair(1), b: pair(2), a: digits.length === 8 ? pair(3) / 255 : 1 };
    }
    return null;
  }

  const fn = /^rgba?\(([^)]*)\)$/i.exec(value);
  if (!fn) return null;
  // Both syntaxes: "r, g, b, a" and the space-separated "r g b / a".
  const parts = fn[1].split("/").flatMap(part => part.trim().split(/[\s,]+/)).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const channel = (raw: string): number | null => {
    const num = parseFloat(raw);
    if (!Number.isFinite(num)) return null;
    const scaled = raw.trim().endsWith("%") ? (num / 100) * 255 : num;
    return Math.min(255, Math.max(0, Math.round(scaled)));
  };
  const [r, g, b] = [channel(parts[0]), channel(parts[1]), channel(parts[2])];
  if (r == null || g == null || b == null) return null;
  let a = 1;
  if (parts.length === 4) {
    const raw = parts[3].trim();
    const num = parseFloat(raw);
    if (!Number.isFinite(num)) return null;
    a = Math.min(1, Math.max(0, raw.endsWith("%") ? num / 100 : num));
  }
  return { r, g, b, a };
}

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

  // `findMatchColor` derives three values rather than fanning one out, so it is resolved here
  // instead of through FANOUT. Ignored (with one warning per distinct value) when the color's
  // channels cannot be read — better a working default than a highlight painted in a guess.
  if (params.findMatchColor != null) {
    const rgba = parseRgba(params.findMatchColor);
    if (rgba) {
      const { r, g, b, a } = rgba;
      out["--pte-find-match-bg-color"] = `rgba(${r}, ${g}, ${b}, ${round(a * 0.35)})`;
      out["--pte-find-match-active-bg-color"] = `rgba(${r}, ${g}, ${b}, ${round(a * 0.65)})`;
      out["--pte-find-match-active-border-color"] = params.findMatchColor;
    } else if (!warnedFindMatchColors.has(params.findMatchColor)) {
      warnedFindMatchColors.add(params.findMatchColor);
      console.warn(
        `theme: findMatchColor "${params.findMatchColor}" is not a hex or rgb()/rgba() color, so the `
        + "find-highlight tints cannot be derived from it; ignoring. Set --pte-find-match-bg-color, "
        + "--pte-find-match-active-bg-color and --pte-find-match-active-border-color through `vars` "
        + "instead.",
      );
    }
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

/** The atomic variables a semantic param writes — the fan-out table plus the three derived cases. */
function varsSetByParam(key: string): readonly PteVarName[] {
  if (key === "spacing") return [...FANOUT.cellHorizontalPadding.vars, ...FANOUT.cellVerticalPadding.vars];
  if (key === "findMatchColor") {
    return ["--pte-find-match-bg-color", "--pte-find-match-active-bg-color", "--pte-find-match-active-border-color"];
  }
  if (key === "borderLessGrid") return ["--pte-frame-border-color"];
  return FANOUT[key as keyof typeof FANOUT]?.vars ?? [];
}

/**
 * Later wins. A semantic param in `overrides` beats the base theme's raw `vars` for the variables
 * it fans out to, so `themeDark.withParams({ accentColor })` changes the accent even though
 * themeDark sets every value through `vars` — the documented usage. `overrides.vars` still wins
 * over everything, and `vars`/`icons` merge key-wise so a partial override never wipes the base.
 */
function mergeParams(base: GridThemeParams, overrides: GridThemeParams): GridThemeParams {
  const vars: NonNullable<GridThemeParams["vars"]> = { ...base.vars };
  for (const [key, value] of Object.entries(overrides)) {
    if (key === "vars" || key === "icons" || value == null) continue;
    for (const name of varsSetByParam(key)) delete vars[name];
  }
  Object.assign(vars, overrides.vars);
  return {
    ...base,
    ...overrides,
    vars,
    icons: { ...base.icons, ...overrides.icons },
  };
}

/** Layout lengths already warned about (per param), so a theme resolved per grid cannot spam. */
const warnedLayoutLengths = new Set<string>();

/**
 * Read a JS-driven layout length off a theme's resolved variables: a positive pixel length (a
 * number, `"42"` or `"42px"`), or `undefined` when the theme does not set one. Any other value
 * (`"3em"`, `calc(…)`) is ignored with one warning per distinct value.
 */
function resolveThemeLayoutPx(
  theme: GridTheme | undefined,
  varName: PteVarName,
  param: "rowHeight" | "headerHeight",
  what: string,
): number | undefined {
  const raw = theme?.toCssVars()[varName];
  if (raw == null) return undefined;
  const match = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/i.exec(raw);
  const px = match ? Number(match[1]) : NaN;
  if (Number.isFinite(px) && px > 0) return px;
  const key = `${param}:${raw}`;
  if (!warnedLayoutLengths.has(key)) {
    warnedLayoutLengths.add(key);
    console.warn(
      `theme: ${param} "${raw}" is not a positive pixel length, so it cannot size ${what}; `
      + `ignoring. Use a number of pixels (or set the \`${param}\` grid option).`,
    );
  }
  return undefined;
}

/**
 * The data-row height, in pixels, a theme asks for — or `undefined` when it does not set one.
 *
 * Row layout is JS-driven (virtualization needs the number, not a CSS length), so the theme's
 * `rowHeight` param cannot work as a CSS variable alone: the grid reads it here when it is created
 * and feeds it to the same path as the `rowHeight` grid option, which wins when both are set. It is
 * read off the resolved variables, so a `vars: { "--pte-row-height": … }` override counts too, with
 * the usual precedence. Only pixel lengths can drive the layout: a number, `"42"` or `"42px"`. Any
 * other value (`"3em"`, `calc(…)`) is ignored with one warning.
 */
export function resolveThemeRowHeightPx(theme: GridTheme | undefined): number | undefined {
  return resolveThemeLayoutPx(theme, "--pte-row-height", "rowHeight", "the rows");
}

/**
 * The header-level height, in pixels, a theme asks for — or `undefined` when it does not set one.
 *
 * The header is laid out in JS (one height per level), so, exactly like {@link
 * resolveThemeRowHeightPx}, the grid reads the theme's `headerHeight` param (or a `vars: {
 * "--pte-header-height": … }` override) once at creation and feeds it to the same path as the
 * `headerHeight` grid option, which wins when both are set. The leaf/parent level options fall
 * back to the result. Non-pixel values are ignored with one warning.
 */
export function resolveThemeHeaderHeightPx(theme: GridTheme | undefined): number | undefined {
  return resolveThemeLayoutPx(theme, "--pte-header-height", "headerHeight", "the header");
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
    "--pte-progress-track-color": "#334155",
    "--pte-progress-bar-color": "#60a5fa",
    "--pte-rating-color": "#fbbf24",
    "--pte-rating-empty-color": "#475569",
    "--pte-link-color": "#93c5fd",
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
    "--pte-cell-flash-fade-duration": "1000ms",
    "--pte-root-border-radius": "8px",
    "--pte-root-border-width": "1px",
  },
});
