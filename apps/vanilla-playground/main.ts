// The grid stylesheet is not auto-injected by the renderer's consumers; a plain-JS host imports it
// explicitly. In a published app this would be `import "@agility-workbench/grid/styles.css"`.
import "@grid/theme/table.css";
import "./roboto-font.css";
import "./style.css";

import { h } from "./dom";
import { mountActionFrameDemo } from "./demos/action-frame-demo";
import { mountC3ViewIndexDemo } from "./demos/c3-view-index-demo";
import { mountColumnGroupExpanderDemo } from "./demos/column-group-expander-demo";
import { mountColumnStateDemo } from "./demos/column-state-demo";
import { mountFooterVisibilityDemo } from "./demos/footer-visibility-demo";
import { mountFullyThemedDemo } from "./demos/fully-themed-demo";
import { mountGridDemo } from "./demos/grid-demo";
import { mountGroupingDemo } from "./demos/grouping-demo";
import { mountPivotDemo } from "./demos/pivot-demo";
import { mountHeaderComponentDemo } from "./demos/header-component-demo";
import { mountHighFrequencyDemo } from "./demos/high-frequency-demo";
import { mountIndexedInsertDemo } from "./demos/indexed-insert-demo";
import { mountKitchenSinkDemo } from "./demos/kitchen-sink-demo";
import { mountPinnedRowsDemo } from "./demos/pinned-rows-demo";
import { mountQuickFilterDemo } from "./demos/quick-filter-demo";
import { mountResponsiveToolbarDemo } from "./demos/responsive-toolbar-demo";
import { mountRowSelectionCheckboxDemo } from "./demos/row-selection-checkbox-demo";
import { mountSavedViewsDemo } from "./demos/saved-views-demo";
import { mountSelectionDemo } from "./demos/selection-demo";
import { mountServerSideGroupingDemo } from "./demos/server-side-grouping-demo";
import { mountSetFilterComponentsDemo } from "./demos/set-filter-components-demo";
import { mountSparklineDemo } from "./demos/sparkline-demo";
import { mountSheetsDemo } from "./demos/sheets-demo";
import { mountStickyGroupRowsDemo } from "./demos/sticky-group-rows-demo";
import { mountToolbarDemo } from "./demos/toolbar-demo";
import { mountTooltipDemo } from "./demos/tooltip-demo";
import { mountTreeDataDemo } from "./demos/tree-data-demo";
import { mountVisualStatesDemo } from "./demos/visual-states-demo";

/**
 * A demo mounts itself into the supplied container and returns its teardown function. That is the
 * whole framework here: no component model, no reactivity — each page owns its DOM and its grid.
 */
export type DemoMount = (container: HTMLElement) => () => void;

// Same ids, labels, and order as the React playground's PAGES (apps/react-playground/main.tsx).
const PAGES: Array<{ id: string; label: string; mount: DemoMount }> = [
  { id: "grid", label: "Grid demo", mount: mountGridDemo },
  { id: "indexedInsert", label: "Indexed row insertion", mount: mountIndexedInsertDemo },
  { id: "highFrequency", label: "High-frequency updates", mount: mountHighFrequencyDemo },
  { id: "selection", label: "Selection & keyboard nav", mount: mountSelectionDemo },
  { id: "rowSelectionCheckboxes", label: "Row selection checkboxes", mount: mountRowSelectionCheckboxDemo },
  { id: "visualStates", label: "Hover & visual states", mount: mountVisualStatesDemo },
  { id: "fullyThemed", label: "Fully themed grid", mount: mountFullyThemedDemo },
  { id: "grouping", label: "Row grouping", mount: mountGroupingDemo },
  { id: "pivot", label: "Pivot", mount: mountPivotDemo },
  { id: "sheets", label: "Sheets", mount: mountSheetsDemo },
  { id: "c3ViewIndex", label: "C3 grouped pagination", mount: mountC3ViewIndexDemo },
  { id: "serverSideGrouping", label: "Server-side grouping", mount: mountServerSideGroupingDemo },
  { id: "treeData", label: "Tree data", mount: mountTreeDataDemo },
  { id: "pinnedRows", label: "Pinned rows", mount: mountPinnedRowsDemo },
  { id: "stickyGroups", label: "Sticky group rows", mount: mountStickyGroupRowsDemo },
  { id: "toolbar", label: "Toolbar", mount: mountToolbarDemo },
  { id: "responsiveToolbar", label: "Responsive toolbar", mount: mountResponsiveToolbarDemo },
  { id: "savedViews", label: "Saved views", mount: mountSavedViewsDemo },
  { id: "columnState", label: "Column state save/restore", mount: mountColumnStateDemo },
  { id: "groupExpanders", label: "Group expanders", mount: mountColumnGroupExpanderDemo },
  { id: "quickFilter", label: "Quick filter", mount: mountQuickFilterDemo },
  { id: "setFilterComponents", label: "Set-filter components", mount: mountSetFilterComponentsDemo },
  { id: "headerComponents", label: "Custom headers", mount: mountHeaderComponentDemo },
  { id: "tooltips", label: "Tooltips", mount: mountTooltipDemo },
  { id: "actionFrame", label: "ActionFrame", mount: mountActionFrameDemo },
  { id: "kitchenSink", label: "Kitchen sink", mount: mountKitchenSinkDemo },
  { id: "footerVisibility", label: "Footer visibility", mount: mountFooterVisibilityDemo },
  { id: "sparklines", label: "Sparklines", mount: mountSparklineDemo },
];

const root = document.getElementById("root")!;
const nav = h("nav", {
  style: { display: "flex", flexWrap: "wrap", gap: "8px", padding: "8px 8px 0" },
});
const view = h("div", {
  style: { flex: "1", minHeight: "0", padding: "8px", boxSizing: "border-box" },
});

root.appendChild(h("div", {
  style: { height: "100%", display: "flex", flexDirection: "column" },
}, nav, view));

const buttons = new Map<string, HTMLButtonElement>();
for (const page of PAGES) {
  const button = h("button", {
    type: "button",
    class: "btn",
    text: page.label,
    onClick: () => {
      // The hash keeps the selected demo across a reload — handy without HMR component state.
      window.location.hash = page.id;
    },
  });
  buttons.set(page.id, button);
  nav.appendChild(button);
}

let dispose: (() => void) | null = null;
let currentId: string | null = null;

function show(id: string): void {
  const page = PAGES.find(candidate => candidate.id === id) ?? PAGES[0];
  if (page.id === currentId) return;

  // Tear the previous demo down before its container is emptied: a grid must detach itself while
  // its DOM is still in place (timers, observers, and document-level listeners hang off it).
  dispose?.();
  dispose = null;
  view.replaceChildren();

  currentId = page.id;
  for (const [pageId, button] of buttons) {
    button.style.opacity = pageId === page.id ? "1" : "0.55";
  }

  dispose = page.mount(view);
}

window.addEventListener("hashchange", () => show(window.location.hash.slice(1)));
show(window.location.hash.slice(1));
