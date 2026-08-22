import { describe, expect, it } from "vitest";
import { parseChord } from "./keyChord";
import { reservedChordReason, type ShortcutReservationOptions } from "./shortcutPolicy";

const both: ShortcutReservationOptions = { cellSelection: true, headerKeyboardNavigation: true };
const headerOnly: ShortcutReservationOptions = { cellSelection: false, headerKeyboardNavigation: true };
const bodyOnly: ShortcutReservationOptions = { cellSelection: true, headerKeyboardNavigation: false };
const neither: ShortcutReservationOptions = { cellSelection: false, headerKeyboardNavigation: false };
const textMode: ShortcutReservationOptions = { cellSelection: "text", headerKeyboardNavigation: false };

const reason = (chord: string, options: ShortcutReservationOptions) =>
  reservedChordReason(parseChord(chord), options);

describe("reservedChordReason", () => {
  it("reserves Tab and Escape in every configuration", () => {
    for (const options of [both, headerOnly, bodyOnly, neither]) {
      expect(reason("tab", options)).toMatch(/Tab/);
      expect(reason("shift+tab", options)).toMatch(/Tab/);
      expect(reason("escape", options)).toMatch(/Escape/);
    }
  });

  it("reserves the navigation cluster by key, whatever the modifiers, while either surface is on", () => {
    for (const chord of ["arrowdown", "mod+arrowdown", "mod+shift+arrowleft", "home", "end", "enter", "space"]) {
      expect(reason(chord, both)).toMatch(/claimed by/);
      expect(reason(chord, headerOnly)).toMatch(/header navigation \(headerKeyboardNavigation\)/);
      expect(reason(chord, bodyOnly)).toMatch(/cell navigation \(cellSelection\)/);
      expect(reason(chord, neither)).toBeNull();
    }
    // A reason under `both` names both owners.
    expect(reason("arrowdown", both)).toMatch(/cell navigation.*and.*header navigation/);
  });

  it("reserves paging only for the body: the header is a single row", () => {
    for (const chord of ["pageup", "pagedown"]) {
      expect(reason(chord, both)).toMatch(/cellSelection/);
      expect(reason(chord, headerOnly)).toBeNull();
      expect(reason(chord, neither)).toBeNull();
    }
  });

  it("treats \"text\" cell selection as off — the body cursor does not exist there", () => {
    expect(reason("arrowdown", textMode)).toBeNull();
    expect(reason("pagedown", textMode)).toBeNull();
  });

  it("does not reserve the clipboard triple — losing copy loses a feature, not the interaction model", () => {
    for (const chord of ["mod+c", "mod+x", "mod+v", "mod+a", "mod+z", "mod+f", "f2"]) {
      expect(reason(chord, both)).toBeNull();
    }
  });
});
