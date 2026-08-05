import { IGridCore } from "../interfaces";
import { Column } from "../column/column";
import { MenuItem } from "../interfaces/menuItem";
import type { RowPinnedPosition } from "../interfaces/gridOptions";
import { BodyMenuContext } from "./bodyContext";

type ExportScopeOption = "selection" | "selectedColumns" | "all";

export interface BodyMenuExportTarget {
  exportCSV: (options: { scope?: ExportScopeOption }) => void;
  exportExcel: (options: { scope?: ExportScopeOption; groupMode?: "tree" | "leaves" }) => void;
}

export interface BodyMenuPinningTarget {
  setRowPinned: (rowId: string, position: RowPinnedPosition | null) => void;
}

export interface BodyMenuClipboardTarget {
  copySelection: (opts: { includeHeaders: boolean; ctx: BodyMenuContext }) => void;
  cutSelection: (opts: { ctx: BodyMenuContext }) => void;
  pasteSelection: (opts: { ctx: BodyMenuContext }) => void;
  /** Whether the current selection contains at least one editable cell (gates Cut / Paste). */
  hasEditableCells: () => boolean;
}

interface BodyMenuServiceParams {
  core: IGridCore;
  exporter: BodyMenuExportTarget;
  clipboard: BodyMenuClipboardTarget;
  pinning: BodyMenuPinningTarget;
}

export class BodyMenuService {
  constructor(private params: BodyMenuServiceParams) { }

  buildDefaultBodyMenu(ctx: BodyMenuContext): MenuItem[] {
    const items: MenuItem[] = [];

    // Cut / Paste are edit operations, so they only appear when the selection includes at least one
    // editable cell (i.e. the grid has editable columns in range). Right-click has already focused
    // the target cell, so these act on the current selection just like the keyboard Ctrl+X / Ctrl+V.
    // Order: Cut, Copy, Copy with Headers, Paste (clipboard ops bracket the copy pair).
    const canEdit = this.params.clipboard.hasEditableCells();

    if (canEdit) {
      items.push({ id: "cut", label: "Cut", left: "icon-cut", command: "body.cut" });
    }
    items.push({ id: "copy", label: "Copy", left: "icon-copy", command: "body.copy" });
    items.push({ id: "copyWithHeaders", label: "Copy with Headers", left: "icon-copy", command: "body.copyWithHeaders" });
    if (canEdit) {
      items.push({ id: "paste", label: "Paste", left: "icon-paste", command: "body.paste" });
    }

    const opts = this.params.core.getOptions();
    const exportItems: MenuItem[] = [];
    if (opts.allowExportAsCSV) {
      exportItems.push({ id: "exportCSV", label: "CSV", command: "body.export.csv" });
    }
    if (opts.allowExportAsExcel) {
      exportItems.push(this.buildExcelExportItem(ctx));
    }
    if (exportItems.length > 0) {
      items.push({ isSeparator: true });
      items.push({ id: "export", label: "Export", left: "icon-export", subMenu: exportItems });
    }

    if (opts.rowPinningMenu) {
      const pinItem = this.buildRowPinningItem(ctx);
      if (pinItem) {
        items.push({ isSeparator: true });
        items.push(pinItem);
      }
    }

    return items;
  }

  // The "Pin row(s)" submenu. Targets are the rows owning the selected cells (the opener collapses
  // the selection to the clicked cell when the click lands outside it, so the selection snapshot is
  // always the right scope). A pin direction is disabled when every target already sits in that
  // band; Unpin appears once any target is currently pinned. No targets (e.g. the click landed on an
  // application-owned band row) → no item.
  private buildRowPinningItem(ctx: BodyMenuContext): MenuItem | null {
    const targets = this.resolvePinTargetRowIds(ctx);
    if (targets.length === 0) return null;

    const positions = targets.map(id => this.params.core.getDisplayedPinnedRowRef(id)?.position ?? null);
    const allIn = (position: RowPinnedPosition) => positions.every(p => p === position);
    const plural = targets.length > 1;

    const subMenu: MenuItem[] = [
      { id: "pinTop", label: "Pin to top", command: "body.pin.top", disabled: allIn("top") },
      { id: "pinBottom", label: "Pin to bottom", command: "body.pin.bottom", disabled: allIn("bottom") },
    ];
    if (positions.some(p => p !== null)) {
      subMenu.push({ id: "unpin", label: plural ? "Unpin rows" : "Unpin row", command: "body.pin.none" });
    }
    return { id: "pinRow", label: plural ? "Pin rows" : "Pin row", left: "icon-pin", subMenu };
  }

