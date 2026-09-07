import React from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";

export type ShowcaseName = "trading-desk" | "analytics-workbench" | "planning-workspace";

/**
 * Showcase demos mount real grids, so they are client-only like `LiveFeatureGrid`. Each is required
 * lazily inside the browser-only render so the server build never pulls the grid renderer in.
 */
export function LiveShowcase({ name }: { name: ShowcaseName }) {
  return (
    <BrowserOnly
      fallback={
        <div className="live-demo-loading" role="status">
          Loading interactive example…
        </div>
      }
    >
      {() => {
        if (name === "trading-desk") {
          const { TradingDeskDemo } = require("./showcase/TradingDeskDemo") as typeof import("./showcase/TradingDeskDemo");
          return <TradingDeskDemo />;
        }
        if (name === "analytics-workbench") {
          const { AnalyticsWorkbenchDemo } = require("./showcase/AnalyticsWorkbenchDemo") as typeof import("./showcase/AnalyticsWorkbenchDemo");
          return <AnalyticsWorkbenchDemo />;
        }
        const { PlanningWorkspaceDemo } = require("./showcase/PlanningWorkspaceDemo") as typeof import("./showcase/PlanningWorkspaceDemo");
        return <PlanningWorkspaceDemo />;
      }}
    </BrowserOnly>
  );
}
