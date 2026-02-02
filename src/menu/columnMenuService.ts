import { ColumnType } from "../interfaces/column";
import { MenuItem } from "../interfaces/menuItem";
import { ColumnMenuContext } from "./context";
import { IGridCore } from "../interfaces";

type CapSummary = {
  sortable: boolean;
  groupable: boolean;
  hideable: boolean;
  sortDir: "asc" | "desc" | "mixed" | null;
  filtered: boolean;
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

    if (cap.sortable) {
      if (cap.sortDir === "asc") items.push({ id: "sortDesc", label: "Sort Descending", command: "sort.setMany", payload: { colIDs, dir: "desc" } });
      else if (cap.sortDir === "desc") items.push({ id: "sortAsc", label: "Sort Ascending", command: "sort.setMany", payload: { colIDs, dir: "asc" } });
      else items.push(
        { id: "sortAsc", label: "Sort Ascending", command: "sort.setMany", payload: { colIDs, dir: "asc" } },
        { id: "sortDesc", label: "Sort Descending", command: "sort.setMany", payload: { colIDs, dir: "desc" } }
      );
      if (cap.sortDir !== null) items.push({ id: "sortClear", label: "Clear Sort", command: "sort.setMany", payload: { colIDs, dir: null } });
      items.push({ isSeparator: true });
    }
    if (cap.hideable) {
      items.push({ id: "hideColumns", label: "Hide Column", command: "column.hideMany", payload: { colIDs } });
      items.push({ isSeparator: true });
    }
    if (cap.groupable) items.push({ id: "groupColumns", label: "Group by Column", command: "group.setMany", payload: { colIDs } });
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
      }
      if (cap.aggregated) {
        item.subMenu!.push({ id: "aggClear", label: "Clear Aggregation", command: "aggregate.setMany", payload: { colIDs, agg: null } });
      }
      items.push(item);
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
            { id: "sparklinesBar", label: "Bar Sparklines", command: "columns.newSparklineCol", payload: { cols: colIDs, type: "bar" } },
            { id: "sparklinesLine", label: "Line Sparklines", command: "columns.newSparklineCol", payload: { cols: colIDs, type: "line" } },
            { id: "sparklinesArea", label: "Area Sparklines", command: "columns.newSparklineCol", payload: { cols: colIDs, type: "area" } },
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
        return this.core.dispatch({ type: "sortModelSet", sortModel: item.payload.colIDs.map((colId: string) => ({ key: colId, dir: item.payload.dir })) });

      // filter.open / filter.clear / pin / hide etc

      default:
        // unknown command -> ignore (or warn in dev)
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
    let selectedCount = 0;
    let exportable = true;
    const sorts: Record<string, "asc" | "desc"> = {};
    for (const sort of this.core.getSortModel()) {
      if (colIDs.includes(sort.key)) {
        sorts[sort.key] = sort.dir;
      }
    }
    for (const colID of colIDs) {
      const col = this.core.getColumnModel().getById(colID);
      if (!col) continue;
      if (col.children.length > 0) continue;
      selectedCount++;
      if (!col.sortable) {
        sortable = false;
      } else if (sortDir !== "mixed") {
        if (sorts[colID]) {
          if (!sortDir) {
            sortDir = sorts[colID];
          } else if (sorts[colID] !== sortDir) {
            sortDir = "mixed";
          }
        }
      }
      if (!col.groupable) groupable = false;
      if (!col.hideable) hideable = false;
      const colType = col.type || ColumnType.STRING;
      if (!colTypes) {
        colTypes = colType;
      } else if (colTypes == "mixed") {
        continue;
      } else if (colType !== colTypes) {
        colTypes = "mixed";
      }
      if (!col.exportable) exportable = false;
    }

    let aggType = "";
    if (colTypes && colTypes !== "mixed") {
      if (colTypes === ColumnType.NUMBER || colTypes === ColumnType.CURRENCY) {
        aggType = "numeric";
      } else {
        aggType = "string";
      }
    }

    const filtered = this.core.getFilterModel().filter(f => colIDs.includes(f.key)).length == colIDs.length;
    const aggregated = this.core.getAggregateModel().filter(f => colIDs.includes(f.key)).length == colIDs.length;

    return {
      sortable,
      groupable,
      filtered,
      sortDir,
      hideable,
      aggType,
      aggregated,
      colType: colTypes === "mixed" ? undefined : (colTypes as ColumnType),
      exportable,
    };
  }

  private getExportMenuItems(colIDs: string[]): MenuItem[] {
    const items: MenuItem[] = [];
    if (this.core.getOptions().allowExportAsCSV) {
      items.push({ id: "exportCSV", label: "Export as CSV", command: "export.csv", payload: { colIDs} });
    }
    if (this.core.getOptions().allowExportAsExcel) {
      items.push({ id: "exportExcel", label: "Export as Excel", command: "export.excel", payload: { colIDs} });
    }
    return items;
  }

}
