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
  hideable: boolean;
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
    const groupItem = this.getGroupMenuItem(colIDs, ctx.targetColId, cap.groupable, s);
    if (groupItem) items.push(groupItem);
    if (cap.aggregatable && cap.aggType) {
      const item: MenuItem = { id: "aggregateColumns", label: `Aggregate (${cap.aggType})`, command: "aggregate.openMany", payload: { colIDs } };
      if (cap.aggType === "numeric") {
        item.subMenu = [
          { id: "aggSum", label: "Sum", left: "icon-sum", command: "aggregate.setMany", payload: { colIDs, agg: "sum" } },
          { id: "aggAvg", label: "Average", left: "icon-avg", command: "aggregate.setMany", payload: { colIDs, agg: "avg" } },
          { id: "aggMin", label: "Min", left: "icon-min-number", command: "aggregate.setMany", payload: { colIDs, agg: "min" } },
          { id: "aggMax", label: "Max", left: "icon-max-number", command: "aggregate.setMany", payload: { colIDs, agg: "max" } },
          { id: "aggMedian", label: "Median", left: "icon-median", command: "aggregate.setMany", payload: { colIDs, agg: "median" } },
        ];
      } else if (cap.aggType === "string") {
        item.subMenu = [
          { id: "aggCount", label: "Count", left: "icon-count", command: "aggregate.setMany", payload: { colIDs, agg: "count" } },
          { id: "aggMin", label: "Min", left: "icon-min-string", command: "aggregate.setMany", payload: { colIDs, agg: "min" } },
          { id: "aggMax", label: "Max", left: "icon-max-string", command: "aggregate.setMany", payload: { colIDs, agg: "max" } },
        ];
        if (cap.colType === ColumnType.STRING) {
          item.subMenu.splice(1, 0, { id: "aggDistinctCount", label: "Distinct Count", command: "aggregate.setMany", payload: { colIDs, agg: "distinct_count" } });
        }
      }
      if (cap.aggregated) {
        item.subMenu!.push({ id: "aggClear", label: `Clear ${s("Aggregation")}`, command: "aggregate.setMany", payload: { colIDs, agg: null } });
      }
      items.push(item);
    }
    if (cap.pinning !== "mixed") {
      items.push({ isSeparator: true });
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
        items.push({ id: "export", label: "Export", left: "icon-export", subMenu: exportItems});
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
          aggregateModels: this.getNextAggregateModel(item.payload.colIDs, item.payload.agg),
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

  private summarize(ctx: ColumnMenuContext): CapSummary {
    const colIDs = [ctx.targetColId, ...ctx.colIds.filter(id => id !== ctx.targetColId)];

    let sortable = true;
    let groupable = true;
    let aggregatable = true;
    let hideable = true;
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
      if (!col.hideable) hideable = false;
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

    const aggregated = this.core.getAggregateModel().filter(f => colIDs.includes(f.key)).length == colIDs.length;

    return {
      sortable,
      groupable,
      aggregatable,
      sortDir,
      hideable,
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

  private getGroupMenuItem(
    colIDs: string[],
    targetColId: string,
    groupable: boolean,
    pluralize: (singular: string, plural?: string) => string,
  ): GroupMenuItem | null {
    const groupColumns = this.core.getRowGroupColumns();
    const groupIds = groupColumns.map(col => col.instanceID);
    const grouped = new Set(groupIds);
    const targetCol = this.core.getColumnModel().getById(targetColId);

    if (groupIds.length > 0 && targetCol?.isAutoGroupColumn()) {
      return {
        id: "ungroupAllColumns",
        label: `Ungroup${groupIds.length > 1 ? " All" : ""}`,
        left: "icon-group",
        command: "group.setMany",
        payload: { colIDs: [] },
      };
    }

    const userColIDs = this.expandUserColumnIds(colIDs);
    const allSelectedAreGrouped = userColIDs.length > 0 && userColIDs.every(id => grouped.has(id));
    if (allSelectedAreGrouped) {
      if (userColIDs.length > 1) {
        return {
          id: "ungroupAllColumns",
          label: "Ungroup All",
          left: "icon-group",
          command: "group.setMany",
          payload: { colIDs: [] },
        };
      }

      return {
        id: "ungroupColumns",
        label: "Ungroup",
        left: "icon-group",
        command: "group.setMany",
        payload: { colIDs: groupIds.filter(id => id !== userColIDs[0]) },
      };
    }

    if (!groupable) return null;
    return {
      id: "groupColumns",
      label: `Group by ${pluralize("Column")}`,
      left: "icon-group",
      command: "group.setMany",
      payload: { colIDs },
    };
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

  private getNextAggregateModel(colIDs: string[], agg: AggregateType | null): AggregateModel[] {
    const targetIds = this.expandAggregateColumnIds(colIDs);
    const selectedIds = new Set(targetIds);
    const next = this.core.getAggregateModel().filter(item => !selectedIds.has(item.key));
    if (agg == null) return next;
    next.push(...targetIds.map(key => ({ key, type: agg })));
    return next;
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
