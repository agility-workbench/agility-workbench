// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { ReactColDef } from "./cellRenderer";

// Column virtualization through the React wrapper: the two creation-only options reach the core,
// and a React cell renderer in a column that scrolls out of the window is unmounted (and mounted
// again when it scrolls back) like any other cell's.

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

const COLS = 40;
const ROWS = Array.from({ length: 20 }, (_, r) => {
  const row: Record<string, number | string> = { id: r + 1 };
  for (let c = 0; c < COLS; c++) row[`c${c}`] = `${r}:${c}`;
  return row;
});

let mounted = 0;
function Badge(props: { value: unknown }) {
  React.useEffect(() => {
    mounted++;
    return () => {
      mounted--;
    };
  }, []);
  return <b className="badge">{String(props.value)}</b>;
}

function columns(): ReactColDef[] {
  return Array.from({ length: COLS }, (_, c) => ({
    colId: `c${c}`, key: `c${c}`, label: `C${c}`, width: 100,
    ...(c === 1 ? { cellRenderer: Badge } : {}),
  }));
}

const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function mountGrid(props: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Grid data={ROWS} columnDefs={columns()} rowIdKey="id" {...props} />);
  });
  const center = container.querySelector<HTMLElement>(".pte-spacer")!;
  return { container, root, center };
}

async function scrollCenter(center: HTMLElement, width: number, left: number) {
  Object.defineProperty(center, "clientWidth", { value: width, configurable: true });
  await act(async () => {
    center.scrollLeft = left;
    center.dispatchEvent(new Event("scroll"));
    await raf();
    await raf();
  });
}

function cellsPerRow(container: HTMLElement): number {
  const row = container.querySelector<HTMLElement>(".pte-viewport .pte-row[data-view-idx]")!;
  return row.querySelectorAll(":scope > .pte-cell:not(.pte-full-width-cell)").length;
}

describe("column virtualization (React)", () => {
  it("renders a window of the centre columns and unmounts React renderers that leave it", async () => {
    mounted = 0;
    const { container, root, center } = await mountGrid({ overscanColumnCount: 1 });
    await scrollCenter(center, 500, 0);
    // c0..c4 visible + 1 overscan.
    expect(cellsPerRow(container)).toBe(6);
    expect(mounted).toBeGreaterThan(0);
    const withBadge = mounted;

    await scrollCenter(center, 500, 2000);
    expect(cellsPerRow(container)).toBe(7); // c19..c24 + 1 overscan each side
    expect(container.querySelector(".badge")).toBeNull();
    expect(mounted).toBe(0);

    await scrollCenter(center, 500, 0);
    expect(mounted).toBe(withBadge);
    await unmountTestRoot(root);
  });

  it("renders every column with columnVirtualization={false}", async () => {
    const { container, root, center } = await mountGrid({ columnVirtualization: false });
    await scrollCenter(center, 500, 2000);
    expect(cellsPerRow(container)).toBe(COLS);
    await unmountTestRoot(root);
  });
});
