# Keyboard shortcut resolution by specificity

The design record for the grid's keyboard system: exact chord matching, the scoped router, the
public registration API, and the reservation policy. All three steps shipped (2026-08; the tracker
entry in [`planned-work.md`](planned-work.md) moved here). User-facing documentation lives in
`packages/grid/README.md` ("Keyboard bindings"); this file keeps the *why* and the traps.

## The problem

Keyboard bindings used to be ad-hoc `if` chains in three places (`renderer/selection/
selectionRenderer.ts`, `renderer/header/interactionHandler.ts`, and the Ctrl+F check in
`renderer/gridRenderer.ts`), matched by testing individual modifier flags. Two consequences:

- **Subset matching.** `ctrl && key === " "` also matches `Ctrl+Shift+Space`, so a chord could be
  absorbed by a binding that never meant to claim it. The live example: the header's four Space
  chords silently swallowed `Ctrl+Shift+Space`, the tree-data navigation mode switch.
- **Precedence by source-code order,** with no table to inspect, so a collision was invisible until
  someone pressed the keys.

## Step 1 — exact chord matching (`renderer/interaction/keyChord.ts`)

`canonicalKey` / `chordOf` / `parseChord` / `matchesChord` / `matchesAnyChord` / `anyModifiers`,
plus (added in step 3) `formatChord` / `isMacPlatform` for display. Matching is **exact**: a
modifier the spec does not mention must be absent, and `"any"` is the visible opt-in for a modifier
a binding reads for meaning (Shift extends a range, Mod jumps a block). There is deliberately no
textual form for `"any"` — ignoring a modifier is a decision worth spelling out as a field.

The rule to keep applying: **a modifier the branch reads becomes `"any"`; a modifier it never reads
must be absent.**

