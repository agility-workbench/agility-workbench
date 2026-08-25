import { ColumnType } from "../interfaces/column";
import { AggregateModel, AggregateType } from "../interfaces/aggregate";
import { MenuItem } from "../interfaces/menuItem";
import { ColumnMenuContext } from "./context";
import { IGridCore } from "../interfaces";
import { Column } from "../column/column";
import { resolveColumnPanelOptions } from "../interfaces/gridOptions";

type CapSummary = {
  sortable: boolean;
  groupable: boolean;
  aggregatable: boolean;
  pivotable: boolean;
  hideable: boolean;
  pinnable: boolean;
  pinning: "left" | "right" | "mixed" | null;
  sortDir: "asc" | "desc" | "mixed" | null;
  aggType: string;
  aggregated: boolean;
  colType?: ColumnType;
  exportable: boolean;
};

type GroupMenuItem = MenuItem & {
  command: "group.setMany";
  payload: { colIDs: string[] };
};

/** Column-scoped export hooks, injected once the renderer's ExportRenderer exists. */
export interface ColumnMenuExportTarget {
  exportColumnCSV: (columnIDs: string[]) => void;
  exportColumnXLSX: (columnIDs: string[]) => void;
}

export interface ColumnPanelMenuTarget {
  openColumnPanel: () => void;
}

export class ColumnMenuService {
  private exporter: ColumnMenuExportTarget | null = null;
  private columnPanelTarget: ColumnPanelMenuTarget | null = null;

  constructor(private core: IGridCore) { }

  /** Wire the export target. Called by the renderer after its ExportRenderer is constructed. */
  setExportTarget(exporter: ColumnMenuExportTarget) {
    this.exporter = exporter;
  }

  setColumnPanelTarget(target: ColumnPanelMenuTarget) {
    this.columnPanelTarget = target;
  }

