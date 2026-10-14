// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { IServerSideDataSource, IServerSideRequest } from "../interfaces/serverSide";
import { initDomRenderer } from "./dom";

// A server-side block whose request fails must be requested again the next time the renderer
// needs it (scrolling over the gap), not stay "pending" until a refresh. No automatic retry: the
// failure alone issues nothing.

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};

const ROW_HEIGHT = 40;
const VIEW_HEIGHT = 400;
const BLOCK = 50;
const TOTAL = 1000;

const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    await raf();
  }
};

function mountGrid(failOnce: (request: IServerSideRequest) => boolean) {
  const requests: IServerSideRequest[] = [];
  let failed = false;
  const source: IServerSideDataSource = {
    getRows: ({ request, success, error }) => {
      requests.push(request);
      if (!failed && failOnce(request)) {
        failed = true;
        error(new Error("server unavailable"));
        return;
      }
      const start = request.startRow ?? 0;
      const end = Math.min(TOTAL, request.endRow ?? TOTAL);
      const rows = Array.from({ length: Math.max(0, end - start) }, (_, i) => ({ id: String(start + i), n: start + i }));
      success({ rows, totalRows: TOTAL });
    },
  };
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
  Object.defineProperty(container, "clientWidth", { value: 900, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowHeight: ROW_HEIGHT,
    rowModelType: "serverSide",
    serverSideBlockSize: BLOCK,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const errors: unknown[] = [];
  core.on("error", (ev) => errors.push(ev));
  const { renderer } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([{ colId: "n", key: "n", label: "N", type: ColumnType.NUMBER }]);
  core.setServerSideDataSource(source);
  const body = container.querySelector<HTMLElement>(".pte-body")!;
  Object.defineProperty(body, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
  return { core, body, requests, errors };
}

function scrollBody(body: HTMLElement, scrollTop: number) {
  body.scrollTop = scrollTop;
  body.dispatchEvent(new Event("scroll"));
}

describe("server-side block failure", () => {
  it("re-requests a failed block on the next demand for it, and its rows then load", async () => {
    const { core, body, requests, errors } = mountGrid(request => (request.startRow ?? 0) >= 400);
    await settle();
    expect(core.getRowModel().getRowNodeAtViewIndex(0)).toBeTruthy();

    scrollBody(body, 500 * ROW_HEIGHT);
    await settle();
    expect(errors).toHaveLength(1);
    const failedStart = requests.find(r => (r.startRow ?? 0) >= 400)!.startRow!;
    expect(core.getRowModel().getRowNodeAtViewIndex(failedStart)).toBeUndefined();
    // The failure itself does not retry.
    const afterFailure = requests.filter(r => r.startRow === failedStart).length;
    expect(afterFailure).toBe(1);

    // A later demand for the same range (a nudge of the scroll position) asks the server again.
    scrollBody(body, 500 * ROW_HEIGHT + 5);
    await settle();
    expect(requests.filter(r => r.startRow === failedStart).length).toBe(2);
    expect(core.getRowModel().getRowNodeAtViewIndex(failedStart)?.id).toBe(String(failedStart));
    expect(core.getRowModel().getRowNodeAtViewIndex(500)?.id).toBe("500");
  });
});
