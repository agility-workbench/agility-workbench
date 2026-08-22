// @vitest-environment happy-dom
/**
 * Who owns the column schema. Two writers exist — the application (props / updateGridOptions /
 * api.setColumnDefs) and the server (an SSRM response's ride-along `columns`) — and `schemaSource`
 * arbitrates: any application door stamps caller ownership and the server is ignored until the
 * application releases it with `updateGridOptions({ columnDefs: undefined })`.
 *
 * The regression pinned here: `api.setColumnDefs` used to skip the ownership stamp, so a later
 * server schema silently replaced definitions supplied that way but not the same definitions
 * supplied through props.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../createGrid";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.style.height = "400px";
  host.style.width = "600px";
  document.body.appendChild(host);
});

/** Mounted with no columnDefs, so the schema starts unowned (`schemaSource: "auto"`). No font
 * seeding: a columnless mount never builds a header, so the font probe (themeFontSet) has not run
 * when the first defs arrive — these tests double as regression coverage for the autosize crash
 * that gap used to cause (textMeasureParams is now seeded with defaults at declaration). */
function mountUnowned(): IGridAPI {
  return createGrid(host, {
    rowIdKey: "id",
    rowData: [{ id: 1, name: "Widget", price: 9.99 }],
  });
}

const APP_DEFS = [
  { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
  { colId: "price", key: "price", label: "Price", type: ColumnType.NUMBER },
];
const SERVER_DEFS = [
  { colId: "sku", key: "sku", label: "SKU", type: ColumnType.STRING },
];

/** Deliver a server schema the way an SSRM response does. The huge request id passes the
 * stale-response guard (`requestIdCounter - id > 1`). */
function serverSchema(api: IGridAPI, columns = SERVER_DEFS, schemaVersion?: string): void {
  (api.getCore() as GridCore).onServerSideSchema(1e9, { columns, schemaVersion });
}

function labels(api: IGridAPI): string[] {
  return api.getColumnModel().getLeaves().map(col => col.label);
}

describe("column schema ownership", () => {
  it("a server schema applies while the schema is unowned", () => {
    const api = mountUnowned();
    expect(labels(api)).toEqual([]);
    serverSchema(api);
    expect(labels(api)).toEqual(["SKU"]);
  });

  it("api.setColumnDefs claims ownership: a later server schema is ignored", () => {
    const api = mountUnowned();
    api.setColumnDefs(APP_DEFS);
    expect(labels(api)).toEqual(["Name", "Price"]);

    serverSchema(api, SERVER_DEFS, "v2");
    expect(labels(api)).toEqual(["Name", "Price"]);
  });

  it("api.setColumnDefs overrides an applied server schema, and keeps ownership after", () => {
    const api = mountUnowned();
    serverSchema(api);
    expect(labels(api)).toEqual(["SKU"]);

    api.setColumnDefs(APP_DEFS);
    expect(labels(api)).toEqual(["Name", "Price"]);
    serverSchema(api, SERVER_DEFS, "v3");
    expect(labels(api)).toEqual(["Name", "Price"]);
  });

  it("api.setColumnDefs([]) is a complete statement: clears the columns and owns the emptiness", () => {
    const api = mountUnowned();
    serverSchema(api);
    expect(labels(api)).toEqual(["SKU"]);

    api.setColumnDefs([]);
    expect(labels(api)).toEqual([]);
    // The next server response must not repopulate columns the application deliberately removed.
    serverSchema(api, SERVER_DEFS, "v2");
    expect(labels(api)).toEqual([]);
  });

  it("updateGridOptions({ columnDefs: undefined }) releases ownership back to the server", () => {
    const api = mountUnowned();
    api.setColumnDefs(APP_DEFS);
    serverSchema(api, SERVER_DEFS, "v2");
    expect(labels(api)).toEqual(["Name", "Price"]); // owned: ignored

    api.updateGridOptions({ columnDefs: undefined });
    serverSchema(api, SERVER_DEFS, "v3");
    expect(labels(api)).toEqual(["SKU"]); // released: applied
  });

  it("the two non-empty application doors are equivalent", () => {
    const viaSetColumnDefs = mountUnowned();
    viaSetColumnDefs.setColumnDefs(APP_DEFS);

    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.appendChild(host);
    const viaOptions = mountUnowned();
    viaOptions.updateGridOptions({ columnDefs: APP_DEFS });

    expect(labels(viaSetColumnDefs)).toEqual(labels(viaOptions));
    serverSchema(viaSetColumnDefs, SERVER_DEFS, "v2");
    serverSchema(viaOptions, SERVER_DEFS, "v2");
    expect(labels(viaSetColumnDefs)).toEqual(["Name", "Price"]);
    expect(labels(viaOptions)).toEqual(["Name", "Price"]);
  });

  it("a transient empty array through the options door does not steal a server schema", () => {
    const api = mountUnowned();
    serverSchema(api);
    expect(labels(api)).toEqual(["SKU"]);

    // Props contract: [] clears only when the caller already owns the schema.
    api.updateGridOptions({ columnDefs: [] });
    expect(labels(api)).toEqual(["SKU"]);
  });

  it("first defs over already-present rows autosize from cell values without a font probe", () => {
    // The regression: a columnless mount never builds a header, so the font probe has not run when
    // the first defs arrive. Autosize then measured cell values against undefined fonts and threw
    // (`params.cellFont` on undefined). The value here is long enough that the cell measurement —
    // not the header fallback — must decide the width, proving that path actually executed.
    const longName = "An unreasonably long widget description that outmeasures the header";
    const api = createGrid(host, {
      rowIdKey: "id",
      rowData: [{ id: 1, name: longName }],
    });
    api.setColumnDefs([{ colId: "name", key: "name", label: "Name", type: ColumnType.STRING }]);

    const [nameCol] = api.getColumnModel().getLeaves();
    expect(nameCol.computedWidth).toBeGreaterThan(longName.length * 7); // cell text won, at 7px/char
  });

  it("dedupes an unchanged server schema by version, and by signature without one", () => {
    const api = mountUnowned();
    serverSchema(api, SERVER_DEFS, "v1");
    const first = api.getColumnModel().getLeaves();

    serverSchema(api, SERVER_DEFS, "v1"); // same version: not reapplied
    expect(api.getColumnModel().getLeaves()).toEqual(first);

    serverSchema(api, [{ colId: "sku", key: "sku", label: "Item", type: ColumnType.STRING }], "v2");
    expect(labels(api)).toEqual(["Item"]); // changed version: applied
  });
});
