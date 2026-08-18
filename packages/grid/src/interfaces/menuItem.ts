export interface MenuItem {
  // identity
  id?: string;

  // rendering
  label?: string;
  left?: string | HTMLElement;
  right?: string | HTMLElement;

  // behavior
  disabled?: boolean;
  // native tooltip (title attr) — useful to explain why a disabled item is disabled
  title?: string;

  // For default items
  command?: string;
  payload?: any;

  // For app-provided items
  onClick?: () => void;

  // hierarchy
  subMenu?: MenuItem[];

  // structure
  isSeparator?: boolean;
  /**
   * Renders as static, non-interactive text rather than a command — a caption for the items around
   * it. Valid anywhere in a menu (and in a `subMenu`), as often as needed.
   *
   * It is not focusable and not clickable, so keyboard navigation skips it and `onClick` /
   * `command` are ignored. Only `label`, `left`, `right`, and `id` are meaningful. Built-in labels
   * carry a stable `id` so an application getter can relabel or drop them.
   */
  isLabel?: boolean;

  // extension points
  extra?: any; // app-specific data
}
