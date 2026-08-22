import { ChordSpec, matchesChord, parseChord } from "./keyChord";

/**
 * One row of the shortcut table (`api.getKeyboardShortcuts()`): a binding reduced to what a
 * discovery UI or a menu accelerator needs. `chord` is the exact-match spec — format it for the
 * user with `formatChord` — and is absent for pattern bindings (type-to-edit has no chord to name).
 */
export interface KeyboardShortcutInfo {
  id: string;
  scope: KeyboardScope;
  chord?: ChordSpec;
  label?: string;
  /** The menu command this binding accelerates (see {@link KeyboardBinding.command}). */
  command?: string;
}

/**
 * Where a binding lives. Resolution walks these innermost-first, so a chord can mean different
 * things in different scopes — `enter` activates a menu item, edits a body cell, and commits an
 * editor, and none of those is a conflict.
 *
 * - `editor`           — a cell editor is open and owns the keyboard.
 * - `embeddedControl`  — the event came from a form control inside the grid (filter inputs, the
 *                        quick-filter box, pagination controls).
 * - `appOverride`      — application bindings registered with `override: true`. Ahead of every
 *                        non-blocking built-in scope so an application can consciously shadow a
 *                        built-in chord, but never ahead of an open editor or a focused form
 *                        control, and reserved chords are refused before they can land here.
 * - `headerCursor`     — the header holds the keyboard cursor.
 * - `bodyCursor`       — the ordinary grid surface. Bindings here gate on an active cell themselves.
 * - `grid`             — whole-grid chords that do not depend on where the cursor is (Ctrl+F).
 * - `app`              — ordinary application-registered bindings; last, so they cannot shadow a
 *                        built-in.
 *
 * Overlays (menus, the filter popover, the action frame, tooltips) are deliberately absent: they
 * intercept on `document` in the capture phase, upstream of this router, and stop propagation for
 * the keys they claim. Giving them a scope here would let the shortcut-discovery UI list them, which
 * is the reason to do it eventually — not correctness.
 */
export type KeyboardScope =
  | "editor"
  | "embeddedControl"
  | "appOverride"
  | "headerCursor"
  | "bodyCursor"
  | "grid"
  | "app";

export interface KeyboardBinding {
  /** Stable identifier, unique per scope. Named in conflict errors and by the discovery UI. */
  id: string;
  /** The chord this binding claims. Mutually exclusive with `pattern`. */
  chord?: ChordSpec | string;
  /**
   * A key family too open to name as a chord — "any printable character" for type-to-edit. Patterns
   * are tried after every chord in their scope regardless of registration order, so a literal chord
   * always wins, and they are exempt from the duplicate-chord check (two patterns cannot be compared
   * statically).
   */
  pattern?: (e: KeyboardEvent) => boolean;
  scope: KeyboardScope;
  /** Human-readable action, for the planned shortcut reference. */
  label?: string;
  /**
   * The menu command this binding is the accelerator for (`"body.copy"`). Menus render the
   * binding's chord beside the item carrying the same command, so the two cannot drift. Only
   * meaningful for commands whose menu item carries no distinguishing payload — a command that
   * appears with several payloads (`sort.setMany` asc/desc) would show the chord on every variant.
   */
  command?: string;
  /**
   * Extra condition. Two bindings may share a chord within one scope only when at least one of
   * them is conditional — otherwise the second could never run and the router rejects it.
   */
  when?: (e: KeyboardEvent) => boolean;
  /**
   * Perform the action. Return `false` to decline after all, which continues resolution with the
   * next candidate — that is how "ArrowUp enters the header, or navigates if there is no header to
   * enter" stays two readable bindings instead of one branching one.
   */
  run: (e: KeyboardEvent) => boolean | void;
  /**
   * Whether a handled key is also `preventDefault`ed. Defaults to true. Set false where the browser
   * must still act on the key (a real `<button>` being activated by Enter).
   */
  preventDefault?: boolean;
}

export interface KeyboardScopeDef {
  scope: KeyboardScope;
  /** Is this scope active for this event? */
  isActive: (e: KeyboardEvent) => boolean;
  /**
   * When active, outer scopes are not consulted even if nothing here matches. An open editor and a
   * focused form control own their keyboard completely; a header cursor does not (a key with no
   * header meaning still reaches the grid's own chords).
   */
  blocking?: boolean;
}

interface RegisteredBinding extends KeyboardBinding {
  spec: ChordSpec | null;
}

function toSpec(chord: ChordSpec | string): ChordSpec {
  return typeof chord === "string" ? parseChord(chord) : chord;
}

function chordId(spec: ChordSpec): string {
  const part = (state: unknown) => state === "any" ? "any" : state === true ? "1" : "0";
  return `${spec.key}|${part(spec.mod)}|${part(spec.alt)}|${part(spec.shift)}`;
}

