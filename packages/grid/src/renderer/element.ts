export function createElement<K extends keyof HTMLElementTagNameMap>(tagName: K, className?: string, innerHTML?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tagName);
  if (className) {
    el.className = className;
  }
  if (innerHTML) {
    el.innerHTML = innerHTML;
  }
  return el;
}

export function div(className?: string, innerHTML?: string): HTMLDivElement {
  return createElement("div", className, innerHTML);
}

export function span(className?: string, innerHTML?: string): HTMLSpanElement {
  return createElement("span", className, innerHTML);
}

export function button(className?: string, innerHTML?: string): HTMLButtonElement {
  return createElement("button", className, innerHTML);
}