  // The model rows a pin/unpin acts on, per the selection snapshot: every row a cell range covers
  // (body span + any model-backed rows in the range's pinned-band segments), plus the selected rows
  // when the click landed on one; the clicked row alone otherwise (e.g. column selection).
  // Application-owned band rows never enter the row model, so filtering to model rows excludes them.
  private resolvePinTargetRowIds(ctx: BodyMenuContext): string[] {
    const rowModel = this.params.core.getRowModel();
    const isModelRow = (id: string | null | undefined): id is string => !!id && !!rowModel.getRowNode(id);
    const ids = new Set<string>();

    const range = ctx.selection.range;
    if (range) {
      // Band-only ranges carry rowStart 0 / rowEnd -1, so this loop covers exactly the body span.
      for (let i = range.rowStart; i <= range.rowEnd; i++) {
        const node = rowModel.getRowNodeAtViewIndex(i);
        if (node) ids.add(node.id);
      }
      for (const position of ["top", "bottom"] as const) {
        const seg = position === "top" ? range.pinnedTop : range.pinnedBottom;
        if (!seg) continue;
        for (let i = seg.start; i <= seg.end; i++) {
          const id = this.params.core.getDisplayedPinnedRow(position, i)?.id;
          if (isModelRow(id)) ids.add(id);
        }
      }
    }
    if (ctx.selection.rowIds.includes(ctx.rowId)) {
      for (const id of ctx.selection.rowIds) if (isModelRow(id)) ids.add(id);
    }
    if (ids.size === 0 && isModelRow(ctx.rowId)) ids.add(ctx.rowId);
    return Array.from(ids);
  }

  private applyRowPinning(ctx: BodyMenuContext, position: RowPinnedPosition | null): void {
    for (const rowId of this.resolvePinTargetRowIds(ctx)) {
      this.params.pinning.setRowPinned(rowId, position);
    }
  }

  // The Excel export item. When the grid is grouped AND the selection covers at least one group row,
  // it becomes a submenu offering the grouped-outline export vs a flat leaf dump. "Export with row
  // groups" is disabled (with an explanatory tooltip) when a cell range's column span excludes the
  // column that would host the group headings — so the export always reflects exactly what's
  // selected, with no surprise column appearing.
  private buildExcelExportItem(ctx: BodyMenuContext): MenuItem {
    if (!this.selectionCoversGroupRow(ctx)) {
      return { id: "exportExcel", label: "Excel", command: "body.export.excel" };
    }

    const headingInRange = this.groupHeadingColumnInRange(ctx);
    const withGroups: MenuItem = {
      id: "exportExcelTree",
      label: "Export with row groups",
      command: "body.export.excel.tree",
      disabled: !headingInRange,
      title: headingInRange ? undefined : "The group heading column is not part of the selected range.",
    };
    const leavesOnly: MenuItem = {
      id: "exportExcelLeaves",
      label: "Export leaf rows",
      command: "body.export.excel.leaves",
    };
    return { id: "exportExcel", label: "Excel", subMenu: [withGroups, leavesOnly] };
  }

  // True when the active selection includes at least one group (header) row.
  private selectionCoversGroupRow(ctx: BodyMenuContext): boolean {
    const rowModel = this.params.core.getRowModel();
    if (rowModel.getGroupNodes().length === 0) return false; // not grouped

    if (ctx.selection.rowIds.length > 0) {
      return ctx.selection.rowIds.some(id => !!rowModel.getRowNode(id)?.isGroup);
    }
    const range = ctx.selection.range;
    if (range) {
      for (let i = range.rowStart; i <= range.rowEnd; i++) {
        if (rowModel.getRowNodeAtViewIndex(i)?.isGroup) return true;
      }
    }
    return false;
  }

