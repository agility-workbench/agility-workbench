import type { CellRendererParams, ICellRenderer } from "../renderer/renderer";
import { isBlankValue, ownParams, rendererText } from "./interactiveTarget";

/** `cellRendererParams` for `ImageCellRenderer` (`cellRenderer: "image"`). */
export interface ImageCellRendererParams {
  /** The image URL. Defaults to the cell value as a string. A blank result renders nothing. */
  src?: (params: CellRendererParams) => string | null | undefined;
  /**
   * The image's alternative text, also shown when the image fails to load. Defaults to the
   * formatted value when a `valueFormatter` turns the value into words, else the column label.
   */
  alt?: (params: CellRendererParams) => string | null | undefined;
  /** Image width: pixels when a number, any CSS length when a string. Defaults to fitting the cell. */
  width?: number | string;
  /** Image height: pixels when a number, any CSS length when a string. Defaults to the row height. */
  height?: number | string;
}

const toCssLength = (v: number | string | undefined): string => v == null ? "" : typeof v === "number" ? `${v}px` : v;

/**
 * Built-in image renderer (`cellRenderer: "image"`): an `<img>` (`loading="lazy"`) whose `src` is
 * `params.src(...)` or the cell value, scaled to fit the row (`object-fit: contain`) unless `width`
 * / `height` params size it. A blank value renders nothing, and an image that fails to load shows
 * its alt text instead. The cell shows no text, so the quick-filter find skips image columns; export,
 * the clipboard and tooltips still read the formatted value. Group rows show the group cell value
 * as text.
 */
export class ImageCellRenderer implements ICellRenderer {
  private eGui!: HTMLSpanElement;
  private img!: HTMLImageElement;
  private fallback!: HTMLSpanElement;
  // The src that last failed to load, so a repaint with the same src keeps showing the alt text.
  private brokenSrc: string | null = null;

  init(params: CellRendererParams): void {
    this.eGui = document.createElement("span");
    this.eGui.className = "pte-cell-image";
    this.img = document.createElement("img");
    this.img.className = "pte-cell-image-img";
    this.img.loading = "lazy";
    this.img.decoding = "async";
    this.img.addEventListener("error", this.onError);
    this.fallback = document.createElement("span");
    this.fallback.className = "pte-cell-image-broken";
    this.paint(params);
  }

  getGui(): HTMLElement {
    return this.eGui;
  }

  refresh(params: CellRendererParams): boolean {
    this.paint(params);
    return true;
  }

  destroy(): void {
    this.img?.removeEventListener("error", this.onError);
  }

  private paint(p: CellRendererParams) {
    if (p.isGroup) {
      this.eGui.textContent = rendererText(p);
      return;
    }
    const own = ownParams<ImageCellRendererParams>(p);
    const src = isBlankValue(p.value) && !own.src ? null : (own.src ? own.src(p) : String(p.value));
    if (src == null || src === "") {
      this.eGui.replaceChildren();
      this.img.removeAttribute("src");
      return;
    }
    const text = rendererText(p);
    const worded = text !== "" && text !== String(p.value ?? "");
    const alt = own.alt?.(p) ?? (worded ? text : (p.colDef?.label ?? ""));
    const img = this.img;
    img.alt = alt;
    img.style.width = toCssLength(own.width);
    img.style.height = toCssLength(own.height);
    this.fallback.textContent = alt;
    if (img.getAttribute("src") !== src) {
      this.brokenSrc = null;
      img.src = src;
    }
    const shown = this.brokenSrc === src ? this.fallback : img;
    if (shown.parentNode !== this.eGui || this.eGui.childNodes.length !== 1) this.eGui.replaceChildren(shown);
  }

  // A broken image would show the browser's broken-image glyph (or nothing); show the alt instead.
  // A later paint with a new src brings the image back.
  private onError = () => {
    this.brokenSrc = this.img.getAttribute("src");
    if (this.img.parentNode === this.eGui) this.eGui.replaceChildren(this.fallback);
  };
}
