export interface MenuItem {
  // identity
  id?: string;

  // rendering
  label?: string;
  left?: string | HTMLElement;
  right?: string | HTMLElement;
  /**
   * Keyboard accelerator shown after the label (platform-formatted: `"mod+k"` renders as ⌘K on
   * macOS, Ctrl+K elsewhere). **Display only** — menus are built per open, so nothing can be
   * harvested from an item list; register the actual binding separately with
   * `api.registerShortcut`, and keep the two from drifting by writing the same chord here.
   * An explicit `right` slot (and the submenu arrow) wins over this hint. Built-in items need no
   * hint: an item whose `command` matches a built-in binding shows that binding's chord
   * automatically.
   */
  shortcut?: string;

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