/**
 * The grid's keyboard bindings as data: one table, ordered scopes, and one dispatch point.
 *
 * Within a scope the first registered binding whose chord matches, whose `when` passes, and whose
 * `run` does not decline wins; patterns are tried after all chords. Across scopes, the innermost
 * active scope goes first.
 *
 * Registration is what makes a chord the grid's. Two unconditional bindings on the same chord in the
 * same scope are a programming error and throw on registration — that is the check the header's
 * Space family and the tree-navigation switch went without, which is how they came to share
 * `mod+shift+space` unnoticed.
 */
export class KeyboardRouter {
  private readonly byScope = new Map<KeyboardScope, RegisteredBinding[]>();
  private readonly ids = new Set<string>();

  constructor(private readonly scopes: readonly KeyboardScopeDef[]) {}

  register(bindings: readonly KeyboardBinding[]): void {
    for (const binding of bindings) this.registerOne(binding);
  }

  private registerOne(binding: KeyboardBinding): void {
    const key = `${binding.scope}:${binding.id}`;
    if (this.ids.has(key)) {
      throw new Error(`KeyboardRouter: duplicate binding id "${key}".`);
    }
    if ((binding.chord == null) === (binding.pattern == null)) {
      throw new Error(`KeyboardRouter: "${key}" must declare exactly one of \`chord\` or \`pattern\`.`);
    }
    const spec = binding.chord != null ? toSpec(binding.chord) : null;
    const registered: RegisteredBinding = { ...binding, spec };
    const list = this.byScope.get(binding.scope) ?? [];

    const clash = spec && list.find(other =>
      other.spec != null && chordId(other.spec) === chordId(spec)
      && other.when == null && registered.when == null);
    if (clash) {
      throw new Error(
        `KeyboardRouter: "${binding.id}" and "${clash.id}" both claim ${chordId(spec!)} in scope `
        + `"${binding.scope}" unconditionally, so one could never run. Give one a \`when\`, or make `
        + `them a single binding that branches.`,
      );
    }

    list.push(registered);
    // Registration order decides, with patterns last.
    //
    // Deliberately not "most specific chord first": specificity looks like the neutral rule but it
    // silently reorders intent. `enter` on a row-number cell selects the row, while `enter` on a data
    // cell starts an edit — the selection binding accepts Mod and Shift (it reads them for the
    // selection mode) and so is *less* specific than the bare edit chord, which would have won and
    // opened an editor on a cell that cannot be edited. The old `if` chain was an ordered list, and
    // an ordered list is what the author is actually writing.
    list.sort((a, b) => Number(a.spec == null) - Number(b.spec == null));
    this.byScope.set(binding.scope, list);
    this.ids.add(key);
  }

  /**
   * Remove a binding. Idempotent — application shortcuts are disposed from framework cleanup
   * callbacks (React effects run teardown twice under StrictMode), so a second dispose of the same
   * binding must be a no-op, not an error.
   */
  unregister(scope: KeyboardScope, id: string): void {
    const key = `${scope}:${id}`;
    if (!this.ids.delete(key)) return;
    const list = this.byScope.get(scope);
    if (!list) return;
    this.byScope.set(scope, list.filter(binding => binding.id !== id));
  }

  /** Every registered binding, outermost scope last. For diagnostics and the discovery UI. */
  getBindings(): readonly KeyboardBinding[] {
    return this.scopes.flatMap(({ scope }) => this.byScope.get(scope) ?? []);
  }

  /** {@link getBindings}, reduced to the public shortcut-table rows. */
  getShortcutInfo(): readonly KeyboardShortcutInfo[] {
    return this.scopes.flatMap(({ scope }) => (this.byScope.get(scope) ?? []).map(binding => ({
      id: binding.id,
      scope,
      chord: binding.spec ?? undefined,
      label: binding.label,
      command: binding.command,
    })));
  }

  /**
   * Resolve and run. Returns true when a binding claimed the key, which is also when
   * `preventDefault` has been called (unless the binding opted out).
   */
  handleKeyDown(e: KeyboardEvent): boolean {
    for (const { scope, isActive, blocking } of this.scopes) {
      if (!isActive(e)) continue;
      for (const binding of this.byScope.get(scope) ?? []) {
        const matched = binding.spec
          ? matchesChord(e, binding.spec)
          : binding.pattern!(e);
        if (!matched) continue;
        if (binding.when && !binding.when(e)) continue;
        if (binding.run(e) === false) continue;
        if (binding.preventDefault !== false) e.preventDefault();
        return true;
      }
      if (blocking) return false;
    }
    return false;
  }
}
