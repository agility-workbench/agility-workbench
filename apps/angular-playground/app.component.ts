import { Component, effect, signal } from "@angular/core";
import { ActionFrameDemoComponent } from "./action-frame-demo.component";
import { BasicGridDemoComponent } from "./basic-grid-demo.component";
import { ColumnGroupExpanderDemoComponent } from "./column-group-expander-demo.component";
import { ColumnStateDemoComponent } from "./column-state-demo.component";
import { ComponentsDemoComponent } from "./components-demo.component";
import { FooterVisibilityDemoComponent } from "./footer-visibility-demo.component";
import { FullyThemedDemoComponent } from "./fully-themed-demo.component";
import { GridDemoComponent } from "./grid-demo.component";
import { GroupingDemoComponent } from "./grouping-demo.component";
import { HeaderComponentDemoComponent } from "./header-component-demo.component";
import { HighFrequencyDemoComponent } from "./high-frequency-demo.component";
import { KitchenSinkDemoComponent } from "./kitchen-sink-demo.component";
import { MenusDemoComponent } from "./menus-demo.component";
import { PinnedRowsDemoComponent } from "./pinned-rows-demo.component";
import { QuickFilterDemoComponent } from "./quick-filter-demo.component";
import { ResponsiveToolbarDemoComponent } from "./responsive-toolbar-demo.component";
import { RowSelectionCheckboxDemoComponent } from "./row-selection-checkbox-demo.component";
import { SavedViewsDemoComponent } from "./saved-views-demo.component";
import { SelectionDemoComponent } from "./selection-demo.component";
import { ServerSideGroupingDemoComponent } from "./server-side-grouping-demo.component";
import { SparklineDemoComponent } from "./sparkline-demo.component";
import { StickyGroupRowsDemoComponent } from "./sticky-group-rows-demo.component";
import { ToolbarDemoComponent } from "./toolbar-demo.component";
import { TooltipDemoComponent } from "./tooltip-demo.component";
import { TreeDataDemoComponent } from "./tree-data-demo.component";
import { VisualStatesDemoComponent } from "./visual-states-demo.component";
import { SetFilterComponentsDemoComponent } from "./set-filter-components-demo.component";

// The first three are the Angular-wrapper-focused intro demos; the rest mirror the React
// playground's PAGES list (apps/react-playground/main.tsx) in the same order.
const PAGES = [
  { id: "basic", label: "Basic grid" },
  { id: "components", label: "Angular components" },
  { id: "menus", label: "Menus & templates" },
  { id: "grid", label: "Grid demo" },
  { id: "highFrequency", label: "High-frequency updates" },
  { id: "selection", label: "Selection & keyboard nav" },
  { id: "rowSelectionCheckboxes", label: "Row selection checkboxes" },
  { id: "visualStates", label: "Hover & visual states" },
  { id: "fullyThemed", label: "Fully themed grid" },
  { id: "grouping", label: "Row grouping" },
  { id: "serverSideGrouping", label: "Server-side grouping" },
  { id: "treeData", label: "Tree data" },
  { id: "pinnedRows", label: "Pinned rows" },
  { id: "stickyGroups", label: "Sticky group rows" },
  { id: "toolbar", label: "Toolbar" },
  { id: "responsiveToolbar", label: "Responsive toolbar" },
  { id: "savedViews", label: "Saved views" },
  { id: "columnState", label: "Column state save/restore" },
  { id: "groupExpanders", label: "Group expanders" },
  { id: "quickFilter", label: "Quick filter" },
  { id: "setFilterComponents", label: "Set-filter components" },
  { id: "headerComponents", label: "Custom headers" },
  { id: "tooltips", label: "Tooltips" },
  { id: "actionFrame", label: "ActionFrame" },
  { id: "kitchenSink", label: "Kitchen sink" },
  { id: "footerVisibility", label: "Footer visibility" },
  { id: "sparklines", label: "Sparklines" },
] as const;

