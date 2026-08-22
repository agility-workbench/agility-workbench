import type { CellSelectionMode } from "../../interfaces/gridOptions";
import type { ChordSpec } from "./keyChord";

/** The two switches that decide which keys the grid's own navigation currently claims. */
export interface ShortcutReservationOptions {
  cellSelection: CellSelectionMode;
  headerKeyboardNavigation: boolean;
}

/**
 * Why a chord is off-limits to application shortcuts right now, or null when it is free.
 *
 * "Reserved" is a predicate over the live configuration, not a list: a chord is reserved exactly
 * while some built-in surface claims it, and disabling that surface frees the chord — no
 * `override` involved. Reservation is by *key*, whatever the modifiers: the navigation keys read
 * Mod and Shift for meaning (extend a range, jump a block), so every modifier combination on them
 * belongs to the grid while the surface is on.
 *
 * Two keys are unconditional. Tab is how focus enters and leaves the grid (the activedescendant
 * model keeps DOM focus on the root, so Tab is the only way out), and Escape is dismissal for
 * menus, popovers, and editors — both upstream of the router, in handlers a binding could never
 * legally shadow.
 *
 * The clipboard triple (mod+c/x/v) is deliberately NOT here: losing copy loses a feature, not the
 * interaction model, so those chords are ordinary built-ins an application may shadow with
 * `override: true`.
 */
const NAV_KEYS = ["arrowup", "arrowdown", "arrowleft", "arrowright", "home", "end", "enter", "space"];

export function reservedChordReason(
  spec: ChordSpec,
  options: ShortcutReservationOptions,
): string | null {
  const key = spec.key;

  if (key === "tab") {
    return "Tab moves focus in and out of the grid and can never be bound.";
  }
  if (key === "escape") {
    return "Escape dismisses menus, popovers, and editors and can never be bound.";
  }

  const bodyCursor = options.cellSelection === true;
  const headerCursor = options.headerKeyboardNavigation;

  if (NAV_KEYS.includes(key) && (bodyCursor || headerCursor)) {
    const owners = [
      bodyCursor ? "cell navigation (cellSelection)" : null,
      headerCursor ? "header navigation (headerKeyboardNavigation)" : null,
    ].filter(Boolean).join(" and ");
    return `"${key}" is claimed by ${owners}; disabling those frees it.`;
  }

  // Paging is body-only: the header is a single row, so these keys have no header meaning.
  if ((key === "pageup" || key === "pagedown") && bodyCursor) {
    return `"${key}" is claimed by cell navigation (cellSelection); disabling it frees the key.`;
  }

  return null;
}
