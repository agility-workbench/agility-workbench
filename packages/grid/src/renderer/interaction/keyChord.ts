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

/** True on macOS (and iOS), where `mod` means Cmd and modifiers are shown as symbols. */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform
    ?? navigator.platform
    ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Display names for keys whose canonical name is not itself presentable. Arrows are glyphs on
 * every platform (they have no word form on a keycap); everything else is a word. */
const KEY_DISPLAY: Record<string, string> = {
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  space: "Space",
  escape: "Esc",
  enter: "Enter",
  tab: "Tab",
  home: "Home",
  end: "End",
  pageup: "PgUp",
  pagedown: "PgDn",
  delete: "Del",
  backspace: "Backspace",
};

function displayKey(key: string): string {
  // Single characters uppercase ("k" → "K"); anything else capitalizes ("f2" → "F2", "insert" →
  // "Insert").
  return KEY_DISPLAY[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

/**
 * A chord as the user should read it: `"mod+shift+k"` renders as `⇧⌘K` on macOS (HIG modifier
 * order — Option, Shift, Command — with no separators) and `Ctrl+Shift+K` elsewhere. Used by menu
 * accelerators and the planned shortcut reference. A modifier marked `"any"` is not part of the
 * chord's identity and is omitted. `mac` is overridable for tests and previews; it defaults to the
 * running platform.
 */
export function formatChord(chord: ChordSpec | string, opts: { mac?: boolean } = {}): string {
  const spec = typeof chord === "string" ? parseChord(chord) : chord;
  const mac = opts.mac ?? isMacPlatform();
  const held = (state: ModifierState | undefined) => state === true;
  if (mac) {
    return (held(spec.alt) ? "⌥" : "")
      + (held(spec.shift) ? "⇧" : "")
      + (held(spec.mod) ? "⌘" : "")
      + displayKey(spec.key);
  }
  const parts: string[] = [];
  if (held(spec.mod)) parts.push("Ctrl");
  if (held(spec.alt)) parts.push("Alt");
  if (held(spec.shift)) parts.push("Shift");
  parts.push(displayKey(spec.key));
  return parts.join("+");
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
