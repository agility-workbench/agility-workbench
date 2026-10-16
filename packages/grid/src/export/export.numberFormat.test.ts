/**
 * A NUMBER column's built-in formatter options map to an Excel number format, so the workbook
 * shows what the cell shows while the cell keeps its raw number. Options Excel can't express
 * (compact notation) and per-row (function) options stay General. When the options leave the
 * decimal count open (min < max) it follows the data: the most decimals any exported value needs.
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { Column } from "../column/column";
import { ColDef, ColumnType } from "../interfaces/column";
import { AggregateType } from "../interfaces/aggregate";
import { buildXlsx, ExportConfig } from "./export";

async function sheetOf(config: ExportConfig) {
  const bytes = await buildXlsx(config);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return wb.worksheets[0];
}

/** Export one NUMBER column holding `values`; return each body cell's numFmt and value. */
async function numberColumn(formatterOptions: ColDef["formatterOptions"], values: number[]) {
  const col = new Column({ key: "n", label: "N", type: ColumnType.NUMBER, formatterOptions });
  const ws = await sheetOf({ columns: [col], rows: values.map(n => ({ n })) });
  return values.map((_, i) => {
    const cell = ws.getCell(`A${i + 2}`);
    return { numFmt: cell.numFmt, value: cell.value };
  });
}

/** Export one NUMBER column holding `value`; return the body cell's numFmt and value. */
async function numberCell(formatterOptions: ColDef["formatterOptions"], value = 1234.5) {
  const col = new Column({ key: "n", label: "N", type: ColumnType.NUMBER, formatterOptions });
  const bytes = await buildXlsx({ columns: [col], rows: [{ n: value }] });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const cell = wb.worksheets[0].getCell("A2");
  return { numFmt: cell.numFmt, value: cell.value };
}

