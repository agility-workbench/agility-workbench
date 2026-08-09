import React from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";
import type { DemoFeature } from "./snippets";

type LiveFeatureGridProps = {
  feature: DemoFeature;
  compact?: boolean;
};

export function LiveFeatureGrid(props: LiveFeatureGridProps) {
  return (
    <BrowserOnly
      fallback={
        <div className="live-demo-loading" role="status">
          Loading interactive example…
        </div>
      }
    >
      {() => {
        const { FeatureGrid } = require("./FeatureGrid") as typeof import("./FeatureGrid");
        return <FeatureGrid {...props} />;
      }}
    </BrowserOnly>
  );
}
