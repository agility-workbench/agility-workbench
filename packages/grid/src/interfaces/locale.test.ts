import { describe, expect, it, vi } from "vitest";
import {
  createLocaleTextResolver,
  DEFAULT_LOCALE_TEXT,
  defaultLocaleText,
  type GridLocaleKey,
  type GridLocaleText,
  interpolateLocaleText,
  localeTextFromApi,
  pluralLocaleText,
  resolveLocaleText,
} from "./locale";
import { AGGREGATE_TYPE_LABELS, aggregateTypeLabel, AggregateType, allAggregateTypes } from "./aggregate";
import { SHEET_COLORS, localizedSheetColors } from "../renderer/sheets/sheetColors";

const keys = Object.keys(DEFAULT_LOCALE_TEXT) as GridLocaleKey[];

describe("DEFAULT_LOCALE_TEXT", () => {
  it("has a non-empty English string for every key", () => {
    expect(keys.length).toBeGreaterThan(300);
    for (const key of keys) {
      expect(typeof DEFAULT_LOCALE_TEXT[key], key).toBe("string");
      expect(DEFAULT_LOCALE_TEXT[key].length, key).toBeGreaterThan(0);
    }
  });

  it("agrees with GridLocaleText (the annotation checks both ways at compile time)", () => {
    // A key in the type but not the object, or the reverse, fails to typecheck; this pins the
    // runtime object to the same set so a cast cannot sneak a gap past it.
    const asType: Record<keyof GridLocaleText, string> = DEFAULT_LOCALE_TEXT;
    expect(Object.keys(asType).sort()).toEqual(keys.slice().sort());
  });

  it("pairs every …One key with an …Other key", () => {
    for (const key of keys) {
      if (key.endsWith("One")) expect(keys, key).toContain(`${key.slice(0, -3)}Other`);
    }
  });

  it("names every built-in aggregate type and sheet colour", () => {
    for (const type of allAggregateTypes()) {
      expect(aggregateTypeLabel(type)).toBe(AGGREGATE_TYPE_LABELS[type]);
    }
    expect(AGGREGATE_TYPE_LABELS[AggregateType.AVG]).toBe("Average");
    expect(localizedSheetColors(defaultLocaleText).map(c => c.name)).toEqual(SHEET_COLORS.map(c => c.name));
  });
});

describe("resolveLocaleText", () => {
  it("falls back to the English default", () => {
    expect(resolveLocaleText(undefined, "rowsPerPage")).toBe("Rows per page");
    expect(resolveLocaleText({}, "rowsPerPage")).toBe("Rows per page");
    expect(resolveLocaleText({ localeText: { page: "Seite" } }, "rowsPerPage")).toBe("Rows per page");
  });

  it("prefers a localeText entry; null/undefined fall through, an empty string is honoured", () => {
    expect(resolveLocaleText({ localeText: { rowsPerPage: "Zeilen pro Seite" } }, "rowsPerPage")).toBe("Zeilen pro Seite");
    expect(resolveLocaleText({ localeText: { rowsPerPage: undefined } }, "rowsPerPage")).toBe("Rows per page");
    expect(resolveLocaleText({ localeText: { rowsPerPage: null as any } }, "rowsPerPage")).toBe("Rows per page");
    expect(resolveLocaleText({ localeText: { rowsPerPage: "" } }, "rowsPerPage")).toBe("");
  });

  it("lets getLocaleText win, handing it the map's text (uninterpolated) and the values", () => {
    const getLocaleText = vi.fn(({ key, defaultValue }) => key === "page" ? "Blatt" : defaultValue);
    const source = { localeText: { pageOfTotal: "Seite {page} von {total}" }, getLocaleText };
    expect(resolveLocaleText(source, "page")).toBe("Blatt");
    expect(resolveLocaleText(source, "pageOfTotal", { page: 2, total: 7 })).toBe("Seite 2 von 7");
    expect(getLocaleText).toHaveBeenLastCalledWith({
      key: "pageOfTotal",
      defaultValue: "Seite {page} von {total}",
      variableValues: { page: 2, total: 7 },
    });
  });

  it("interpolates what the callback returns, and keeps a callback that returns nothing harmless", () => {
    expect(resolveLocaleText({ getLocaleText: () => "{count}!" }, "rowsSelectedOther", { count: 4 })).toBe("4!");
    expect(resolveLocaleText({ getLocaleText: () => undefined as any }, "page")).toBe("Page");
  });
});

describe("interpolateLocaleText", () => {
  it("fills every occurrence and leaves unknown placeholders as written", () => {
    expect(interpolateLocaleText("{a} and {a}, {b}", { a: 1 })).toBe("1 and 1, {b}");
    expect(interpolateLocaleText("Page {page}")).toBe("Page {page}");
    expect(interpolateLocaleText("{n}", { n: 0 })).toBe("0");
  });
});

describe("pluralLocaleText", () => {
  it("picks …One for 1 and …Other otherwise, passing the count", () => {
    expect(pluralLocaleText(defaultLocaleText, "rowsSelected", 1)).toBe("1 row selected");
    expect(pluralLocaleText(defaultLocaleText, "rowsSelected", 0)).toBe("0 rows selected");
    expect(pluralLocaleText(defaultLocaleText, "rowsSelected", 5)).toBe("5 rows selected");
  });

  it("lets a two-form language translate through the map alone, and a richer one through the callback", () => {
    const de = createLocaleTextResolver({ localeText: { rowsSelectedOne: "{count} Zeile ausgewählt", rowsSelectedOther: "{count} Zeilen ausgewählt" } });
    expect(pluralLocaleText(de, "rowsSelected", 1)).toBe("1 Zeile ausgewählt");
    expect(pluralLocaleText(de, "rowsSelected", 3)).toBe("3 Zeilen ausgewählt");

    // Polish-style: 1 / 2–4 / 5+ forms, decided from the count the callback receives.
    const pl = createLocaleTextResolver({
      getLocaleText: ({ key, variableValues, defaultValue }) => {
        if (!key.startsWith("rowsSelected")) return defaultValue;
        const n = Number(variableValues?.count);
        if (n === 1) return "{count} wiersz zaznaczony";
        return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
          ? "{count} wiersze zaznaczone"
          : "{count} wierszy zaznaczonych";
      },
    });
    expect(pluralLocaleText(pl, "rowsSelected", 1)).toBe("1 wiersz zaznaczony");
    expect(pluralLocaleText(pl, "rowsSelected", 3)).toBe("3 wiersze zaznaczone");
    expect(pluralLocaleText(pl, "rowsSelected", 12)).toBe("12 wierszy zaznaczonych");
  });
});

describe("localeTextFromApi", () => {
  it("asks the api when it can, English otherwise", () => {
    expect(localeTextFromApi({ getLocaleText: () => "x" })("page")).toBe("x");
    expect(localeTextFromApi({})("page")).toBe("Page");
    expect(localeTextFromApi(undefined)("ratingValue", { value: 3, max: 5 })).toBe("3 of 5");
  });
});
