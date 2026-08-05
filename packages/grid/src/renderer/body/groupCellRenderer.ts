import { IRowNode } from "../../interfaces/iRowNode";

// Horizontal indent applied per grouping level, in pixels.
export const INDENT_PER_LEVEL = 20;

// Paint a group cell's contents into `cell`: a clickable expand/collapse chevron, an indent that
// reflects the group's depth, and the group label with its child count. The chevron carries the
// `pte-group-toggle` class + `data-group-id` so the interaction layer can resolve which group to
// toggle on click without this module depending on the core.
//
// The DOM is rebuilt each call (cheap: three elements) rather than diffed — the body row pool
// recycles cells across unrelated rows, so a stable structure can't be assumed.
export function renderGroupCell(cell: HTMLDivElement, row: IRowNode): void {
  cell.style.paddingLeft = `calc(var(--pte-cell-padding-left) + ${row.level * INDENT_PER_LEVEL}px)`;

  const toggle = document.createElement("span");
  toggle.className = "pte-group-toggle";
  toggle.setAttribute("data-group-id", row.id);
  toggle.setAttribute("role", "button");
  toggle.setAttribute("aria-expanded", String(!!row.isExpanded));

  const icon = document.createElement("span");
  icon.className = "pte-group-toggle-icon " + (row.isExpanded ? "icon-group-expanded" : "icon-group-collapsed");
  toggle.appendChild(icon);

  const label = document.createElement("span");
  label.className = "pte-group-label";
  const text = row.treeKey
    ?? (row.groupValue == null || row.groupValue === "" ? row.groupKey ?? "" : String(row.groupValue));
  const count = row.childCount != null ? ` (${row.childCount})` : "";
  label.textContent = `${text}${count}`;

  cell.replaceChildren(toggle, label);
}

/** Render a data-bearing tree row in the generated tree column. */
export function renderTreeCell(cell: HTMLDivElement, row: IRowNode): void {
  cell.style.paddingLeft = `calc(var(--pte-cell-padding-left) + ${row.level * INDENT_PER_LEVEL}px)`;
  const children = row.children ?? [];
  const parts: HTMLElement[] = [];

  if (children.length > 0) {
    const toggle = document.createElement("span");
    toggle.className = "pte-group-toggle";
    toggle.setAttribute("data-group-id", row.id);
    toggle.setAttribute("role", "button");
    toggle.setAttribute("aria-expanded", String(!!row.isExpanded));
    const icon = document.createElement("span");
    icon.className = "pte-group-toggle-icon "
      + (row.isExpanded ? "icon-group-expanded" : "icon-group-collapsed");
    toggle.appendChild(icon);
    parts.push(toggle);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "pte-tree-toggle-spacer";
    spacer.setAttribute("aria-hidden", "true");
    parts.push(spacer);
  }

  const label = document.createElement("span");
  label.className = "pte-group-label";
  label.textContent = row.treeKey ?? row.id;
  parts.push(label);
  cell.replaceChildren(...parts);
}
