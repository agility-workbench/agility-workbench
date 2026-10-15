/**
 * The header cell for a column, looked up inside `scope` (the grid's header wrapper or root) rather
 * than through `document.getElementById`: a grid mounted inside a shadow root is invisible to the
 * document-level lookup, and two grids on one page must never resolve each other's cells. Header
 * cells carry the column's instanceID as their element id; matched via an attribute selector so the
 * id never needs CSS-identifier escaping (UUIDs may start with a digit, which `#id` rejects).
 */
export function findHeaderCell(scope: ParentNode, instanceID: string): HTMLElement | null {
  const value = instanceID.replace(/[\\"]/g, "\\$&").replace(/\n/g, "\\a ");
  return scope.querySelector<HTMLElement>(`.pte-hcell[id="${value}"]`);
}
