/**
 * Keystroke matching for the grid's keyboard bindings.
 *
 * Every binding used to test the modifier flags it cared about and ignore the rest, which made a
 * chord match any superset of itself: `ctrl && e.key === " "` also fires for Ctrl+Shift+Space, so a
 * chord could be absorbed by a binding that never meant to claim it. Matching here is **exact** —
 * a modifier the spec does not mention must be absent — so a superset only matches when a binding
 * says so, with `"any"`, in one visible place.
 *
 * `mod` collapses Ctrl and Cmd, matching how the grid has always read them (`ctrlKey || metaKey`):
 * one binding covers both platforms, and no binding distinguishes them today.
 */

/** A modifier requirement: must be held, must not be held, or explicitly ignored. */
export type ModifierState = boolean | "any";

export interface ChordSpec {
  /** Canonical key name — see {@link canonicalKey}. Lowercase. */
  key: string;
  /** Ctrl on Windows/Linux, Cmd on macOS. Either flag satisfies it. Defaults to "must be absent". */
  mod?: ModifierState;
  alt?: ModifierState;
  shift?: ModifierState;
}

/**
 * The event's key as bindings name it: lowercase `e.key`, so letters and digits follow the user's
 * keyboard layout rather than physical position. Space is the one key read from `e.code` as well,
 * because `e.key` for it is a single space that reads as whitespace at every call site.
 */
export function canonicalKey(e: KeyboardEvent): string {
  if (e.key === " " || e.code === "Space") return "space";
  return e.key.toLowerCase();
}

/** True when `e` carries the platform's command modifier. */
export function hasMod(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey;
}

/**
 * Canonical text form of the keystroke: modifiers in a fixed order, then the key —
 * `"mod+shift+space"`, `"alt+arrowdown"`, `"f2"`. Stable enough to use as a registry key or to
 * print in a diagnostic; `parseChord` is its inverse for the exact-match case.
 */
export function chordOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (hasMod(e)) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(canonicalKey(e));
  return parts.join("+");
}

/**
 * Parse `"mod+shift+space"` into a spec whose unmentioned modifiers must be absent. There is no
 * textual form for `"any"` on purpose: ignoring a modifier is a decision worth spelling out as a
 * field, next to the comment explaining why.
 */
export function parseChord(chord: string): ChordSpec {
  const parts = chord.toLowerCase().split("+").map(part => part.trim()).filter(Boolean);
  const spec: ChordSpec = { key: "", mod: false, alt: false, shift: false };
  for (const part of parts) {
    if (part === "mod" || part === "ctrl" || part === "cmd" || part === "meta") spec.mod = true;
    else if (part === "alt" || part === "option") spec.alt = true;
    else if (part === "shift") spec.shift = true;
    else spec.key = part === " " ? "space" : part;
  }
  if (!spec.key) throw new Error(`parseChord: no key in chord "${chord}"`);
  return spec;
}

function modifierMatches(required: ModifierState | undefined, actual: boolean): boolean {
  if (required === "any") return true;
  return actual === (required ?? false);
}

/**
 * Does `e` match this chord? Pass a string for an exact match, or a spec to mark a modifier `"any"`
 * where a binding reads it for meaning rather than identity (Shift extends a range, Ctrl jumps a
 * block) and so must accept it either way.
 */
export function matchesChord(e: KeyboardEvent, chord: ChordSpec | string): boolean {
  const spec = typeof chord === "string" ? parseChord(chord) : chord;
  return canonicalKey(e) === spec.key
    && modifierMatches(spec.mod, hasMod(e))
    && modifierMatches(spec.alt, e.altKey)
    && modifierMatches(spec.shift, e.shiftKey);
}

/** True when `e` matches any of the chords — for key families that share one handler. */
export function matchesAnyChord(e: KeyboardEvent, chords: readonly (ChordSpec | string)[]): boolean {
  return chords.some(chord => matchesChord(e, chord));
}

/**
 * A key matched whatever modifiers are held.
 *
 * Reserved for **dismissal**: Escape closing a menu, popover, or editor should not depend on whether
 * the user happens to be holding Shift, and nothing competes for Escape while one of those is open.
 * The dismissal handlers that predate chord matching (the menu's document-capture handler, the
 * action frame, the filter overlay, the tooltip, the column panel) test `e.key` directly for the
 * same reason and are deliberately left that way; use this where a handler that does match chords
 * needs one permissive key alongside them.
 */
export function anyModifiers(key: string): ChordSpec {
  return { key, mod: "any", alt: "any", shift: "any" };
}
