// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { KeyboardBinding, KeyboardRouter, KeyboardScopeDef } from "./keyboardRouter";

function key(init: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", { cancelable: true, ...init });
}

/** Scope chain shaped like the grid's, with each scope's activation under the test's control. */
function chain(active: Partial<Record<string, boolean>>): KeyboardScopeDef[] {
  return [
    { scope: "editor", isActive: () => active.editor === true, blocking: true },
    { scope: "embeddedControl", isActive: () => active.embeddedControl === true, blocking: true },
    { scope: "headerCursor", isActive: () => active.headerCursor === true },
    { scope: "bodyCursor", isActive: () => true },
    { scope: "grid", isActive: () => true },
    { scope: "app", isActive: () => true },
  ];
}

function binding(over: Partial<KeyboardBinding> & Pick<KeyboardBinding, "id" | "chord" | "scope">): KeyboardBinding {
  return { run: () => undefined, ...over };
}

describe("KeyboardRouter resolution", () => {
  it("runs the innermost active scope's binding and preventDefaults", () => {
    const header = vi.fn();
    const body = vi.fn();
    const router = new KeyboardRouter(chain({ headerCursor: true }));
    router.register([
      binding({ id: "header.space", chord: "space", scope: "headerCursor", run: header }),
      binding({ id: "body.space", chord: "space", scope: "bodyCursor", run: body }),
    ]);

    const event = key({ key: " ", code: "Space" });
    expect(router.handleKeyDown(event)).toBe(true);
    expect(header).toHaveBeenCalledOnce();
    expect(body).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("lets the same chord mean different things in different scopes", () => {
    const header = vi.fn();
    const body = vi.fn();
    const router = new KeyboardRouter(chain({ headerCursor: false }));
    router.register([
      binding({ id: "header.toggleColumn", chord: "mod+shift+space", scope: "headerCursor", run: header }),
      binding({ id: "body.treeNavMode", chord: "mod+shift+space", scope: "bodyCursor", run: body }),
    ]);

    // The real pair from the grid: with the cursor in the body, the body binding runs.
    router.handleKeyDown(key({ key: " ", code: "Space", ctrlKey: true, shiftKey: true }));
    expect(body).toHaveBeenCalledOnce();
    expect(header).not.toHaveBeenCalled();
  });

  it("falls through an outer scope when an inner one declines", () => {
    const body = vi.fn();
    const router = new KeyboardRouter(chain({ headerCursor: true }));
    router.register([
      binding({ id: "header.f2", chord: "f2", scope: "headerCursor", run: () => undefined }),
      binding({ id: "body.enter", chord: "enter", scope: "bodyCursor", run: body }),
    ]);

    // headerCursor is active but claims nothing here, and it is not blocking.
    expect(router.handleKeyDown(key({ key: "Enter" }))).toBe(true);
    expect(body).toHaveBeenCalledOnce();
  });

  it("stops at a blocking scope even when it claims nothing", () => {
    const body = vi.fn();
    const router = new KeyboardRouter(chain({ editor: true }));
    router.register([binding({ id: "body.copy", chord: "mod+c", scope: "bodyCursor", run: body })]);

    const event = key({ key: "c", ctrlKey: true });
    expect(router.handleKeyDown(event)).toBe(false);
    expect(body).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("resolves in registration order, not by how specific a chord looks", () => {
    const order: string[] = [];
    const router = new KeyboardRouter(chain({}));
    router.register([
      // The real pair this rule protects: "Enter selects the row under a row-number cursor" accepts
      // Mod/Shift because it reads them, so it is *less* specific than the bare "Enter edits the
      // cell" chord — and must still win, because it was registered first.
      binding({
        id: "body.rowNumberSelect", chord: { key: "enter", mod: "any", shift: "any" },
        scope: "bodyCursor", when: () => true, run: () => { order.push("select"); },
      }),
      binding({
        id: "body.editStart", chord: "enter",
        scope: "bodyCursor", run: () => { order.push("edit"); },
      }),
    ]);

    router.handleKeyDown(key({ key: "Enter" }));
    expect(order).toEqual(["select"]);
  });

  it("tries patterns after every chord in the scope, whatever the registration order", () => {
    const order: string[] = [];
    const router = new KeyboardRouter(chain({}));
    router.register([
      binding({
        id: "body.typeToEdit", pattern: (e) => e.key.length === 1,
        scope: "bodyCursor", run: () => { order.push("pattern"); },
      }),
      binding({ id: "body.copy", chord: "mod+c", scope: "bodyCursor", run: () => { order.push("copy"); } }),
    ]);

    router.handleKeyDown(key({ key: "c", ctrlKey: true }));
    expect(order).toEqual(["copy"]);

    router.handleKeyDown(key({ key: "c" }));
    expect(order).toEqual(["copy", "pattern"]);
  });

  it("rejects a binding that declares both a chord and a pattern, or neither", () => {
    const router = new KeyboardRouter(chain({}));
    expect(() => router.register([{
      id: "both", chord: "mod+c", pattern: () => true, scope: "bodyCursor", run: () => undefined,
    }])).toThrow(/exactly one of/);
    expect(() => router.register([{
      id: "neither", scope: "bodyCursor", run: () => undefined,
    }])).toThrow(/exactly one of/);
  });

  it("skips a binding whose `when` fails, and one whose `run` declines", () => {
    const ran: string[] = [];
    const router = new KeyboardRouter(chain({}));
    router.register([
      binding({
        id: "body.enterHeader", chord: "arrowup", scope: "bodyCursor",
        when: () => true,
        run: () => { ran.push("enterHeader"); return false; },
      }),
      binding({
        id: "body.navigate", chord: { key: "arrowup", mod: "any", shift: "any" },
        scope: "bodyCursor", run: () => { ran.push("navigate"); },
      }),
      binding({
        id: "body.never", chord: "arrowdown", scope: "bodyCursor",
        when: () => false, run: () => { ran.push("never"); },
      }),
    ]);

    router.handleKeyDown(key({ key: "ArrowUp" }));
    expect(ran).toEqual(["enterHeader", "navigate"]);

    expect(router.handleKeyDown(key({ key: "ArrowDown" }))).toBe(false);
    expect(ran).toEqual(["enterHeader", "navigate"]);
  });

  it("leaves preventDefault alone when a binding opts out", () => {
    const router = new KeyboardRouter(chain({}));
    router.register([binding({
      id: "menu.activate", chord: "enter", scope: "bodyCursor", preventDefault: false,
    })]);

    const event = key({ key: "Enter" });
    expect(router.handleKeyDown(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it("reports an unhandled key so a caller can leave it to the page", () => {
    const router = new KeyboardRouter(chain({}));
    router.register([binding({ id: "body.copy", chord: "mod+c", scope: "bodyCursor" })]);

    expect(router.handleKeyDown(key({ key: "c", ctrlKey: true, shiftKey: true }))).toBe(false);
  });
});

describe("KeyboardRouter registration", () => {
  it("rejects two unconditional claims on one chord in one scope", () => {
    const router = new KeyboardRouter(chain({}));
    router.register([binding({ id: "first", chord: "mod+shift+space", scope: "headerCursor" })]);

    expect(() => router.register([
      binding({ id: "second", chord: "mod+shift+space", scope: "headerCursor" }),
    ])).toThrow(/both claim .* unconditionally/);
  });

  it("allows a shared chord in one scope when a binding is conditional", () => {
    const router = new KeyboardRouter(chain({}));
    expect(() => router.register([
      binding({ id: "checkbox.toggle", chord: "space", scope: "bodyCursor", when: () => false }),
      binding({ id: "cell.edit", chord: "space", scope: "bodyCursor" }),
    ])).not.toThrow();
  });

  it("rejects a duplicate id within a scope", () => {
    const router = new KeyboardRouter(chain({}));
    expect(() => router.register([
      binding({ id: "dup", chord: "mod+c", scope: "bodyCursor" }),
      binding({ id: "dup", chord: "mod+x", scope: "bodyCursor" }),
    ])).toThrow(/duplicate binding id/);
  });

  it("lists bindings for diagnostics, outermost scope last", () => {
    const router = new KeyboardRouter(chain({}));
    router.register([
      binding({ id: "grid.quickFilter", chord: "mod+f", scope: "grid", label: "Quick filter" }),
      binding({ id: "body.copy", chord: "mod+c", scope: "bodyCursor", label: "Copy" }),
    ]);

    expect(router.getBindings().map(b => b.id)).toEqual(["body.copy", "grid.quickFilter"]);
    expect(router.getBindings()[1].label).toBe("Quick filter");
  });

  it("unregisters a binding, idempotently, freeing its id and chord for re-registration", () => {
    const router = new KeyboardRouter(chain({}));
    const first = vi.fn();
    router.register([binding({ id: "app.x", chord: "mod+shift+k", scope: "app", run: first })]);

    router.unregister("app", "app.x");
    router.unregister("app", "app.x"); // second dispose is a no-op, not an error
    expect(router.handleKeyDown(key({ key: "k", ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(first).not.toHaveBeenCalled();

    // Both the id and the unconditional chord claim are gone.
    const second = vi.fn();
    expect(() => router.register([
      binding({ id: "app.x", chord: "mod+shift+k", scope: "app", run: second }),
    ])).not.toThrow();
    expect(router.handleKeyDown(key({ key: "k", ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("reduces bindings to shortcut-table rows, chord-less for patterns", () => {
    const router = new KeyboardRouter(chain({}));
    router.register([
      binding({ id: "copy", chord: "mod+c", scope: "bodyCursor", label: "Copy", command: "body.copy" }),
      { id: "typeToEdit", pattern: () => false, scope: "bodyCursor", run: () => undefined },
    ]);

    const [copy, typeToEdit] = router.getShortcutInfo();
    expect(copy).toMatchObject({ id: "copy", scope: "bodyCursor", label: "Copy", command: "body.copy" });
    expect(copy.chord).toEqual({ key: "c", mod: true, alt: false, shift: false });
    expect(typeToEdit).toMatchObject({ id: "typeToEdit", scope: "bodyCursor" });
    expect(typeToEdit.chord).toBeUndefined();
  });
});