  buildDefaultColumnMenu(ctx: ColumnMenuContext): MenuItem[] {
    const cap = this.summarize(ctx);
    const items: MenuItem[] = [];

    const colIDs = [...ctx.colIds];
    if (!colIDs.includes(ctx.targetColId)) colIDs.push(ctx.targetColId);
    const multi = colIDs.length > 1;
    const s = (singular: string, plural?: string) => multi ? (plural ?? `${singular}s`) : singular;

    // A multi-column menu acts on the selection rather than on the header that opened it, and
    // pluralized labels alone are a weak signal for that. Name the scope up front so the menu can
    // never be read as being about one column. Single-column menus need no caption — the header
    // the menu is anchored to already says which column it is about.
    if (multi) {
      items.push(
        { id: "selectionScope", isLabel: true, label: this.describeScope(colIDs) },
        { isSeparator: true },
      );
    }

    if (cap.sortable) {
      if (cap.sortDir === "asc") {
        items.push({ id: "sortDesc", label: "Sort Descending", left: "icon-desc", command: "sort.setMany", payload: { colIDs, dir: "desc" } });
      } else if (cap.sortDir === "desc") {
        items.push({ id: "sortAsc", label: "Sort Ascending", left: "icon-asc", command: "sort.setMany", payload: { colIDs, dir: "asc" } });
      } else {
        items.push(
          { id: "sortAsc", label: "Sort Ascending", left: "icon-asc", command: "sort.setMany", payload: { colIDs, dir: "asc" } },
          { id: "sortDesc", label: "Sort Descending", left: "icon-desc", command: "sort.setMany", payload: { colIDs, dir: "desc" } }
        );
      }
      if (cap.sortDir !== null) items.push({ id: "sortClear", label: `Clear ${s("Sort")}`, left: "icon-sort-clear", command: "sort.setMany", payload: { colIDs, dir: null } });
      items.push({ isSeparator: true });
    }
    if (cap.hideable) {
      items.push({ id: "hideColumns", label: `Hide ${s("Column")}`, left: "icon-col-hide", command: "column.hideMany", payload: { colIDs } });
      items.push({ isSeparator: true });
    }
    items.push(...this.getGroupMenuItems(colIDs, ctx.targetColId, cap.groupable, s));
    items.push(...this.getPivotMenuItems(colIDs, ctx.targetColId, cap.pivotable, s));
    if (cap.aggregatable && cap.aggType) {
      const item: MenuItem = { id: "aggregateColumns", label: `Aggregate (${cap.aggType})`, command: "aggregate.openMany", payload: { colIDs } };
      // Each type is an independent toggle (a checkmark marks the applied ones): a column may
      // carry several aggregates at once — each is a distinct pivot measure.
      const agg = (id: string, label: string, type: AggregateType, left?: string): MenuItem => ({
        id,
        label,
        ...(left ? { left } : {}),
        ...(this.aggregateTypeApplied(colIDs, type) ? { right: "icon-check" } : {}),
        command: "aggregate.setMany",
        payload: { colIDs, agg: type },
      });
      if (cap.aggType === "numeric") {
        item.subMenu = [
          agg("aggSum", "Sum", AggregateType.SUM, "icon-sum"),
          agg("aggAvg", "Average", AggregateType.AVG, "icon-avg"),
          agg("aggMin", "Min", AggregateType.MIN, "icon-min-number"),
          agg("aggMax", "Max", AggregateType.MAX, "icon-max-number"),
          agg("aggMedian", "Median", AggregateType.MEDIAN, "icon-median"),
        ];
      } else if (cap.aggType === "string") {
        item.subMenu = [
          agg("aggCount", "Count", AggregateType.COUNT, "icon-count"),
          agg("aggMin", "Min", AggregateType.MIN, "icon-min-string"),
          agg("aggMax", "Max", AggregateType.MAX, "icon-max-string"),
        ];
        if (cap.colType === ColumnType.STRING) {
          item.subMenu.splice(1, 0, agg("aggDistinctCount", "Distinct Count", AggregateType.DISTINCT_COUNT));
        }
      }
      if (cap.aggregated) {
        item.subMenu!.push({ id: "aggClear", label: `Clear ${s("Aggregation")}`, command: "aggregate.setMany", payload: { colIDs, agg: null } });
      }
      items.push(item);
    }
    if (cap.pinnable && cap.pinning !== "mixed") {
      if (items.length > 0) {
        items.push({ isSeparator: true });
      }
      const pinMenus: MenuItem[] = [];
      if (cap.pinning === "left") {
        pinMenus.push({ id: "unpinColumns", label: `Unpin ${s("Column")}`, command: "column.pinMany", payload: { colIDs, pinned: null } });
      } else {
        pinMenus.push({ id: "pinLeft", label: "Pin Left", command: "column.pinMany", payload: { colIDs, pinned: "left" } });
      }
      if (cap.pinning === "right") {
        pinMenus.push({ id: "unpinColumns", label: `Unpin ${s("Column")}`, command: "column.pinMany", payload: { colIDs, pinned: null } });
      } else {
        pinMenus.push({ id: "pinRight", label: "Pin Right", command: "column.pinMany", payload: { colIDs, pinned: "right" } });
      }
      items.push({ id: "pinning", label: `Pin ${s("Column")}`, left: "icon-pin", subMenu: pinMenus });
    }
    if (cap.exportable) {
      const exportItems = this.getExportMenuItems(colIDs);
      if (exportItems.length > 0) {
        if (items.length > 0) {
          items.push({ isSeparator: true });
        }
        items.push({ id: "export", label: "Export", left: "icon-export", subMenu: exportItems });
      }
    }
    const panelOptions = resolveColumnPanelOptions(this.core.getOptions().columnPanel);
    if (panelOptions.enabled && panelOptions.trigger === "menu") {
      if (items.length > 0 && !items[items.length - 1].isSeparator) {
        items.push({ isSeparator: true });
      }
      items.push({
        id: "manageColumns",
        label: "Manage columns…",
        command: "columnPanel.open",
      });
    }

    if (ctx.colIds.length > 1) {
      items.unshift({ id: "clearSelection", label: `Clear Selection`, disabled: true });

      if (cap.colType === ColumnType.NUMBER || cap.colType === ColumnType.CURRENCY) {
        items.push({ isSeparator: true });
        items.push({
          id: "sparklines",
          label: "Show Sparklines",
          subMenu: [
            { id: "sparklinesBar", label: "Bar Sparklines", command: "columns.newSparklineCol", payload: { colIDs: colIDs, type: "bar" } },
            { id: "sparklinesLine", label: "Line Sparklines", command: "columns.newSparklineCol", payload: { colIDs: colIDs, type: "line" } },
            { id: "sparklinesArea", label: "Area Sparklines", command: "columns.newSparklineCol", payload: { colIDs: colIDs, type: "area" } },
          ]
        });
      }
    }

    if (items[items.length - 1]?.isSeparator) {
      return items.slice(0, -1);
    }

    return items;
  }

