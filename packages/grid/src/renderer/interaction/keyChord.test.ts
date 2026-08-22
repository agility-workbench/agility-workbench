// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { canonicalKey, chordOf, formatChord, matchesChord, parseChord } from "./keyChord";

function key(init: Partial<KeyboardEventInit> & { key: string; code?: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("canonicalKey", () => {
  it("lowercases so a shifted letter is the same key", () => {
    expect(canonicalKey(key({ key: "A", shiftKey: true }))).toBe("a");
    expect(canonicalKey(key({ key: "a" }))).toBe("a");
  });

  it("names space, from either key or code", () => {
    expect(canonicalKey(key({ key: " ", code: "Space" }))).toBe("space");
    expect(canonicalKey(key({ key: "Unidentified", code: "Space" }))).toBe("space");
  });

  it("names the rest by key, lowercased", () => {
    expect(canonicalKey(key({ key: "ArrowUp" }))).toBe("arrowup");
    expect(canonicalKey(key({ key: "F2" }))).toBe("f2");
    expect(canonicalKey(key({ key: "PageDown" }))).toBe("pagedown");
  });
});

describe("chordOf", () => {
  it("orders modifiers canonically and collapses ctrl/cmd to mod", () => {
    expect(chordOf(key({ key: " ", code: "Space", ctrlKey: true, shiftKey: true })))
      .toBe("mod+shift+space");
    expect(chordOf(key({ key: " ", code: "Space", metaKey: true, shiftKey: true })))
      .toBe("mod+shift+space");
    expect(chordOf(key({ key: "ArrowDown", altKey: true }))).toBe("alt+arrowdown");
    expect(chordOf(key({ key: "F2" }))).toBe("f2");
  });
});

describe("matchesChord", () => {
  it("requires every unmentioned modifier to be absent — the whole point", () => {
    const ctrlSpace = key({ key: " ", code: "Space", ctrlKey: true });
    const ctrlShiftSpace = key({ key: " ", code: "Space", ctrlKey: true, shiftKey: true });

    expect(matchesChord(ctrlSpace, "mod+space")).toBe(true);
    // The regression this exists to prevent: Ctrl+Space must not claim Ctrl+Shift+Space.
    expect(matchesChord(ctrlShiftSpace, "mod+space")).toBe(false);
    expect(matchesChord(ctrlShiftSpace, "mod+shift+space")).toBe(true);
    expect(matchesChord(ctrlSpace, "mod+shift+space")).toBe(false);
  });

  it("rejects a chord with an extra alt", () => {
    expect(matchesChord(key({ key: "c", ctrlKey: true, altKey: true }), "mod+c")).toBe(false);
    expect(matchesChord(key({ key: "c", ctrlKey: true }), "mod+c")).toBe(true);
  });

  it("treats ctrl and cmd as the same modifier", () => {
    expect(matchesChord(key({ key: "a", metaKey: true }), "mod+a")).toBe(true);
    expect(matchesChord(key({ key: "a", ctrlKey: true }), "mod+a")).toBe(true);
    expect(matchesChord(key({ key: "a" }), "mod+a")).toBe(false);
  });

  it("accepts a modifier either way only where the spec says \"any\"", () => {
    const spec = { key: "home", mod: "any" as const, shift: "any" as const };

    expect(matchesChord(key({ key: "Home" }), spec)).toBe(true);
    expect(matchesChord(key({ key: "Home", shiftKey: true }), spec)).toBe(true);
    expect(matchesChord(key({ key: "Home", ctrlKey: true, shiftKey: true }), spec)).toBe(true);
    // alt is unmentioned, so it must still be absent.
    expect(matchesChord(key({ key: "Home", altKey: true }), spec)).toBe(false);
  });

  it("distinguishes bare and shifted forms of the same key", () => {
    expect(matchesChord(key({ key: "F2", shiftKey: true }), "shift+f2")).toBe(true);
    expect(matchesChord(key({ key: "F2", shiftKey: true }), "f2")).toBe(false);
    expect(matchesChord(key({ key: "F2" }), "f2")).toBe(true);
  });
});

describe("parseChord", () => {
  it("accepts platform aliases for the command modifier", () => {
    for (const chord of ["mod+a", "ctrl+a", "cmd+a", "meta+a"]) {
      expect(parseChord(chord)).toEqual({ key: "a", mod: true, alt: false, shift: false });
    }
  });

  it("defaults unmentioned modifiers to absent", () => {
    expect(parseChord("delete")).toEqual({ key: "delete", mod: false, alt: false, shift: false });
  });

  it("rejects a chord with no key", () => {
    expect(() => parseChord("mod+shift")).toThrow(/no key/);
  });
});

describe("formatChord", () => {
  it("spells modifiers per platform: HIG symbols on mac, Ctrl+Alt+Shift words elsewhere", () => {
    expect(formatChord("mod+shift+k", { mac: false })).toBe("Ctrl+Shift+K");
    expect(formatChord("mod+alt+shift+k", { mac: false })).toBe("Ctrl+Alt+Shift+K");
    // Apple's modifier order is Option, Shift, Command, with no separators.
    expect(formatChord("mod+shift+k", { mac: true })).toBe("⇧⌘K");
    expect(formatChord("mod+alt+shift+k", { mac: true })).toBe("⌥⇧⌘K");
  });

  it("renders arrows as glyphs on both platforms and names the other keys", () => {
    expect(formatChord("mod+arrowright", { mac: false })).toBe("Ctrl+→");
    expect(formatChord("mod+arrowright", { mac: true })).toBe("⌘→");
    expect(formatChord("pageup", { mac: false })).toBe("PgUp");
    expect(formatChord("space", { mac: true })).toBe("Space");
    expect(formatChord("shift+f2", { mac: false })).toBe("Shift+F2");
  });

  it("omits \"any\" modifiers — they are not part of the chord's identity", () => {
    expect(formatChord({ key: "enter", mod: "any", shift: "any" }, { mac: false })).toBe("Enter");
    expect(formatChord({ key: "home", mod: true, shift: "any" }, { mac: false })).toBe("Ctrl+Home");
  });
});
