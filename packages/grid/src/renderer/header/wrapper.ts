export interface HeaderWrapperElements {
  wrapper: HTMLDivElement;
  leading: HTMLDivElement;
  left: HTMLDivElement;
  center: HTMLDivElement;
  right: HTMLDivElement;
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

  return {
    wrapper,
    leading,
    left,
    center,
    right,
  };
}