**Dismissal keys are matched by `e.key`, not by chord, on purpose** — Escape closing a menu,
popover, tooltip, action frame, or column panel should not depend on which modifiers are held, and
nothing competes for Escape while one of those is open. `anyModifiers()` exists for handlers that
match chords and need one permissive key alongside them (the cell editor's Escape).

## Step 2 — the scoped router (`renderer/interaction/keyboardRouter.ts`)

Bindings are data (`{id, chord | pattern, scope, when?, run, label?, command?, preventDefault?}`)
registered into an ordered scope chain; `GridRenderer.getKeyboardBindings()` exposes the table.

Scopes, innermost first: `editor` and `embeddedControl` are **blocking** (an open editor or a
focused form control owns the keyboard even for keys it does not claim), then `appOverride`
(application shortcuts with `override: true` — ahead of every built-in a user could mean to shadow,
behind the two blocking scopes), `headerCursor` (non-blocking), `bodyCursor`, `grid`, and `app`.

Resolution rules, in the order they matter:

1. Innermost active scope first; a blocking scope ends the walk.
2. Within a scope, **registration order** decides, with patterns after all chords.
3. `when` narrows a binding; `run` returning `false` declines and resolution continues.
4. Two *unconditional* bindings on the same chord in the same scope throw at registration.

Registration order — not "most specific chord first" — is deliberate and was proven by a test
failure: `Enter` selecting the row under a row-number cursor accepts Mod/Shift (it reads them for
the selection mode) and so looks *less* specific than the bare `Enter` that starts an edit, which
under specificity ordering won and opened an editor on a cell that cannot be edited. The old `if`
chain was an ordered list; an ordered list is what the author is writing.

Settled boundary decisions (each encoded as a binding or a consume, see the header keymap):

- **A chord may mean different things in different scopes** — that is the point of scoping.
- **Only a plain arrow crosses the header/body boundary, in either direction.** Header
  `Ctrl/Cmd+Arrow←/→` is an *edge* jump (a header cell has no value to scan, so a content-aware
  block jump has nothing to mean); header `Ctrl/Cmd+Arrow↓` is inert but *consumed*
  (`consumeModArrowDown`) — declining it would spawn a body cursor behind the header. A real
  header-to-body block jump was scoped and declined: it needs the header's cell value legislated,
  is region-locked (pinned-top bands collapse it to plain ArrowDown), and regresses SSRM and
  grouped data.
- **`Alt+Arrow` is released in the body** — it behaved as a plain arrow, so consuming it silently
  overrode the browser's back/forward gesture and gave nothing back. If Alt is ever wanted,
  `Alt+Arrow↓` = "open this column's filter/menu" is the coherent candidate (matches the header and
  Excel/Sheets).

**Overlays are deliberately outside the router.** Menus, the filter popover, the action frame,
tooltips, and the column panel intercept on `document` in the capture phase, upstream of the
router, and stop propagation for the keys they claim. Correctness does not need them migrated; an
`overlay` scope is worth adding eventually only so the discovery UI can list them.

## The keyboard surface is configuration (shipped with step 3)

`cellSelection` governs the body cursor: with `false` or `"text"`, the `bodyCursor` scope's
`isActive` is false and everything in it — navigation, paging, select-all, clipboard, editing keys,
keyboard row selection — goes dark as a unit, because all of it operates on or through the cursor.
(Before this, the option only gated the mouse while its doc claimed more; `navigateHeader("down")`
also refuses the body handoff now, and the tree-data chevron click no longer seeds a cursor.)

`headerKeyboardNavigation` (default `true`) governs the header cursor, enforced at the single choke
point `GridCore.setHeaderFocus` — which covers root-focus seeding, ArrowUp entry, header clicks,
and the API. `tryEnterHeaderFromTop` also declines explicitly so a refused focus is not a consumed
keystroke. A runtime flip to `false` evicts a cursor already in the header (`setRuntimeOptions`).
It exists as its own switch because tying header navigation to `cellSelection` would make sorting
and column menus mouse-only on every read-only-but-sortable grid — a WCAG 2.1.1 failure — and would
take the columnheader walk away from screen readers.

## Step 3 — public registration (`renderer/interaction/shortcutPolicy.ts`)

`api.registerShortcut(shortcut): () => void` takes `{id, chord, run, label?, when?, override?,
preventDefault?}` — string chords only (no patterns, no `"any"`). `AppShortcutRegistry` validates
and registers into `app` / `appOverride`; disposal is idempotent (React StrictMode replays
cleanup). `api.getKeyboardShortcuts()` returns the whole table as
`{id, scope, chord?, label?, command?}` rows.

**Reservation is a predicate over the live configuration, not a list** (`reservedChordReason`):

- Tab and Escape: reserved always. Neither is even in the router — Tab is focus traversal in/out of
  the grid (activedescendant model), Escape belongs to the upstream overlay dismissal handlers.
- Arrows, Home/End, Enter, Space: reserved **by key, under any modifiers**, while
  `cellSelection === true` *or* header keyboard navigation is on. PageUp/PageDown: body-only, so
  only while `cellSelection === true`.
- The clipboard triple (`mod+c/x/v`) is *not* reserved: losing copy loses a feature, not the
  interaction model, so it is an ordinary built-in an application may shadow with `override: true`.

Reservation is enforced twice, on purpose: a **throw at registration** (a reserved chord is a
programming mistake the application should hear immediately, with the owning feature and the switch
that frees it named in the message), and a **guard folded into the binding's `when`** — options
change at runtime, so a shortcut that was legal when registered goes dormant while the claiming
feature is re-enabled and wakes when it is off again. Built-ins always win without any crash.

Also refused: `mod+alt+<printable single character>` — Windows AltGr reports as Ctrl+Alt, so such a
chord fires while a user types accented characters (`mod+alt+F6` stays legal); duplicate live ids
(one namespace across both app scopes); duplicate unconditional chords (re-created in the registry,
because the reservation guard makes every app binding look conditional to the router's own check).

## Menu accelerators (step 3, display side)

`MenuItem.shortcut` is a **display hint only** — menus are built per open, so accelerators cannot
be harvested from an item list; the binding is registered separately and the author writes the same
chord in both places. Built-in items need no hint: a binding carrying `command` (the clipboard
triple carries `body.copy/cut/paste`) is found by `MenuRenderer`'s `shortcutForCommand` lookup and
rendered automatically, so menu and keymap cannot drift. Precedence in the right slot: submenu
arrow > explicit `right` > `shortcut` hint > command lookup. The span (`pte-menu-item-shortcut`) is
`aria-hidden`; the accessible path to bindings is the shortcut reference.

**Trap:** only payload-free commands may be tagged on bindings. A command that appears with several
payloads (`sort.setMany` asc/desc) would show the same chord on every variant.

## Where things live

- `renderer/interaction/keyChord.ts` — matching + `formatChord`/`isMacPlatform` (exported).
- `renderer/interaction/keyboardRouter.ts` — scopes, resolution, `unregister`, `getShortcutInfo`.
- `renderer/interaction/shortcutPolicy.ts` — `reservedChordReason`, `GridShortcut`,
  `AppShortcutRegistry`.
- Wiring: `GridRenderer.buildKeyboardRouter` (scope chain + registry) and the attach-time
  `setShortcutController` probe into `GridAPI`.
- Tests: `api/api.shortcuts.test.ts` (end-to-end), `renderer/menuRenderer.shortcuts.test.ts`
  (accelerators), `renderer/interaction/*.test.ts` (units).

## What remains (not scoped)

- The in-grid shortcut-reference *panel* — a filtered view of `api.getKeyboardShortcuts()` by live
  context. The README's "Keyboard-shortcut discovery" section states the requirements.
- An `overlay` scope, only so the discovery UI can list overlay keys.