  execute(item: MenuItem, ctx: ColumnMenuContext) {
    // app onClick takes precedence
    if (item.disabled) return;
    if (item.onClick) return item.onClick();

    switch (item.command) {
      case "sort.setMany":
        return this.core.dispatch({
          type: "sortModelSet",
          sortItems: item.payload.colIDs.map((colId: string) => ({ key: colId, dir: item.payload.dir })),
        });
      case "column.hideMany":
        return this.core.dispatch({
          type: "columnVisibility",
          colIds: item.payload.colIDs,
          hidden: true,
        });
      case "column.pinMany":
        return this.core.dispatch({
          type: "columnPin",
          colIds: item.payload.colIDs,
          pinned: item.payload.pinned,
        });
      case "columnPanel.open":
        return this.columnPanelTarget?.openColumnPanel();
      // filter.open / filter.clear / pin / hide etc
      case "aggregate.setMany":
        return this.core.dispatch({
          type: "aggregateModelSet",
          // Default is the column menu's additive per-type toggle; the footer's function picker
          // passes mode "replace" (one function per footer cell).
          aggregateModels: item.payload.mode === "replace"
            ? this.getReplacementAggregateModel(item.payload.colIDs, item.payload.agg)
            : this.getNextAggregateModel(item.payload.colIDs, item.payload.agg),
        });
      case "columns.newSparklineCol":
        return this.core.dispatch({
          type: "addSparklineColumn",
          targetColId: ctx.targetColId,
          colIds: item.payload.colIDs,
          sparklineType: item.payload.type,
        });
      case "group.setMany":
        return this.core.dispatch({
          type: "rowGroupSet",
          colIds: item.payload.colIDs,
        });
      case "pivot.setMany":
        // Columns first (a state-only write while the mode is off), then the mode — entering
        // pivot derives once, with the new columns already in place.
        this.core.dispatch({ type: "pivotColumnsSet", colIds: item.payload.colIDs });
        if (item.payload.enable) this.core.dispatch({ type: "pivotModeSet", on: true });
        return;
      case "pivot.exit":
        this.core.dispatch({ type: "pivotColumnsSet", colIds: [] });
        return this.core.dispatch({ type: "pivotModeSet", on: false });
      case "export.csv":
        return this.exporter?.exportColumnCSV(item.payload.colIDs);
      case "export.excel":
        return this.exporter?.exportColumnXLSX(item.payload.colIDs);
      default:
        // unknown command -> ignore (or warn in dev)
        console.error(`Command ${item.command} is unhandled...`);
        return;
    }
  }

  /**
   * Caption for a multi-column menu: name the columns while the list is short enough to read, and
   * fall back to a count once it is not. Group headers contribute their own label, so a menu opened
   * from one reads as the group plus its leaves — which is what its items act on.
   */
  private describeScope(colIDs: string[]): string {
    const NAMED_LIMIT = 3;
    const columnModel = this.core.getColumnModel();
    const labels = colIDs
      .map(id => columnModel.getById(id)?.label?.trim())
      .filter((label): label is string => !!label);

    if (labels.length !== colIDs.length || labels.length > NAMED_LIMIT) {
      return `${colIDs.length} columns`;
    }
    return labels.join(", ");
  }

