import { ColumnType } from "../interfaces/column";
import { AggregateModel, AggregateType } from "../interfaces/aggregate";
import { MenuItem } from "../interfaces/menuItem";
import { ColumnMenuContext } from "./context";
import { IGridCore } from "../interfaces";
import { Column } from "../column/column";

type CapSummary = {
  sortable: boolean;
  groupable: boolean;
  hideable: boolean;
  pinning: "left" | "right" | "mixed" | null;
  sortDir: "asc" | "desc" | "mixed" | null;
  aggType: string;
  aggregated: boolean;
  colType?: ColumnType;
  exportable: boolean;
};

export class ColumnMenuService {
  constructor(private core: IGridCore) { }

  buildDefaultColumnMenu(ctx: ColumnMenuContext): MenuItem[] {
    const cap = this.summarize(ctx);
    const items: MenuItem[] = [];

    const colIDs = [ctx.targetColId, ...ctx.colIds.filter(id => id !== ctx.targetColId)];
    const multi = colIDs.length > 1;
    const s = (singular: string, plural?: string) => multi ? (plural ?? `${singular}s`) : singular;

    if (cap.sortable) {
      if (cap.sortDir === "asc") {
        items.push({ id: "sortDesc", label: "Sort Descending", command: "sort.setMany", payload: { colIDs, dir: "desc" } });
      } else if (cap.sortDir === "desc") {
        items.push({ id: "sortAsc", label: "Sort Ascending", command: "sort.setMany", payload: { colIDs, dir: "asc" } });
      } else {
        items.push(
          { id: "sortAsc", label: "Sort Ascending", command: "sort.setMany", payload: { colIDs, dir: "asc" } },
          { id: "sortDesc", label: "Sort Descending", command: "sort.setMany", payload: { colIDs, dir: "desc" } }
        );
      }
      if (cap.sortDir !== null) items.push({ id: "sortClear", label: `Clear ${s("Sort")}`, command: "sort.setMany", payload: { colIDs, dir: null } });
      items.push({ isSeparator: true });
    }
    if (cap.hideable) {
      items.push({ id: "hideColumns", label: `Hide ${s("Column")}`, command: "column.hideMany", payload: { colIDs } });
      items.push({ isSeparator: true });
    }
    if (cap.groupable) items.push({ id: "groupColumns", label: `Group by ${s("Column")}`, command: "group.setMany", payload: { colIDs } });
    if (cap.aggType) {
      const item: MenuItem = { id: "aggregateColumns", label: `Aggregate (${cap.aggType})`, command: "aggregate.openMany", payload: { colIDs } };
      if (cap.aggType === "numeric") {
        item.subMenu = [
          { id: "aggSum", label: "Sum", command: "aggregate.setMany", payload: { colIDs, agg: "sum" } },
          { id: "aggAvg", label: "Average", command: "aggregate.setMany", payload: { colIDs, agg: "avg" } },
          { id: "aggMin", label: "Min", command: "aggregate.setMany", payload: { colIDs, agg: "min" } },
          { id: "aggMax", label: "Max", command: "aggregate.setMany", payload: { colIDs, agg: "max" } },
          { id: "aggMedian", label: "Median", command: "aggregate.setMany", payload: { colIDs, agg: "median" } },
        ];
      } else if (cap.aggType === "string") {
        item.subMenu = [
          { id: "aggCount", label: "Count", command: "aggregate.setMany", payload: { colIDs, agg: "count" } },
          { id: "aggMin", label: "Min", command: "aggregate.setMany", payload: { colIDs, agg: "min" } },
          { id: "aggMax", label: "Max", command: "aggregate.setMany", payload: { colIDs, agg: "max" } },
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
      items.push({ id: "pinning", label: `Pin ${s("Column")}`, subMenu: pinMenus });
    }
    if (cap.exportable) {
      if (items.length > 0) items.push({ isSeparator: true });
      items.push(...this.getExportMenuItems(colIDs));
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

    console.log("Executing column menu item", item);

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
      // filter.open / filter.clear / pin / hide etc
      case "aggregate.setMany":
        return this.core.dispatch({
          type: "aggregateModelSet",
          aggregateModels: this.getNextAggregateModel(item.payload.colIDs, item.payload.agg),
        });
      case "columns.newSparklineCol":
        return this.core.dispatch({
          type: "addSparklineColumn",
          colIds: item.payload.colIDs,
          sparklineType: item.payload.type,
        });
      case "group.setMany":
        return this.core.dispatch({
          type: "rowGroupSet",
          colIds: item.payload.colIDs,
        });
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
