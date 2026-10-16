import type { CellRendererParams, ICellRenderer } from "../renderer/renderer";
import { INTERACTIVE_ATTR, isBlankValue, ownParams, rendererText } from "./interactiveTarget";

/** `cellRendererParams` for `LinkCellRenderer` (`cellRenderer: "link"`). */
export interface LinkCellRendererParams {
  /** The link's URL. Defaults to the cell value as a string. A blank result shows plain text. */
  href?: (params: CellRendererParams) => string | null | undefined;
  /** The link's text. Defaults to the formatted value. */
  text?: (params: CellRendererParams) => string | null | undefined;
  /**
   * Where the link opens. Defaults to `"_blank"` (a new tab), which also sets
   * `rel="noopener noreferrer"`; pass `"_self"` to navigate the page itself.
   */
  target?: string;
  /** Extra `rel` tokens, added to `noopener noreferrer` on a blank-target link. */
  rel?: string;
  /** Sets the `download` attribute: `true` for the browser's file name, a string to name the file. */
  download?: boolean | string;
}

// URL schemes that run script rather than navigate. A cell value is data, so a link built from it
// never gets one of these as its href; the text still shows.
const SCRIPT_SCHEME = /^\s*(javascript|vbscript):/i;

/**
 * Built-in link renderer (`cellRenderer: "link"`): an `<a>` whose href is `params.href(...)` or the
 * cell value, whose text is `params.text(...)` or the formatted value. Opens in a new tab by default
 * (`target="_blank"` with `rel="noopener noreferrer"`). A blank value renders nothing; a
 * `javascript:`/`vbscript:` href is dropped and the text shows plain.
 *
 * A plain click on the link navigates: it still selects the cell, but never opens the editor
 * (neither `editTrigger: "singleClick"` nor a double-click on the link), so the link is not
 * replaced before the click lands. Middle-, Ctrl- and Cmd-clicks are the browser's. The link takes
 * no tab stop of its own; keyboard users keep the grid's cell navigation. Group rows show the group
 * cell value as text.
 */
export class LinkCellRenderer implements ICellRenderer {
  private eGui!: HTMLSpanElement;
  private link!: HTMLAnchorElement;

  init(params: CellRendererParams): void {
    this.eGui = document.createElement("span");
    this.eGui.className = "pte-cell-link";
    this.link = document.createElement("a");
    this.link.className = "pte-cell-link-anchor";
    this.link.tabIndex = -1;
    this.link.setAttribute(INTERACTIVE_ATTR, "");
    this.link.addEventListener("dblclick", this.onDoubleClick);
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
    this.link?.removeEventListener("dblclick", this.onDoubleClick);
  }

  private paint(p: CellRendererParams) {
    if (p.isGroup) {
      this.link.remove();
      this.eGui.textContent = rendererText(p);
      return;
    }
    if (isBlankValue(p.value)) {
      this.eGui.replaceChildren();
      return;
    }
    const own = ownParams<LinkCellRendererParams>(p);
    const text = own.text?.(p) ?? rendererText(p);
    const rawHref = own.href ? own.href(p) : String(p.value);
    const href = rawHref == null || rawHref === "" || SCRIPT_SCHEME.test(rawHref) ? null : String(rawHref);
    if (href == null) {
      this.link.remove();
      this.eGui.textContent = text;
      return;
    }
    const a = this.link;
    a.href = href;
    a.textContent = text;
    const target = own.target ?? "_blank";
    if (target) a.target = target;
    else a.removeAttribute("target");
    const rel = new Set((own.rel ?? "").split(/\s+/).filter(Boolean));
    if (target === "_blank") {
      rel.add("noopener");
      rel.add("noreferrer");
    }
    if (rel.size) a.rel = [...rel].join(" ");
    else a.removeAttribute("rel");
    if (own.download === true) a.setAttribute("download", "");
    else if (typeof own.download === "string") a.setAttribute("download", own.download);
    else a.removeAttribute("download");
    if (a.parentNode !== this.eGui || this.eGui.childNodes.length !== 1) this.eGui.replaceChildren(a);
  }

  // A double-click on the link is two clicks on a link, not a request to edit the URL.
  private onDoubleClick = (e: MouseEvent) => {
    e.stopPropagation();
  };
}
