// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { IServerSideDataSource, IServerSideRequest, IServerSideResult } from "../interfaces/serverSide";
import { initDomRenderer } from "../renderer/dom";

/**
 * The body renderer reports its drawn window to the row model (`GridCore.noteRenderedRowRange` →
 * `IRowModel.setRenderedRange`). Scrolling back over rows that are already loaded requests
 * nothing, so without that report a capped server-side cache only knows the newest viewport
 * REQUEST — and a far fetch landing afterwards could evict the block on screen.
 */

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};
const BLOCK = 50;
const ROWS = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, n: i }));

// Every response waits in `pending` until the test releases it, so a fetch can be held in flight.
function makeDataSource() {
  const pending: Array<{ request: IServerSideRequest; respond: () => void }> = [];
  const source: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      const result: IServerSideResult = {
        rows: ROWS.slice(request.startRow ?? 0, request.endRow ?? ROWS.length).map(r => ({ ...r })),
        totalRows: ROWS.length,
      };
      pending.push({ request, respond: () => success(result) });
    },
  };
  return { source, pending };
}

const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};

async function mount() {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const ds = makeDataSource();
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "serverSide",
    serverSideBlockSize: BLOCK,
    serverSideMaxBlocks: 4,
  } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([{ colId: "n", key: "n", label: "N", type: ColumnType.NUMBER }]);
  core.setServerSideDataSource(ds.source);
  const scroller = container.querySelector<HTMLElement>(".pte-body")!;
  const scrollToRow = async (row: number) => {
    scroller.scrollTop = row * core.options.rowHeight;
    scroller.dispatchEvent(new Event("scroll"));
    await settle();
  };
  // Release every held response, oldest first, until the renderer asks for nothing more.
  const drain = async () => {
    while (ds.pending.length > 0) {
      ds.pending.shift()!.respond();
      await settle();
    }
  };
  return { core, ds, scrollToRow, drain };
}

// Loaded block starts per listing, read off the store.
const blocks = (core: GridCore): number[] => {
  const listings: Map<string, { nodes: Map<number, unknown> }> = (core.getRowModel() as any).listings;
  const starts = new Set<number>();
  for (const listing of listings.values()) {
    for (const idx of listing.nodes.keys()) starts.add(Math.floor(idx / BLOCK) * BLOCK);
  }
  return [...starts].sort((a, b) => a - b);
};

describe("rendered range reaches the server-side row model", () => {
  it("keeps the visible block when a far fetch lands after scrolling back over loaded rows", async () => {
    const { core, ds, scrollToRow, drain } = await mount();
    await settle();
    await drain();
    await scrollToRow(250);
    await drain();
    expect(blocks(core)).toEqual([0, 50, 200, 250]); // the first load fetched two blocks

    // A far fetch goes out and is held in flight...
    await scrollToRow(450);
    expect(ds.pending.map(p => p.request.startRow)).toEqual([400]);
    // ...while the user scrolls back to rows that are already loaded: no request, so only the
    // renderer's report tells the model where the viewport is now.
    await scrollToRow(0);
    expect(ds.pending).toHaveLength(1);

    // The far block lands and pushes the cache over its cap of 4. The block on screen is kept;
    // the least recently used block away from the viewport goes instead.
    ds.pending.shift()!.respond();
    await settle();
    expect(blocks(core)).toContain(0);
    expect(blocks(core)).not.toContain(200);
    expect(ds.pending).toHaveLength(0); // nothing on screen went missing, so nothing is refetched
  });
});