  private summarize(ctx: ColumnMenuContext): CapSummary {
    const colIDs = [ctx.targetColId, ...ctx.colIds.filter(id => id !== ctx.targetColId)];

    let sortable = true;
    let groupable = true;
    let aggregatable = true;
    let pivotable = true;
    let hideable = true;
    let pinnable = true;
    let colTypes: ColumnType | "mixed" | null = null;
    let sortDir: "asc" | "desc" | "mixed" | null = null;
    let pinning: "left" | "right" | "mixed" | null = null;
    let exportable = true;
    for (const colID of colIDs) {
      const col = this.core.getColumnModel().getById(colID);
      if (!col) continue;
      if (!col.sortable) {
        sortable = false;
      } else if (sortDir !== "mixed") {
        const colSortDir = this.identifySortDir(col);
        if (!sortDir) {
          sortDir = colSortDir;
        } else if (colSortDir !== sortDir) {
          sortDir = "mixed";
        }
      }
      if (!col.groupable) groupable = false;
      if (!col.aggregatable) aggregatable = false;
      if (!col.pivotable) pivotable = false;
      if (!col.hideable) hideable = false;
      if (!col.pinnable) pinnable = false;
      if (col.children.length == 0) {
        const colType = col.type || ColumnType.STRING;
        if (!colTypes) {
          colTypes = colType;
        } else if (colTypes == "mixed") {
          continue;
        } else if (colType !== colTypes) {
          colTypes = "mixed";
        }
      }
      if (!col.exportable) exportable = false;
      if (!pinning) {
        pinning = col.pinned || null;
      } else if (col.pinned !== pinning) {
        pinning = "mixed";
      }
    }

    let aggType = "";
    if (colTypes && colTypes !== "mixed") {
      if (colTypes === ColumnType.NUMBER || colTypes === ColumnType.CURRENCY) {
        aggType = "numeric";
      } else {
        aggType = "string";
      }
    }

    if (sortDir === "mixed") sortable = false;

    // Every selected column carries at least one aggregate (a column may carry several types).
    const aggregateModel = this.core.getAggregateModel();
    const aggregated = colIDs.length > 0
      && colIDs.every(id => aggregateModel.some(f => f.key === id));

    return {
      sortable,
      groupable,
      aggregatable,
      pivotable,
      sortDir,
      hideable,
      pinnable,
      pinning,
      aggType,
      aggregated,
      colType: colTypes === "mixed" ? undefined : (colTypes as ColumnType),
      exportable,
    };
  }

  private getExportMenuItems(colIDs: string[]): MenuItem[] {
    const items: MenuItem[] = [];
    if (this.core.getOptions().allowExportAsCSV) {
      items.push({ id: "exportCSV", label: "Export as CSV", command: "export.csv", payload: { colIDs } });
    }
    if (this.core.getOptions().allowExportAsExcel) {
      items.push({ id: "exportExcel", label: "Export as Excel", command: "export.excel", payload: { colIDs } });
    }
    return items;
  }

