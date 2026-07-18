/**
 * The public API's export methods (exportDataAsCsv / exportDataAsExcel) must route to the exporter
 * the renderer registers via setExporter, forwarding the caller's params — and no-op (with a warn)
 * when called before the grid is rendered.
 */
import { describe, it, expect, vi } from "vitest";
import { GridAPI, GridApiExporter } from "./api";
import { IGridCore } from "../interfaces/iGridCore";

// The API's export path only touches the injected exporter, so a bare core stub is enough.
const coreStub = {} as unknown as IGridCore;

describe("GridAPI export methods", () => {
  // A recording exporter stub; get* return canned artifacts.
  function stubExporter(calls: any[]): GridApiExporter {
    return {
      exportCSV: (p) => calls.push({ fn: "csv", p }),
      exportExcel: (p) => calls.push({ fn: "excel", p }),
      getDataAsCsv: (p) => { calls.push({ fn: "getCsv", p }); return "a,b\n1,2"; },
      getDataAsExcel: async (p) => { calls.push({ fn: "getXlsx", p }); return new Uint8Array([80, 75]); },
    };
  }

  it("routes exportDataAsCsv / exportDataAsExcel to the registered exporter with params", () => {
    const calls: any[] = [];
    const api = new GridAPI(coreStub);
    api.setExporter(stubExporter(calls));

    api.exportDataAsCsv({ scope: "selection", fileName: "sel.csv" });
    api.exportDataAsExcel({ scope: "all", groupMode: "leaves" });

    expect(calls).toEqual([
      { fn: "csv", p: { scope: "selection", fileName: "sel.csv" } },
      { fn: "excel", p: { scope: "all", groupMode: "leaves" } },
    ]);
  });

  it("getDataAsCsv / getDataAsExcel return the artifact without downloading", async () => {
    const calls: any[] = [];
    const api = new GridAPI(coreStub);
    api.setExporter(stubExporter(calls));

    expect(api.getDataAsCsv({ scope: "all" })).toBe("a,b\n1,2");
    const bytes = await api.getDataAsExcel({ columnIds: ["x"] });
    expect(Array.from(bytes)).toEqual([80, 75]);
    expect(calls).toEqual([
      { fn: "getCsv", p: { scope: "all" } },
      { fn: "getXlsx", p: { columnIds: ["x"] } },
    ]);
  });

  it("defaults params to an empty object when omitted", () => {
    const calls: any[] = [];
    const api = new GridAPI(coreStub);
    api.setExporter(stubExporter(calls));
    api.exportDataAsCsv();
    api.exportDataAsExcel();
    expect(calls).toEqual([{ fn: "csv", p: {} }, { fn: "excel", p: {} }]);
  });

  it("download methods no-op (with a warning) before the grid is rendered", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const api = new GridAPI(coreStub); // no setExporter yet
    expect(() => api.exportDataAsCsv()).not.toThrow();
    expect(() => api.exportDataAsExcel()).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("get* methods return empty artifacts (with a warning) before the grid is rendered", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const api = new GridAPI(coreStub);
    expect(api.getDataAsCsv()).toBe("");
    expect(Array.from(await api.getDataAsExcel())).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
