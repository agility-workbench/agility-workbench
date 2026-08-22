/**
 * The smallest possible DOM helper set. The React and Angular playgrounds get their markup from a
 * template language; these demos build it by hand, so a tiny `h()` keeps the demo code about the
 * grid rather than about `document.createElement`.
 *
 * Nothing here touches the grid — it is plain DOM, deliberately dependency-free.
 */

export type Child = Node | string | number | null | undefined | false;

export interface Props {
  /** className for the element. */
  class?: string;
  /** textContent for the element (applied before children). */
  text?: string | number;
  /** Inline styles, merged onto element.style. */
  style?: Partial<CSSStyleDeclaration>;
  /** data-* attributes. */
  dataset?: Record<string, string>;
  /** Any other property (assigned when it exists on the element) or attribute. */
  [key: string]: unknown;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child == null || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null) continue;
      if (key === "class") node.className = String(value);
      else if (key === "text") node.textContent = String(value);
      else if (key === "style") Object.assign(node.style, value as Partial<CSSStyleDeclaration>);
      else if (key === "dataset") Object.assign(node.dataset, value as Record<string, string>);
      else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key in node) (node as unknown as Record<string, unknown>)[key] = value;
      else node.setAttribute(key, String(value));
    }
  }
  append(node, children);
  return node;
}

/** A `.btn` styled button (the class the playground stylesheet defines). */
export function btn(
  label: string,
  onClick: (event: MouseEvent) => void,
  props?: Props,
): HTMLButtonElement {
  return h("button", { class: "btn", type: "button", text: label, onClick, ...props });
}

export function checkbox(
  checked: boolean,
  onChange: (checked: boolean) => void,
  props?: Props,
): HTMLInputElement {
  return h("input", {
    type: "checkbox",
    checked,
    onChange: (event: Event) => onChange((event.target as HTMLInputElement).checked),
    ...props,
  });
}

export type Option = string | number | { value: string | number; label: string };

export function select(
  options: readonly Option[],
  value: string | number,
  onChange: (value: string) => void,
  props?: Props,
): HTMLSelectElement {
  const el = h("select", {
    onChange: (event: Event) => onChange((event.target as HTMLSelectElement).value),
    ...props,
  });
  for (const option of options) {
    const { value: optionValue, label } = typeof option === "object"
      ? option
      : { value: option, label: String(option) };
    el.appendChild(h("option", { value: String(optionValue), text: label }));
  }
  el.value = String(value);
  return el;
}

export function numberInput(
  value: string | number,
  onChange: (value: string) => void,
  props?: Props,
): HTMLInputElement {
  return h("input", {
    type: "number",
    value: String(value),
    onInput: (event: Event) => onChange((event.target as HTMLInputElement).value),
    ...props,
  });
}

/** `<label>` wrapping a control, with the caption before it (checkboxes read better after). */
export function field(caption: string, control: HTMLElement, props?: Props): HTMLLabelElement {
  const captionFirst = !(control instanceof HTMLInputElement && control.type === "checkbox");
  return h(
    "label",
    { style: { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px" }, ...props },
    captionFirst ? caption : control,
    captionFirst ? control : caption,
  );
}

/** A horizontal control strip, the layout every demo header uses. */
export function toolbarRow(...children: Child[]): HTMLDivElement {
  return h(
    "div",
    { style: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" } },
    ...children,
  );
}

/** A bordered group of controls with an uppercase caption (VisualStates-style panels). */
export function controlGroup(caption: string, ...children: Child[]): HTMLDivElement {
  return h(
    "div",
    {
      style: {
        display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap",
        padding: "6px 12px", border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: "8px",
      },
    },
    h("strong", {
      text: caption,
      style: { fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.4px", color: "#6b7280" },
    }),
    ...children,
  );
}

/** Muted explanatory copy. */
export function note(...children: Child[]): HTMLParagraphElement {
  return h(
    "p",
    { style: { margin: "0", fontSize: "13px", lineHeight: "1.5", color: "#6b7280" } },
    ...children,
  );
}

export function bold(text: string): HTMLElement {
  return h("strong", { text });
}

export function code(text: string): HTMLElement {
  return h("code", { text });
}

/** The flex column every demo uses as its root: fills the page, children scroll internally. */
export function demoRoot(...children: Child[]): HTMLDivElement {
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: "12px", height: "100%", minHeight: "0" } },
    ...children,
  );
}

/** The grid's host element: an explicit-height box, exactly as the wrappers require. */
export function gridHost(props?: Props): HTMLDivElement {
  return h("div", { style: { flex: "1", minWidth: "0", minHeight: "0" }, ...props });
}