  private getGroupMenuItems(
    colIDs: string[],
    targetColId: string,
    groupable: boolean,
    pluralize: (singular: string, plural?: string) => string,
  ): MenuItem[] {
    const groupColumns = this.core.getRowGroupColumns();
    const groupIds = groupColumns.map(col => col.instanceID);
    const grouped = new Set(groupIds);
    const targetCol = this.core.getColumnModel().getById(targetColId);

    if (groupIds.length > 0 && targetCol?.isAutoGroupColumn()) {
      return [{
        id: "ungroupAllColumns",
        label: `Ungroup${groupIds.length > 1 ? " All" : ""}`,
        left: "icon-group",
        command: "group.setMany",
        payload: { colIDs: [] },
      }];
    }

    const userColIDs = this.expandUserColumnIds(colIDs);
    const allSelectedAreGrouped = userColIDs.length > 0 && userColIDs.every(id => grouped.has(id));
    if (allSelectedAreGrouped) {
      const selectedGroupIds = new Set(userColIDs);
      const remainingGroupIds = groupIds.filter(id => !selectedGroupIds.has(id));
      if (remainingGroupIds.length === 0) {
        return [{
          id: "ungroupAllColumns",
          label: groupIds.length > 1 ? "Ungroup All" : "Ungroup",
          left: "icon-group",
          command: "group.setMany",
          payload: { colIDs: [] },
        }];
      }

      const removeItem: GroupMenuItem = {
        id: "ungroupColumns",
        label: `Remove ${pluralize("Column")} from Grouping`,
        command: "group.setMany",
        payload: { colIDs: remainingGroupIds },
      };
      const clearItem: GroupMenuItem = {
        id: "ungroupAllColumns",
        label: "Clear All Grouping",
        command: "group.setMany",
        payload: { colIDs: [] },
      };

      return [{
        id: "ungroupColumnsMenu",
        label: "Grouping",
        left: "icon-group",
        subMenu: [removeItem, clearItem],
      }];
    }

    if (!groupable) return [];
    const replaceItem: GroupMenuItem = {
      id: "groupColumns",
      label: groupIds.length > 0 ? "Replace Existing Grouping" : `Group by ${pluralize("Column")}`,
      command: "group.setMany",
      payload: { colIDs },
    };

    if (groupIds.length === 0) {
      replaceItem.left = "icon-group";
      return [replaceItem];
    }

    const nextGroupIds = [
      ...groupIds,
      ...userColIDs.filter(id => !grouped.has(id)),
    ];
    const addItem: GroupMenuItem = {
      id: "addGroupColumns",
      label: "Add to Existing Grouping",
      command: "group.setMany",
      payload: { colIDs: nextGroupIds },
    };

    return [{
      id: "groupColumnsMenu",
      label: `Group by ${pluralize("Column")}`,
      left: "icon-group",
      subMenu: [replaceItem, addItem],
    }];
  }

  // Pivot items mirror the grouping items' shapes: fresh pivot / replace-or-add submenu /
  // remove-or-clear, collapsing to "Clear Pivot" (which also exits pivot mode) when the selection
  // covers every pivot column. Client-side row model only. Generated pivot columns and the
  // synthesized auto/tree/utility columns are pivotable: false, so they never grow these items —
  // except the auto-group column while pivoted, which offers the exit.
  private getPivotMenuItems(
    colIDs: string[],
    targetColId: string,
    pivotable: boolean,
    pluralize: (singular: string, plural?: string) => string,
  ): MenuItem[] {
    if (this.core.getRowModel().getType() !== "clientSide" || this.core.getOptions().treeData) return [];
    const pivotMode = this.core.getPivotMode();
    const pivotColumns = this.core.getPivotColumns();
    const pivotIds = pivotColumns.map(col => col.instanceID);
    const pivoted = new Set(pivotIds);
    const targetCol = this.core.getColumnModel().getById(targetColId);

    const exitItem: MenuItem = {
      id: "pivotExit",
      label: "Exit Pivot Mode",
      left: "icon-pivot",
      command: "pivot.exit",
      payload: {},
    };
    if (pivotMode && targetCol?.isAutoGroupColumn()) return [exitItem];

    if (!pivotable) return [];
    const userColIDs = this.expandUserColumnIds(colIDs).filter(id => {
      const col = this.core.getColumnModel().getById(id);
      return col?.pivotable ?? false;
    });
    if (userColIDs.length === 0) return [];

    const allSelectedArePivoted = pivotMode && userColIDs.every(id => pivoted.has(id));
    if (allSelectedArePivoted) {
      const selected = new Set(userColIDs);
      const remainingIds = pivotIds.filter(id => !selected.has(id));
      if (remainingIds.length === 0) return [exitItem];
      return [{
        id: "unpivotColumnsMenu",
        label: "Pivot",
        left: "icon-pivot",
        subMenu: [
          {
            id: "unpivotColumns",
            label: `Remove ${pluralize("Column")} from Pivot`,
            command: "pivot.setMany",
            payload: { colIDs: remainingIds },
          },
          exitItem,
        ],
      }];
    }

    const replaceItem: MenuItem = {
      id: "pivotColumns",
      label: pivotMode && pivotIds.length > 0 ? "Replace Existing Pivot" : `Pivot on ${pluralize("Column")}`,
      command: "pivot.setMany",
      payload: { colIDs: userColIDs, enable: true },
    };
    if (!pivotMode || pivotIds.length === 0) {
      replaceItem.left = "icon-pivot";
      return [replaceItem];
    }

    const addItem: MenuItem = {
      id: "addPivotColumns",
      label: "Add to Existing Pivot",
      command: "pivot.setMany",
      payload: { colIDs: [...pivotIds, ...userColIDs.filter(id => !pivoted.has(id))], enable: true },
    };
    return [{
      id: "pivotColumnsMenu",
      label: `Pivot on ${pluralize("Column")}`,
      left: "icon-pivot",
      subMenu: [replaceItem, addItem],
    }];
  }

