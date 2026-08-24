import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "overview",
    {
      type: "category",
      label: "Getting started",
      items: ["getting-started/installation", "getting-started/react", "getting-started/angular", "getting-started/core"],
    },
    {
      type: "category",
      label: "Feature examples",
      link: { type: "generated-index", title: "Feature examples", slug: "/examples" },
      items: [
        "examples/columns",
        "examples/column-groups",
        "examples/client-side-data",
        "examples/server-side-data",
        "examples/filtering",
        "examples/sorting",
        "examples/selection",
        "examples/editing",
        "examples/grouping",
        "examples/tree-data",
        "examples/pinned-rows",
        "examples/rendering",
        "examples/tooltips",
        "examples/action-frames",
        "examples/menus",
        "examples/toolbar-and-views",
        "examples/export",
        "examples/theming",
      ],
    },
    {
      type: "category",
      label: "API reference",
      items: ["api/grid-options", "api/grid-api", "api/column-definitions"],
    },
    "accessibility",
    "limitations",
  ],
};

export default sidebars;
