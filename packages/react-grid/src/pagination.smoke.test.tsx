// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Grid } from "./grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const rowData = [
  { id: 1, name: "One" },
  { id: 2, name: "Two" },
];

const columnDefs = [
  { colId: "id", key: "id", label: "ID" },
  { colId: "name", key: "name", label: "Name" },
];

async function mountGrid(
  pagination?: boolean,
  pageSize = 25,
  columns = columnDefs,
) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <Grid
        rowData={rowData}
        columnDefs={columns}
        rowIdKey="id"
        pagination={pagination}
        pageSize={pageSize}
      />,
    );
  });

  const render = async (nextPagination?: boolean, nextColumns = columns) => {
    await act(async () => {
      root.render(
        <Grid
          rowData={rowData}
          columnDefs={nextColumns}
          rowIdKey="id"
          pagination={nextPagination}
          pageSize={pageSize}
        />,
      );
    });
  };

  return { container, root, render };
}

describe("pagination footer visibility", () => {
  it("keeps the footer hidden when pagination is omitted and no columns are aggregated", async () => {
    const { container, root } = await mountGrid();
    const footer = container.querySelector(".pte-pagination-wrapper");

    expect(footer).toBeTruthy();
    expect(footer!.classList.contains("visible")).toBe(false);

    await act(async () => root.unmount());
    container.remove();
  });

  it("shows the footer for explicit pagination and preserves the configured page size", async () => {
    const { container, root } = await mountGrid(true, 25);
    const footer = container.querySelector(".pte-pagination-wrapper");
    const pageSize = container.querySelector<HTMLSelectElement>(
      ".pte-pagination-select:not(.pte-aggregate-scope):not(.pte-pagination-page-select)",
    );

    expect(footer!.classList.contains("visible")).toBe(true);
    expect(pageSize?.value).toBe("25");

    await act(async () => root.unmount());
    container.remove();
  });

  it("updates footer visibility when pagination is toggled after mount", async () => {
    const { container, root, render } = await mountGrid(false, 25);
    const footer = container.querySelector(".pte-pagination-wrapper")!;
    const pageSizeSelector =
      ".pte-pagination-select:not(.pte-aggregate-scope):not(.pte-pagination-page-select)";

    expect(footer.classList.contains("visible")).toBe(false);
    expect(container.querySelector(pageSizeSelector)).toBeNull();
    expect(container.querySelector(".pte-pagination-nav")).toBeNull();

    await render(true);
    expect(footer.classList.contains("visible")).toBe(true);
    expect(container.querySelector<HTMLSelectElement>(pageSizeSelector)?.value).toBe("25");
    expect(container.querySelector(".pte-pagination-nav")).toBeTruthy();

    await render(false);
    expect(footer.classList.contains("visible")).toBe(false);
    expect(container.querySelector(pageSizeSelector)).toBeNull();
    expect(container.querySelector(".pte-pagination-nav")).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it("omits aggregate controls when every column is non-aggregatable", async () => {
    const columns = columnDefs.map(column => ({ ...column, aggregatable: false }));
    const { container, root } = await mountGrid(true, 25, columns);

    expect(container.querySelector(".pte-pagination-wrapper")?.classList.contains("visible")).toBe(true);
    expect(container.querySelector(".pte-pagination-nav")).toBeTruthy();
    expect(container.querySelector(".pte-aggregate-controls")).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it("updates aggregate controls when column capabilities change after mount", async () => {
    const disabledColumns = columnDefs.map(column => ({ ...column, aggregatable: false }));
    const { container, root, render } = await mountGrid(true);

    expect(container.querySelector(".pte-aggregate-controls")).toBeTruthy();

    await render(true, disabledColumns);
    expect(container.querySelector(".pte-aggregate-controls")).toBeNull();
    expect(container.querySelector(".pte-pagination-nav")).toBeTruthy();

    await render(true, columnDefs);
    expect(container.querySelector(".pte-aggregate-controls")).toBeTruthy();
    expect(container.querySelector(".pte-pagination-nav")).toBeTruthy();

    await act(async () => root.unmount());
    container.remove();
  });
});
