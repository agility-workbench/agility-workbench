import { IGridCore } from "../interfaces";
import { MenuItem } from "../interfaces/menuItem";
import { BodyMenuContext } from "./bodyContext";

export interface BodyMenuExportTarget {
  exportCSV: (options: { scope?: "selection" | "selectedColumns" | "all" }) => void;
  exportExcel: (options: { scope?: "selection" | "selectedColumns" | "all" }) => void;
}

export interface BodyMenuClipboardTarget {
  copySelection: (opts: { includeHeaders: boolean; ctx: BodyMenuContext }) => void;
}

interface BodyMenuServiceParams {
  core: IGridCore;
  exporter: BodyMenuExportTarget;
  clipboard: BodyMenuClipboardTarget;
}

export class BodyMenuService {
  constructor(private params: BodyMenuServiceParams) { }

  buildDefaultBodyMenu(ctx: BodyMenuContext): MenuItem[] {
    const items: MenuItem[] = [];

    items.push({ id: "copy", label: "Copy", command: "body.copy" });
    items.push({ id: "copyWithHeaders", label: "Copy with Headers", command: "body.copyWithHeaders" });

    const exportItems: MenuItem[] = [];
    if (this.params.core.getOptions().allowExportAsCSV) {
      exportItems.push({ id: "exportCSV", label: "CSV", command: "body.export.csv" });
    }
    if (this.params.core.getOptions().allowExportAsExcel) {
      exportItems.push({ id: "exportExcel", label: "Excel", command: "body.export.excel" });
    }
    if (exportItems.length > 0) {
      items.push({ isSeparator: true });
      items.push({ id: "export", label: "Export", subMenu: exportItems });
    }

    void ctx;
    return items;
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
      case "body.export.csv":
        return this.params.exporter.exportCSV({ scope });
      case "body.export.excel":
        return this.params.exporter.exportExcel({ scope });
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
