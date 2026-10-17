import { useState } from "react";
import { createRoot } from "react-dom/client";
// The grid stylesheet is no longer auto-injected by the React wrapper; consumers
// (and this demo) import it explicitly. In a published app this would be
// `import "@agility-workbench/grid/styles.css"`.
import "@grid/theme/table.css";
import App from "./App";
import SelectionDemo from "./SelectionDemo";
import GroupingDemo from "./GroupingDemo";
import PivotDemo from "./PivotDemo";
import BlankPivotDemo from "./BlankPivotDemo";
import SheetsDemo from "./SheetsDemo";
import C3ViewIndexDemo from "./C3ViewIndexDemo";
import ServerSideGroupingDemo from "./ServerSideGroupingDemo";
import ServerSideAggregateScopeDemo from "./ServerSideAggregateScopeDemo";
import ServerSideTreeDataDemo from "./ServerSideTreeDataDemo";
import ServerSideTreeDuplicateIdDemo from "./ServerSideTreeDuplicateIdDemo";
import TreeDataDemo from "./TreeDataDemo";
import ColumnStateDemo from "./ColumnStateDemo";
import VisualStatesDemo from "./VisualStatesDemo";
import QuickFilterDemo from "./QuickFilterDemo";
import HeaderComponentDemo from "./HeaderComponentDemo";
import HeaderWrapDemo from "./HeaderWrapDemo";
import TooltipDemo from "./TooltipDemo";
import ActionFrameDemo from "./ActionFrameDemo";
import FooterVisibilityDemo from "./FooterVisibilityDemo";
import SparklineDemo from "./SparklineDemo";
import CellRenderersDemo from "./CellRenderersDemo";
import ToolbarDemo from "./ToolbarDemo";
import ResponsiveToolbarDemo from "./ResponsiveToolbarDemo";
import SavedViewsDemo from "./SavedViewsDemo";
import PinnedRowsDemo from "./PinnedRowsDemo";
import StickyGroupRowsDemo from "./StickyGroupRowsDemo";
import KitchenSinkDemo from "./KitchenSinkDemo";
import ColumnGroupExpanderDemo from "./ColumnGroupExpanderDemo";
import FullyThemedDemo from "./FullyThemedDemo";
import RowSelectionCheckboxDemo from "./RowSelectionCheckboxDemo";
import HighFrequencyDemo from "./HighFrequencyDemo";
import IndexedInsertDemo from "./IndexedInsertDemo";
import SetFilterComponentsDemo from "./SetFilterComponentsDemo";
import TouchDemo from "./TouchDemo";
import LocalizationDemo from "./LocalizationDemo";
import "./roboto-font.css";
import "./style.css";

const PAGES = [
  { id: "grid", label: "Grid demo", render: () => <App /> },
  { id: "indexedInsert", label: "Indexed row insertion", render: () => <IndexedInsertDemo /> },
  { id: "highFrequency", label: "High-frequency updates", render: () => <HighFrequencyDemo /> },
  { id: "selection", label: "Selection & keyboard nav", render: () => <SelectionDemo /> },
  { id: "rowSelectionCheckboxes", label: "Row selection checkboxes", render: () => <RowSelectionCheckboxDemo /> },
  { id: "visualStates", label: "Hover & visual states", render: () => <VisualStatesDemo /> },
  { id: "fullyThemed", label: "Fully themed grid", render: () => <FullyThemedDemo /> },
  { id: "grouping", label: "Row grouping", render: () => <GroupingDemo /> },
  { id: "pivot", label: "Pivot", render: () => <PivotDemo /> },
  { id: "blankPivot", label: "Blank pivot canvas", render: () => <BlankPivotDemo /> },
  { id: "sheets", label: "Sheets", render: () => <SheetsDemo /> },
  { id: "c3ViewIndex", label: "C3 grouped pagination", render: () => <C3ViewIndexDemo /> },
  { id: "serverSideGrouping", label: "Server-side grouping", render: () => <ServerSideGroupingDemo /> },
  { id: "serverSideAggregateScope", label: "SSRM: aggregate scope", render: () => <ServerSideAggregateScopeDemo /> },
  { id: "serverSideTreeData", label: "Server-side tree data", render: () => <ServerSideTreeDataDemo /> },
  { id: "serverSideTreeDuplicateId", label: "SSRM tree: duplicate id guard", render: () => <ServerSideTreeDuplicateIdDemo /> },
  { id: "treeData", label: "Tree data", render: () => <TreeDataDemo /> },
  { id: "pinnedRows", label: "Pinned rows", render: () => <PinnedRowsDemo /> },
  { id: "stickyGroups", label: "Sticky group rows", render: () => <StickyGroupRowsDemo /> },
  { id: "toolbar", label: "Toolbar", render: () => <ToolbarDemo /> },
  {
    id: "responsiveToolbar",
    label: "Responsive toolbar",
    render: () => <ResponsiveToolbarDemo />,
  },
  { id: "savedViews", label: "Saved views", render: () => <SavedViewsDemo /> },
  { id: "columnState", label: "Column state save/restore", render: () => <ColumnStateDemo /> },
  { id: "groupExpanders", label: "Group expanders", render: () => <ColumnGroupExpanderDemo /> },
  { id: "quickFilter", label: "Quick filter", render: () => <QuickFilterDemo /> },
  { id: "setFilterComponents", label: "Set-filter components", render: () => <SetFilterComponentsDemo /> },
  { id: "headerComponents", label: "Custom headers", render: () => <HeaderComponentDemo /> },
  { id: "headerWrap", label: "Header wrapping & locked columns", render: () => <HeaderWrapDemo /> },
  { id: "tooltips", label: "Tooltips", render: () => <TooltipDemo /> },
  { id: "actionFrame", label: "ActionFrame", render: () => <ActionFrameDemo /> },
  { id: "kitchenSink", label: "Kitchen sink", render: () => <KitchenSinkDemo /> },
  { id: "footerVisibility", label: "Footer visibility", render: () => <FooterVisibilityDemo /> },
  { id: "sparklines", label: "Sparklines", render: () => <SparklineDemo /> },
  { id: "cellRenderers", label: "Built-in renderers", render: () => <CellRenderersDemo /> },
  { id: "touch", label: "Touch & pointer", render: () => <TouchDemo /> },
  { id: "localization", label: "Localization", render: () => <LocalizationDemo /> },
] as const;

function Root() {
  const [page, setPage] = useState<(typeof PAGES)[number]["id"]>("grid");
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <nav style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 8px 0" }}>
        {PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn"
            onClick={() => setPage(p.id)}
            style={{ opacity: p.id === page ? 1 : 0.55 }}
          >
            {p.label}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1, minHeight: 0, padding: 8, boxSizing: "border-box" }}>
        {current.render()}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
