// Helpers for applying user-supplied conditional classes / inline styles (getRowClass, getRowStyle,
// cellClass, cellStyle) to POOLED DOM elements. Because row/cell elements are recycled as the user
// scrolls, each repaint must first remove whatever this feature applied last time before applying
// the new result — otherwise stale classes/styles leak onto reused elements. We track the previously
// applied tokens/properties on the element itself (dataset + a property list) so the diff is exact
// and never touches classes/styles the grid manages elsewhere.

const CLASS_KEY = "pteDynClass";      // dataset key holding the space-joined applied class tokens
const STYLE_KEY = "pteDynStyleProps"; // dataset key holding the comma-joined applied style props

/** Normalize a class result (string | string[] | falsy) to a clean token array. */
function toClassTokens(result: string | string[] | null | undefined): string[] {
  if (!result) return [];
  const raw = Array.isArray(result) ? result : [result];
  return raw
    .flatMap(s => (typeof s === "string" ? s.split(/\s+/) : []))
    .filter(Boolean);
}

/**
 * Apply dynamic class tokens to `el`, removing any previously applied by this helper first. Only the
 * tokens this helper added are touched; grid-managed classes (pte-row, selection, zebra, …) are left
 * alone because they were never recorded here.
 */
export function applyDynamicClasses(el: HTMLElement, result: string | string[] | null | undefined): void {
  const prev = el.dataset[CLASS_KEY];
  if (prev) {
    for (const t of prev.split(" ")) if (t) el.classList.remove(t);
  }
  const tokens = toClassTokens(result);
  if (tokens.length) {
    el.classList.add(...tokens);
    el.dataset[CLASS_KEY] = tokens.join(" ");
  } else if (prev) {
    delete el.dataset[CLASS_KEY];
  }
}

/**
 * Apply dynamic inline styles to `el`, clearing any previously applied by this helper first (so a
 * property that stops being returned is removed). Only properties this helper set are cleared.
 */
export function applyDynamicStyles(el: HTMLElement, result: Partial<CSSStyleDeclaration> | null | undefined): void {
  const prev = el.dataset[STYLE_KEY];
  if (prev) {
    for (const p of prev.split(",")) if (p) (el.style as any)[p] = "";
  }
  const applied: string[] = [];
  if (result) {
    for (const key of Object.keys(result)) {
      const value = (result as any)[key];
      if (value == null || value === "") continue;
      (el.style as any)[key] = value;
      applied.push(key);
    }
  }
  if (applied.length) {
    el.dataset[STYLE_KEY] = applied.join(",");
  } else if (prev) {
    delete el.dataset[STYLE_KEY];
  }
}
