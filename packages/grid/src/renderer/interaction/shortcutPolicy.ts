import type { CellSelectionMode } from "../../interfaces/gridOptions";
import { parseChord, type ChordSpec } from "./keyChord";
import type { KeyboardRouter, KeyboardScope } from "./keyboardRouter";

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

/**
 * An application keyboard shortcut (`api.registerShortcut`).
 *
 * Chords are strings only (`"mod+k"`): no patterns, and no `"any"` modifiers — an application
 * shortcut claims exactly one chord. Reserved chords are refused with an error naming the feature
 * that owns them (see {@link reservedChordReason}); everything else registers below the grid's own
 * bindings, or above them with `override: true`.
 */
export interface GridShortcut {
  /** Stable identifier, unique among the application's live shortcuts. */
  id: string;
  /** The chord, e.g. `"mod+k"` or `"shift+f6"`. Modifiers: `mod` (Ctrl/Cmd), `alt`, `shift`. */
  chord: string;
  /** Perform the action. Return `false` to decline, which continues resolution as if unmatched. */
  run: (e: KeyboardEvent) => boolean | void;
  /** Human-readable action, shown by shortcut-discovery UIs. */
  label?: string;
  /** Extra condition; the shortcut is skipped while it returns false. */
  when?: (e: KeyboardEvent) => boolean;
  /**
   * Claim precedence over the grid's own bindings (an `appOverride` binding runs before
   * `headerCursor`/`bodyCursor`/`grid` ones). Never beats an open cell editor or a focused form
   * control, and reserved chords are refused regardless.
   */
  override?: boolean;
  /** Whether a handled key is also `preventDefault`ed. Defaults to true. */
  preventDefault?: boolean;
}

/** Canonical text form of a parsed app chord (no `"any"` states, so it is total). */
function chordKeyOf(spec: ChordSpec): string {
  return [spec.mod && "mod", spec.alt && "alt", spec.shift && "shift", spec.key]
    .filter(Boolean).join("+");
}

/**
 * Registration front door for application shortcuts. Validates against the policy above, then
 * registers into the router's `app` / `appOverride` scope.
 *
 * Reservation is enforced twice, on purpose:
 * - at registration, as a thrown error — a reserved chord is a programming mistake the application
 *   should hear about immediately, not a warning to scroll past;
 * - at dispatch, folded into the binding's `when` — options can change after registration
 *   (`updateGridOptions({ cellSelection: true })`), and a shortcut that was legal when registered
 *   goes dormant while the feature that claims its chord is on, then wakes when it is off again.
 */
export class AppShortcutRegistry {
  /** Live shortcut ids, across both app scopes — one namespace, so a dispose can't be dodged. */
  private readonly liveIds = new Set<string>();
  /** `scope:chord` of live shortcuts with no `when`, for the duplicate-unconditional check. */
  private readonly unconditional = new Map<string, string>();

  constructor(
    private readonly router: KeyboardRouter,
    private readonly options: () => ShortcutReservationOptions,
  ) {}

  register(shortcut: GridShortcut): () => void {
    const { id } = shortcut;
    if (!id) {
      throw new Error("registerShortcut: a shortcut needs a non-empty `id`.");
    }
    if (this.liveIds.has(id)) {
      throw new Error(`registerShortcut: a shortcut with id "${id}" is already registered. `
        + "Dispose the previous one first (registerShortcut returns the disposer).");
    }
    if (typeof shortcut.chord !== "string") {
      throw new Error(`registerShortcut("${id}"): \`chord\` must be a string like "mod+k".`);
    }
    const spec = parseChord(shortcut.chord);

    const reserved = reservedChordReason(spec, this.options());
    if (reserved) {
      throw new Error(`registerShortcut("${id}"): ${reserved}`);
    }
    // Windows AltGr reports as Ctrl+Alt, so a mod+alt chord on a printable key would fire while a
    // user merely types an accented or symbol character through AltGr.
    if (spec.mod === true && spec.alt === true && spec.key.length === 1) {
      throw new Error(`registerShortcut("${id}"): mod+alt+<character> chords are refused — `
        + `Windows AltGr reports as Ctrl+Alt, so this would fire while a user types "${spec.key}" `
        + "through AltGr. Pick a non-printable key (mod+alt+F6) or different modifiers.");
    }

    const scope: KeyboardScope = shortcut.override ? "appOverride" : "app";
    // The router's own duplicate-unconditional check cannot see app bindings (the reservation
    // guard below makes every one of them conditional), so the same rule is enforced here.
    const chordKey = `${scope}:${chordKeyOf(spec)}`;
    if (!shortcut.when) {
      const clash = this.unconditional.get(chordKey);
      if (clash) {
        throw new Error(`registerShortcut("${id}"): "${clash}" already claims ${chordKeyOf(spec)} `
          + `in scope "${scope}" unconditionally, so one of the two could never run. Give one a `
          + "`when`, or dispose the other first.");
      }
      this.unconditional.set(chordKey, id);
    }

    this.router.register([{
      id,
      chord: spec,
      scope,
      label: shortcut.label,
      preventDefault: shortcut.preventDefault,
      when: (e) =>
        reservedChordReason(spec, this.options()) == null && (shortcut.when?.(e) ?? true),
      run: shortcut.run,
    }]);
    this.liveIds.add(id);

    // Idempotent, like the router's unregister: framework cleanup may run twice.
    return () => {
      if (!this.liveIds.delete(id)) return;
      if (this.unconditional.get(chordKey) === id) this.unconditional.delete(chordKey);
      this.router.unregister(scope, id);
    };
  }
}