describe("NUMBER formatterOptions → Excel numFmt", () => {
  it("groups the integer part by default, and drops grouping when useGrouping is false", async () => {
    expect(await numberCell({ fractionDigits: 0 })).toEqual({ numFmt: "#,##0", value: 1234.5 });
    expect(await numberCell({ fractionDigits: 0, useGrouping: false }))
      .toEqual({ numFmt: "0", value: 1234.5 });
  });

  it("writes fixed decimals (min = max) as zeros", async () => {
    expect(await numberCell({ fractionDigits: 2 })).toEqual({ numFmt: "#,##0.00", value: 1234.5 });
  });

  it("open decimals (min 0 < max) with integer data export with no decimals", async () => {
    expect(await numberColumn({ maximumFractionDigits: 2 }, [3, 40, 1200])).toEqual([
      { numFmt: "#,##0", value: 3 },
      { numFmt: "#,##0", value: 40 },
      { numFmt: "#,##0", value: 1200 },
    ]);
    // The decimal default (Intl's 0..3) is open too.
    expect((await numberColumn({ useGrouping: false }, [7, 8]))[0].numFmt).toBe("0");
  });

  it("open decimals with mixed data use the most any value needs, clamped to [min, max]", async () => {
    const cells = await numberColumn({ maximumFractionDigits: 3 }, [1, 2.5, 3.25]);
    expect(cells.map(c => c.numFmt)).toEqual(["#,##0.00", "#,##0.00", "#,##0.00"]);
    expect(cells.map(c => c.value)).toEqual([1, 2.5, 3.25]);
    // More decimals than max clamp to max; fewer than min rise to min.
    expect((await numberColumn({ maximumFractionDigits: 2 }, [1.23456]))[0].numFmt).toBe("#,##0.00");
    expect((await numberColumn({ minimumFractionDigits: 1, maximumFractionDigits: 3 }, [5]))[0].numFmt)
      .toBe("#,##0.0");
    // Exponent forms are read from the text: 1.5e-7 needs 8 decimals, clamped to 3.
    expect((await numberColumn({ maximumFractionDigits: 3 }, [1.5e-7]))[0].numFmt).toBe("#,##0.000");
  });

  it("an empty column with open decimals uses the minimum", async () => {
    const col = new Column({
      key: "n", label: "N", type: ColumnType.NUMBER,
      formatterOptions: { minimumFractionDigits: 1, maximumFractionDigits: 3 },
    });
    const ws = await sheetOf({ columns: [col], rows: [{ n: null }, { n: "text" }] });
    expect(ws.getCell("A2").value ?? null).toBeNull();
    expect(ws.getCell("A3").value).toBe("text");
    expect(ws.getCell("A3").numFmt).toBe("#,##0.0");
  });

  it("counts a percent's decimals in display units", async () => {
    expect(await numberColumn({ style: "percent" }, [0.125, 0.13])).toEqual([
      { numFmt: "#,##0.0%", value: 0.125 },
      { numFmt: "#,##0.0%", value: 0.13 },
    ]);
    // 0.07 is 7%, not 7.000000000000001%.
    expect((await numberColumn({ style: "percent" }, [0.07, 0.5]))[0].numFmt).toBe("#,##0%");
  });

  it("settles pinned rows and the aggregate footer with the body, and keeps a processor's numFmt", async () => {
    const col = new Column({
      key: "n", label: "N", type: ColumnType.NUMBER, formatterOptions: { maximumFractionDigits: 3 },
    });
    const ws = await sheetOf({
      columns: [col],
      pinnedTopRows: [{ n: 1.5 }],
      rows: [{ n: 2 }, { n: 4 }],
      pinnedBottomRows: [{ n: 9 }],
      aggregates: [{ key: col.instanceID, type: AggregateType.AVG }],
      processCellForExcel: ({ rowType }) =>
        rowType === "pinnedBottom" ? { style: { numFmt: "0.0000" } } : undefined,
    });
    // Header, pinned top 1.5, body 2 and 4, pinned bottom 9 (processor format), footer AVERAGE = 3.
    expect(["A2", "A3", "A4"].map(a => ws.getCell(a).numFmt)).toEqual(["#,##0.0", "#,##0.0", "#,##0.0"]);
    expect(ws.getCell("A5").numFmt).toBe("0.0000");
    expect(ws.getCell("A6").numFmt).toBe("#,##0.0");
    expect(ws.getCell("A2").value).toBe(1.5);
  });

  it("appends % for percent and keeps the raw fraction as the value", async () => {
    expect(await numberCell({ style: "percent", fractionDigits: 1 }, 0.125))
      .toEqual({ numFmt: "#,##0.0%", value: 0.125 });
  });

  it("appends the unit text Intl writes for the locale and unitDisplay", async () => {
    expect(await numberCell({ unit: "kilogram", fractionDigits: 1 }))
      .toEqual({ numFmt: '#,##0.0" kg"', value: 1234.5 });
    expect(await numberCell({ unit: "kilogram", unitDisplay: "long", fractionDigits: 0 }))
      .toEqual({ numFmt: '#,##0" kilograms"', value: 1234.5 });
  });

  it("maps compact notation to nothing (General)", async () => {
    const { numFmt, value } = await numberCell({ notation: "compact" });
    expect(numFmt ?? "General").toBe("General");
    expect(value).toBe(1234.5);
  });

  it("keeps function-valued formatterOptions on General", async () => {
    const { numFmt, value } = await numberCell(() => ({ fractionDigits: 2 }));
    expect(numFmt ?? "General").toBe("General");
    expect(value).toBe(1234.5);
  });

  it("keeps a column format over the options, and a column with no options on General", async () => {
    const col = new Column({
      key: "n", label: "N", type: ColumnType.NUMBER, format: "0.0000", formatterOptions: { fractionDigits: 2 },
    });
    const bytes = await buildXlsx({ columns: [col], rows: [{ n: 1 }] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    expect(wb.worksheets[0].getCell("A2").numFmt).toBe("0.0000");
    expect((await numberCell(undefined)).numFmt ?? "General").toBe("General");
  });
});
