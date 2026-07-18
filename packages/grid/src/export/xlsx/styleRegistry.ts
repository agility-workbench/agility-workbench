/**
 * Index-based style registry for the .xlsx writer.
 *
 * OOXML styling is a set of dedup'd collections (numFmts, fonts, fills, borders) plus `cellXfs`
 * entries that reference them by index. Each cell carries an `s="N"` attribute pointing at a
 * cellXfs entry. This registry interns each unique style combination and hands back the cellXfs
 * index, then serializes the whole thing to `xl/styles.xml`.
 *
 * The prototype covers what today's export produces (per-type number formats) plus header styling
 * (bold + centered/wrapped) so the sheet resembles the grid. Fonts/fills/borders are intentionally
 * small but structured to grow.
 */
import { escapeXml } from "./xml";

export interface Alignment {
  horizontal?: "left" | "center" | "right";
  vertical?: "top" | "middle" | "bottom";
  wrapText?: boolean;
}

export interface CellStyle {
  /** Excel number format code (e.g. "yyyy-mm-dd"). Undefined = General. */
  numFmt?: string;
  bold?: boolean;
  alignment?: Alignment;
}

// Built-in numFmt ids run 0..163; custom formats must start at 164.
const CUSTOM_NUMFMT_BASE = 164;

export class StyleRegistry {
  private numFmts = new Map<string, number>(); // format code -> numFmtId
  private nextNumFmtId = CUSTOM_NUMFMT_BASE;

  // cellXfs: keyed by a stable string so identical styles collapse to one entry.
  private xfKeys = new Map<string, number>();
  private xfs: Array<{ numFmtId: number; fontId: number; alignment?: Alignment }> = [];

  constructor() {
    // cellXfs[0] must be the default style (Excel relies on this).
    this.xfs.push({ numFmtId: 0, fontId: 0 });
    this.xfKeys.set("0|0|", 0);
  }

  private numFmtId(code: string | undefined): number {
    if (!code) return 0; // General
    const existing = this.numFmts.get(code);
    if (existing != null) return existing;
    const id = this.nextNumFmtId++;
    this.numFmts.set(code, id);
    return id;
  }

  /** Intern a style and return its cellXfs index. */
  getStyleId(style: CellStyle): number {
    const numFmtId = this.numFmtId(style.numFmt);
    const fontId = style.bold ? 1 : 0;
    const a = style.alignment;
    const alignKey = a ? `${a.horizontal ?? ""}:${a.vertical ?? ""}:${a.wrapText ? 1 : 0}` : "";
    const key = `${numFmtId}|${fontId}|${alignKey}`;

    const existing = this.xfKeys.get(key);
    if (existing != null) return existing;

    const id = this.xfs.length;
    this.xfs.push({ numFmtId, fontId, alignment: a });
    this.xfKeys.set(key, id);
    return id;
  }

  /** Serialize the full `xl/styles.xml` part. */
  toXml(): string {
    const numFmtEntries = Array.from(this.numFmts.entries());
    const numFmtsXml = numFmtEntries.length
      ? `<numFmts count="${numFmtEntries.length}">` +
        numFmtEntries
          .map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${escapeXml(code)}"/>`)
          .join("") +
        `</numFmts>`
      : "";

    // Two fonts: default (index 0) and bold (index 1).
    const fontsXml =
      `<fonts count="2">` +
      `<font><sz val="11"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
      `</fonts>`;

    // Excel convention: fill index 0 = none, index 1 = gray125.
    const fillsXml =
      `<fills count="2">` +
      `<fill><patternFill patternType="none"/></fill>` +
      `<fill><patternFill patternType="gray125"/></fill>` +
      `</fills>`;

    const bordersXml = `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`;

    const cellStyleXfsXml = `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`;

    const cellXfsXml =
      `<cellXfs count="${this.xfs.length}">` +
      this.xfs
        .map(xf => {
          const applyFont = xf.fontId !== 0 ? ` applyFont="1"` : "";
          const applyNumFmt = xf.numFmtId !== 0 ? ` applyNumberFormat="1"` : "";
          const a = xf.alignment;
          if (a) {
            const parts: string[] = [];
            if (a.horizontal) parts.push(`horizontal="${a.horizontal}"`);
            if (a.vertical) parts.push(`vertical="${a.vertical}"`);
            if (a.wrapText) parts.push(`wrapText="1"`);
            return (
              `<xf numFmtId="${xf.numFmtId}" fontId="${xf.fontId}" fillId="0" borderId="0"` +
              `${applyNumFmt}${applyFont} applyAlignment="1">` +
              `<alignment ${parts.join(" ")}/></xf>`
            );
          }
          return `<xf numFmtId="${xf.numFmtId}" fontId="${xf.fontId}" fillId="0" borderId="0"${applyNumFmt}${applyFont}/>`;
        })
        .join("") +
      `</cellXfs>`;

    const cellStylesXml = `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`;

    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      numFmtsXml +
      fontsXml +
      fillsXml +
      bordersXml +
      cellStyleXfsXml +
      cellXfsXml +
      cellStylesXml +
      `</styleSheet>`
    );
  }
}
