import { markPresentational } from "../aria";

/** The floating filter row (`GridOptions.floatingFilter`): one section per header section. */
export interface FloatingFilterRowElements {
  /** `.pte-floating-filter-row`, positioned under the header levels inside the wrapper. */
  row: HTMLDivElement;
  leading: HTMLDivElement;
  left: HTMLDivElement;
  /** The centre section: the second ARIA header row (`aria-rowindex` 2). */
  center: HTMLDivElement;
  right: HTMLDivElement;
}

export interface HeaderWrapperElements {
  wrapper: HTMLDivElement;
  leading: HTMLDivElement;
  left: HTMLDivElement;
  center: HTMLDivElement;
  right: HTMLDivElement;
  floating: FloatingFilterRowElements;
}

export function createHeaderWrapper(): HeaderWrapperElements {
  const wrapper = document.createElement("div");
  wrapper.className = "pte-header-wrapper";

  const leading = document.createElement("div");
  leading.className = "pte-header-leading";
  wrapper.appendChild(leading);

  const left = document.createElement("div");
  left.className = "pte-header-left";
  wrapper.appendChild(left);

  const center = document.createElement("div");
  center.className = "pte-header";
  wrapper.appendChild(center);

  const right = document.createElement("div");
  right.className = "pte-header-right";
  wrapper.appendChild(right);

  // ARIA: the center section is THE header row (aria-rowindex 1); the other
  // sections are presentational — their leaf header cells are aria-owns-stitched into the
  // center row by the header renderer on every buildDOM.
  center.setAttribute("role", "row");
  center.setAttribute("aria-rowindex", "1");
  markPresentational(wrapper, leading, left, right);

  const floating = createFloatingFilterRow();
  wrapper.appendChild(floating.row);

  return {
    wrapper,
    leading,
    left,
    center,
    right,
    floating,
  };
}

/**
 * The floating filter row's skeleton: four sections mirroring the header's, inside one absolutely
 * positioned row the header renderer places under the levels. Hidden (`display: none`, so outside
 * the accessibility tree too) until `floatingFilter` turns it on. Like the header, only the centre
 * section is an ARIA row; the floating cells of every section are aria-owns-stitched into it.
 */
function createFloatingFilterRow(): FloatingFilterRowElements {
  const row = document.createElement("div");
  row.className = "pte-floating-filter-row";
  const section = (className: string) => {
    const el = document.createElement("div");
    el.className = className;
    row.appendChild(el);
    return el;
  };
  const leading = section("pte-floating-filter-leading");
  const left = section("pte-floating-filter-left");
  const center = section("pte-floating-filter");
  const right = section("pte-floating-filter-right");
  center.setAttribute("role", "row");
  center.setAttribute("aria-rowindex", "2");
  markPresentational(row, leading, left, right);
  return { row, leading, left, center, right };
}
