// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../../createGrid";
import { IGridAPI } from "../../interfaces/iGridAPI";
import { IServerSideGetRowsParams, IServerSideRequest } from "../../interfaces/serverSide";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

let host: HTMLElement;
let api: IGridAPI | undefined;
let requests: IServerSideRequest[];

function mount(extra: Record<string, unknown>): IGridAPI {
  return createGrid(host, {
    rowIdKey: "id",
    rowModelType: "serverSide",
    columnDefs: [{ colId: "name", key: "name", label: "Name" }],
    serverSideDataSource: {
      getRows: ({ request, success }: IServerSideGetRowsParams) => {
        requests.push(request);
        success({ rows: [{ id: "1", name: "Acme" }], totalRows: 1 });
      },
    },
    ...extra,
  } as any);
}

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.style.height = "400px";
  host.style.width = "800px";
  document.body.appendChild(host);
  requests = [];
});

afterEach(() => {
  api?.destroy();
  api = undefined;
});

const input = () => host.querySelector<HTMLInputElement>(".pte-quick-filter-input");

function type(text: string): void {
  const el = input()!;
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("quick-filter widget under the server-side row model", () => {
  it("mounts the floating widget and sends what is typed to the server", async () => {
    api = mount({ quickFilter: { mode: "always", debounceMs: 0 } });
    await flush();
    expect(input()).not.toBeNull();
    type("acme");
    await flush();
    expect(api.getQuickFilterText()).toBe("acme");
    expect(requests[requests.length - 1].quickFilter?.text).toBe("acme");
  });

  it("mounts the toolbar widget", async () => {
    api = mount({ quickFilter: { debounceMs: 0 }, toolbar: { quickFilter: true } });
    await flush();
    expect(host.querySelector(".pte-grid-toolbar-quick-filter .pte-quick-filter-input")).not.toBeNull();
  });
});
