import { describe, expect, it } from "vitest";
import {
  CREATION_ONLY_OPTION_KEYS,
  MODEL_STATE_OPTION_KEYS,
  UPDATABLE_OPTION_KEYS,
  isCreationOnlyGridOption,
} from "./gridOptions";

describe("creation-only grid option keys", () => {
  it("is every option outside the updatable and model-state lists", () => {
    const live = new Set<string>([...UPDATABLE_OPTION_KEYS, ...MODEL_STATE_OPTION_KEYS]);
    for (const key of CREATION_ONLY_OPTION_KEYS) expect(live.has(key)).toBe(false);
    expect(new Set(CREATION_ONLY_OPTION_KEYS).size).toBe(CREATION_ONLY_OPTION_KEYS.length);
  });

  it("classifies structural options as creation-only and live ones as not", () => {
    for (const key of ["rowHeight", "getRowId", "rowIdKey", "rowModelType", "rowNumbers", "defaultColDef",
      "groupColumnDef", "pivotResultColumnDef", "initialSort"]) {
      expect(isCreationOnlyGridOption(key)).toBe(true);
    }
    for (const key of ["zebraRows", "tooltip", "quickFilter", "pagination", "theme", "groupDisplayType",
      "columnDefs", "pivotMode", "pivotColumns", "notAnOption"]) {
      expect(isCreationOnlyGridOption(key)).toBe(false);
    }
  });
});