  // For a cell-range selection, whether the column that hosts group headings (per groupDisplayType)
  // falls within the range's column span. Row/column selections always include it (full column
  // span), so this only constrains cell ranges.
  private groupHeadingColumnInRange(ctx: BodyMenuContext): boolean {
    const range = ctx.selection.range;
    if (!range) return true; // not a cell range → headings always available

    const columnModel = this.params.core.getColumnModel();
    const lookup = columnModel.leafColumnLookup;
    const inRange = (globalIndex: number | undefined) =>
      globalIndex != null && globalIndex >= range.colStart && globalIndex <= range.colEnd;

    const mode = this.params.core.getOptions().groupDisplayType;

    if (mode === "multipleColumns") {
      // The label for each grouped level lives under the column tagged with that groupLevel; require
      // every level the selection actually spans to be in range.
      const levels = this.selectedGroupLevels(ctx);
      const byLevel = new Map<number, Column>();
      for (const col of columnModel.getLeaves()) {
        if (col.groupLevel != null) byLevel.set(col.groupLevel, col);
      }
      return levels.every(level => {
        const col = byLevel.get(level);
        return col && inRange(lookup.get(col.instanceID)?.globalIndex);
      });
    }

    if (mode === "groupRows") {
      // Label rides in the first exported (center) leaf column.
      const first = columnModel.getCenterLeaves()[0];
      return inRange(first ? lookup.get(first.instanceID)?.globalIndex : undefined);
    }

    // singleColumn row grouping uses the synthesized auto-group column; tree data uses its regular
    // hierarchy column. Both carry the hierarchy labels included by grouped selection exports.
    const hierarchy = columnModel.getHierarchyColumn();
    return inRange(hierarchy ? lookup.get(hierarchy.instanceID)?.globalIndex : undefined);
  }

  // The distinct group-node levels the selection covers (used for multipleColumns host checking).
  private selectedGroupLevels(ctx: BodyMenuContext): number[] {
    const rowModel = this.params.core.getRowModel();
    const levels = new Set<number>();
    const addNode = (node: { isGroup?: boolean; level?: number } | undefined) => {
      if (node?.isGroup && node.level != null) levels.add(node.level);
    };
    if (ctx.selection.rowIds.length > 0) {
      for (const id of ctx.selection.rowIds) addNode(rowModel.getRowNode(id));
    } else if (ctx.selection.range) {
      for (let i = ctx.selection.range.rowStart; i <= ctx.selection.range.rowEnd; i++) {
        addNode(rowModel.getRowNodeAtViewIndex(i));
      }
    }
    return Array.from(levels);
  }

  execute(item: MenuItem, ctx: BodyMenuContext) {
    if (item.disabled) return;
    if (item.onClick) return item.onClick();

    const scope = this.resolveExportScope(ctx);

    switch (item.command) {
      case "body.copy":
        return this.params.clipboard.copySelection({ includeHeaders: false, ctx });
      case "body.copyWithHeaders":
        return this.params.clipboard.copySelection({ includeHeaders: true, ctx });
      case "body.cut":
        return this.params.clipboard.cutSelection({ ctx });
      case "body.paste":
        return this.params.clipboard.pasteSelection({ ctx });
      case "body.export.csv":
        return this.params.exporter.exportCSV({ scope });
      case "body.export.excel":
        return this.params.exporter.exportExcel({ scope });
      case "body.export.excel.tree":
        return this.params.exporter.exportExcel({ scope, groupMode: "tree" });
      case "body.export.excel.leaves":
        return this.params.exporter.exportExcel({ scope, groupMode: "leaves" });
      case "body.pin.top":
        return this.applyRowPinning(ctx, "top");
      case "body.pin.bottom":
        return this.applyRowPinning(ctx, "bottom");
      case "body.pin.none":
        return this.applyRowPinning(ctx, null);
      default:
        console.error(`Unhandled body menu command: ${item.command}`);
        return;
    }
  }

  private resolveExportScope(ctx: BodyMenuContext): "selection" | "selectedColumns" | "all" {
    if (ctx.selection.range) return "selection";
    if (ctx.selection.colIds.length > 0) return "selectedColumns";
    return "all";
  }
}