type PageId = (typeof PAGES)[number]["id"];

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    ActionFrameDemoComponent,
    BasicGridDemoComponent,
    ColumnGroupExpanderDemoComponent,
    ColumnStateDemoComponent,
    ComponentsDemoComponent,
    FooterVisibilityDemoComponent,
    FullyThemedDemoComponent,
    GridDemoComponent,
    GroupingDemoComponent,
    HeaderComponentDemoComponent,
    HighFrequencyDemoComponent,
    KitchenSinkDemoComponent,
    MenusDemoComponent,
    PinnedRowsDemoComponent,
    QuickFilterDemoComponent,
    ResponsiveToolbarDemoComponent,
    RowSelectionCheckboxDemoComponent,
    SavedViewsDemoComponent,
    SelectionDemoComponent,
    ServerSideGroupingDemoComponent,
    SparklineDemoComponent,
    StickyGroupRowsDemoComponent,
    ToolbarDemoComponent,
    TooltipDemoComponent,
    TreeDataDemoComponent,
    VisualStatesDemoComponent,
    SetFilterComponentsDemoComponent,
  ],
  template: `
    <div class="demo-shell" [class.pte-theme-dark]="dark()" [class.pte-theme-light]="!dark()">
      <div class="demo-topbar">
        @for (page of pages; track page.id) {
          <button class="demo-tab" [class.active]="page.id === active()" (click)="active.set(page.id)">
            {{ page.label }}
          </button>
        }
        <span class="spacer"></span>
        <button class="btn" (click)="dark.set(!dark())">{{ dark() ? "Light" : "Dark" }} theme</button>
      </div>

      @switch (active()) {
        @case ("basic") {
          <basic-grid-demo />
        }
        @case ("components") {
          <components-demo />
        }
        @case ("menus") {
          <menus-demo />
        }
        @case ("grid") {
          <grid-demo />
        }
        @case ("highFrequency") {
          <high-frequency-demo />
        }
        @case ("selection") {
          <selection-demo />
        }
        @case ("rowSelectionCheckboxes") {
          <row-selection-checkbox-demo />
        }
        @case ("visualStates") {
          <visual-states-demo />
        }
        @case ("fullyThemed") {
          <fully-themed-demo />
        }
        @case ("grouping") {
          <grouping-demo />
        }
        @case ("serverSideGrouping") {
          <server-side-grouping-demo />
        }
        @case ("treeData") {
          <tree-data-demo />
        }
        @case ("pinnedRows") {
          <pinned-rows-demo />
        }
        @case ("stickyGroups") {
          <sticky-group-rows-demo />
        }
        @case ("toolbar") {
          <toolbar-demo />
        }
        @case ("responsiveToolbar") {
          <responsive-toolbar-demo />
        }
        @case ("savedViews") {
          <saved-views-demo />
        }
        @case ("columnState") {
          <column-state-demo />
        }
        @case ("groupExpanders") {
          <column-group-expander-demo />
        }
        @case ("quickFilter") {
          <quick-filter-demo />
        }
        @case ("setFilterComponents") {
          <set-filter-components-demo />
        }
        @case ("headerComponents") {
          <header-component-demo />
        }
        @case ("tooltips") {
          <tooltip-demo />
        }
        @case ("actionFrame") {
          <action-frame-demo />
        }
        @case ("kitchenSink") {
          <kitchen-sink-demo />
        }
        @case ("footerVisibility") {
          <footer-visibility-demo />
        }
        @case ("sparklines") {
          <sparkline-demo />
        }
      }
    </div>
  `,
})
export class AppComponent {
  readonly pages = PAGES;
  readonly active = signal<PageId>(initialPage());
  readonly dark = signal(true);

  constructor() {
    // Keep the demo linkable: #grouping / #tooltips / … select a tab directly.
    effect(() => {
      history.replaceState(null, "", `#${this.active()}`);
    });
  }
}

function initialPage(): PageId {
  const hash = location.hash.replace("#", "");
  return PAGES.some((p) => p.id === hash) ? (hash as PageId) : "basic";
}