  private expandUserColumnIds(colIDs: string[]): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();

    for (const colID of colIDs) {
      const col = this.core.getColumnModel().getById(colID);
      if (!col || col.isInternal()) continue;
      const leaves = col.children.length > 0 ? col.getVisibleLeaves() : [col];
      for (const leaf of leaves) {
        if (leaf.isInternal() || seen.has(leaf.instanceID)) continue;
        seen.add(leaf.instanceID);
        ids.push(leaf.instanceID);
      }
    }

    return ids;
  }

  /**
   * Toggle semantics per (column, type): every target column already carrying the type drops it,
   * otherwise the type is added to the columns missing it — a column accumulates types, each a
   * distinct pivot measure. `agg: null` clears every aggregate on the target columns.
   */
  private getNextAggregateModel(colIDs: string[], agg: AggregateType | null): AggregateModel[] {
    const targetIds = this.expandAggregateColumnIds(colIDs);
    const model = this.core.getAggregateModel();
    if (agg == null) {
      const selectedIds = new Set(targetIds);
      return model.filter(item => !selectedIds.has(item.key));
    }
    const has = (id: string) => model.some(item => item.key === id && item.type === agg);
    if (targetIds.length > 0 && targetIds.every(has)) {
      return model.filter(item => !(item.type === agg && targetIds.includes(item.key)));
    }
    return [...model, ...targetIds.filter(id => !has(id)).map(key => ({ key, type: agg }))];
  }

  /** Single-choice semantics: drop every aggregate on the target columns, set the chosen type. */
  private getReplacementAggregateModel(colIDs: string[], agg: AggregateType | null): AggregateModel[] {
    const targetIds = this.expandAggregateColumnIds(colIDs);
    const selectedIds = new Set(targetIds);
    const next = this.core.getAggregateModel().filter(item => !selectedIds.has(item.key));
    if (agg == null) return next;
    next.push(...targetIds.map(key => ({ key, type: agg })));
    return next;
  }

  /** Whether every target column already carries this aggregate type (the menu checkmark). */
  private aggregateTypeApplied(colIDs: string[], agg: AggregateType): boolean {
    const targetIds = this.expandAggregateColumnIds(colIDs);
    if (targetIds.length === 0) return false;
    const model = this.core.getAggregateModel();
    return targetIds.every(id => model.some(item => item.key === id && item.type === agg));
  }

  private expandAggregateColumnIds(colIDs: string[]): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();

    for (const colID of colIDs) {
      const col = this.core.getColumnModel().getById(colID);
      if (!col) continue;
      const leaves = col.children.length > 0 ? col.getVisibleLeaves() : [col];
      for (const leaf of leaves) {
        if (seen.has(leaf.instanceID)) continue;
        seen.add(leaf.instanceID);
        ids.push(leaf.instanceID);
      }
    }

    return ids;
  }

  // Identify sort dir based on the first visible child with sort applied on. If no child has sort applied, return null.
  private identifySortDir(col: Column): "asc" | "desc" | "mixed" | null {
    if (col.children.length === 0) return this.getSortDirForColumn(col);
    for (const child of col.getVisibleLeaves()) {
      const childDir = this.identifySortDir(child);
      if (childDir) return childDir;
    }
    return null;
  }

  private getSortDirForColumn(col: Column): "asc" | "desc" | null {
    const sort = this.core.getSortModel().items.find(item =>
      item.col.instanceID === col.instanceID
      || item.col.colId === col.colId
      || item.col.key === col.key
      || item.key === col.colId
      || item.key === col.key
    );
    return sort?.dir ?? null;
  }

}
