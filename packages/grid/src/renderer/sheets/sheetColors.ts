/**
 * The built-in palette behind the sheet tab menu's "Change color", and the swatch that presents an
 * entry in that menu.
 *
 * A tab wears its colour as a TINT — the stylesheet lays the raw colour over the tab's own fill at
 * low opacity — rather than as a solid fill. That is what keeps this list free of contrast duties:
 * the theme's label colour stays legible over every entry in light and in dark, no luminance test
 * picks a text colour, and an application-supplied colour outside this palette (a persisted sheet
 * can carry any CSS colour) behaves exactly like a built-in one. The colour appears at full
 * strength only in the swatch and in the active tab's underline, where no text sits on it.
 *
 * Twelve hues spaced around the wheel, at a saturation that survives being tinted to ~22% on a
 * near-white rail and on a near-black one.
 */
export interface SheetColor {
  /** Stable identity, for the menu item id. Not persisted — `GridSheet.color` stores the colour. */
  id: string;
  /** The menu item's label, and the swatch's accessible name. */
  name: string;
  color: string;
}

export const SHEET_COLORS: readonly SheetColor[] = [
  { id: "red", name: "Red", color: "#ef4444" },
  { id: "orange", name: "Orange", color: "#f97316" },
  { id: "amber", name: "Amber", color: "#f59e0b" },
  { id: "lime", name: "Lime", color: "#84cc16" },
  { id: "green", name: "Green", color: "#22c55e" },
  { id: "teal", name: "Teal", color: "#14b8a6" },
  { id: "cyan", name: "Cyan", color: "#06b6d4" },
  { id: "blue", name: "Blue", color: "#3b82f6" },
  { id: "indigo", name: "Indigo", color: "#6366f1" },
  { id: "violet", name: "Violet", color: "#8b5cf6" },
  { id: "pink", name: "Pink", color: "#ec4899" },
  { id: "gray", name: "Gray", color: "#64748b" },
];

/**
 * The colour chip for a "Change color" menu item, or — with no colour — the crossed-out chip that
 * stands for "None". Decorative: the item's own label is what names the colour to assistive tech,
 * so the chip is hidden from it rather than repeating that name.
 */
export function createSheetColorSwatch(color?: string): HTMLSpanElement {
  const swatch = document.createElement("span");
  swatch.className = "pte-sheet-color-swatch";
  if (color) swatch.style.backgroundColor = color;
  else swatch.classList.add("pte-sheet-color-swatch-none");
  swatch.setAttribute("aria-hidden", "true");
  return swatch;
}
