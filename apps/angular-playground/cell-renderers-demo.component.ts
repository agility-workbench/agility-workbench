import { Component } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type NgColDef,
  type ProgressCellRendererCallbackParams,
} from "@agility-workbench/angular-grid";

type ProductRow = {
  id: number;
  name: string;
  thumb: string;
  site: string;
  progress: number;
  rating: number | null;
};

// Inline SVG thumbnails: the demo loads nothing over the network.
function swatch(fill: string, letter: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'>`
    + `<rect width='32' height='32' rx='6' fill='${fill}'/>`
    + `<text x='16' y='21' font-family='sans-serif' font-size='14' fill='white' text-anchor='middle'>${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const NAMES = ["Aurora", "Basalt", "Cobalt", "Dune", "Ember", "Fjord", "Garnet", "Harbor", "Indigo", "Juniper"];
const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b", "#6366f1", "#84cc16"];

function buildRows(): ProductRow[] {
  return NAMES.map((name, i) => ({
    id: i + 1,
    name,
    // One broken image (it shows its alt text) and one blank (it renders nothing).
    thumb: i === 7 ? "data:image/png;base64,broken" : i === 9 ? "" : swatch(COLORS[i], name[0]),
    site: `example.com/products/${name.toLowerCase()}`,
    progress: [12, 35, 58, 80, 100, 5, 66, 91, 44, 120][i],
    rating: [4, 3.5, 5, 2, null, 1, 4.5, 3, 0, 5][i],
  }));
}

const progressColor = ({ fraction }: ProgressCellRendererCallbackParams) =>
  fraction == null ? undefined : fraction < 0.3 ? "#ef4444" : fraction < 0.7 ? "#f59e0b" : "#22c55e";

@Component({
  selector: "cell-renderers-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="renderers-blurb">
      <strong>Built-in renderers by name.</strong>
      Every column uses an alias: <code>cellRenderer: "image"</code>, <code>"link"</code>,
      <code>"progress"</code> (coloured by threshold, values clamp) and <code>"rating"</code>.
      <br />
      Click a star to rate (click the current star to clear); the link opens in a new tab.
      Enter/F2 on a rating still opens the number editor. Row 8's image is broken and shows its
      alt text.
    </div>

    <div class="demo-grid-host">
      <awb-grid [rowData]="rows" [columnDefs]="columnDefs" rowIdKey="id" [rowNumbers]="true" />
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 12px;
        min-height: 0;
      }
      .renderers-blurb {
        font-size: 13px;
        color: #4b5563;
        line-height: 1.55;
      }
    `,
  ],
})
export class CellRenderersDemoComponent {
  readonly rows = buildRows();
  readonly columnDefs: NgColDef[] = [
    { colId: "name", key: "name", label: "Product", width: 130 },
    {
      colId: "thumb",
      key: "thumb",
      label: "Image",
      width: 100,
      cellRenderer: "image",
      cellRendererParams: { alt: ({ node }: any) => `${node.data.name} thumbnail`, height: 28 },
    },
    {
      colId: "site",
      key: "site",
      label: "Link",
      width: 260,
      cellRenderer: "link",
      cellRendererParams: { href: ({ value }: any) => `https://${value}` },
    },
    {
      colId: "progress",
      key: "progress",
      label: "Progress",
      width: 200,
      type: ColumnType.NUMBER,
      valueFormatter: ({ value }) => (value == null ? "" : `${value}%`),
      cellRenderer: "progress",
      cellRendererParams: { max: 100, showValue: true, color: progressColor },
    },
    {
      colId: "rating",
      key: "rating",
      label: "Rating (editable)",
      width: 190,
      type: ColumnType.NUMBER,
      editable: true,
      cellRenderer: "rating",
      cellRendererParams: { max: 5, allowClear: true },
    },
  ];
}
