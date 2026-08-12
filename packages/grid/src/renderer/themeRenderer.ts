import type { GridTheme } from "../theme/theme";

/**
 * Applies a {@link GridTheme}'s resolved `--pte-*` variables as inline styles.
 *
 * Variables are set on the grid root (which covers the grid and its menu overlays,
 * since those are children of the root) and on any registered external targets —
 * currently the filter overlay, which portals to `document.body` and so would not
 * otherwise inherit the root's variables.
 *
 * Tracks which properties it set so switching themes removes stale ones cleanly,
 * mirroring {@link IconRenderer}'s approach for icon variables.
 */
export class ThemeRenderer {
  private appliedVarNames = new Set<string>();
  private externalTargets = new Set<HTMLElement>();
  private currentVars: Record<string, string> = {};

  constructor(private root: HTMLElement) {}

  /** Register an element outside the root subtree that must also receive the theme
   * variables (e.g. a popup portaled to document.body). Idempotent. */
  registerTarget(el: HTMLElement) {
    this.externalTargets.add(el);
    this.applyToElement(el, this.currentVars, this.appliedVarNames);
  }

  setTheme(theme?: GridTheme) {
    const nextVars = theme ? theme.toCssVars() : {};
    const nextNames = new Set(Object.keys(nextVars));

    // Keep the Set iteration separate. Some downstream Babel configurations use
    // loose array-spread transforms, turning `[root, ...targets]` into
    // `[root].concat(targets)`. A Set is not concat-spreadable, so the Set itself
    // would be treated as a target and fail when accessing `.style`.
    this.reconcileElement(this.root, nextVars, nextNames);
    this.externalTargets.forEach((el) => {
      this.reconcileElement(el, nextVars, nextNames);
    });

    this.appliedVarNames = nextNames;
    this.currentVars = nextVars;
  }

  private reconcileElement(el: HTMLElement, vars: Record<string, string>, names: Set<string>) {
    // Remove properties that are no longer part of the theme.
    for (const name of this.appliedVarNames) {
      if (!names.has(name)) el.style.removeProperty(name);
    }
    for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
  }

  private applyToElement(el: HTMLElement, vars: Record<string, string>, names: Set<string>) {
    for (const name of names) el.style.removeProperty(name);
    for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
  }
}
