export interface HeaderWrapperElements {
  wrapper: HTMLDivElement;
  leading: HTMLDivElement;
  left: HTMLDivElement;
  center: HTMLDivElement;
  right: HTMLDivElement;
}

import { markPresentational } from "../aria";

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

  // ARIA (plan 2.1): the center section is THE header row (aria-rowindex 1); the other
  // sections are presentational — their leaf header cells are aria-owns-stitched into the
  // center row by the header renderer on every buildDOM.
  center.setAttribute("role", "row");
  center.setAttribute("aria-rowindex", "1");
  markPresentational(wrapper, leading, left, right);

  return {
    wrapper,
    leading,
    left,
    center,
    right,
  };
}
