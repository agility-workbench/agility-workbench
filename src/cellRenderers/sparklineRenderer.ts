import { ICellRenderer, CellRendererParams } from "../renderer/renderer";

interface SparklineParams {
  colIds: string[];
  type?: "line" | "bar" | "area";
}

export class SparklineRenderer implements ICellRenderer {
  private params!: CellRendererParams;
  private svgEl!: SVGElement;
  private rafId: number | null = null;
  private warnedMissingColIds = false;

  init(params: CellRendererParams): void {
    this.params = params;
    this.svgEl = this.createSvg();
    this.redraw();
  }

  getGui(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.style.display = "inline-flex";
    wrapper.style.alignItems = "center";
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";
    wrapper.style.overflow = "hidden";
    wrapper.style.padding = "2px 4px";
    wrapper.appendChild(this.svgEl);
    return wrapper;
  }

  refresh(params: CellRendererParams): boolean {
    this.params = params;
    this.redraw();
    return true;
  }

  destroy(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private createSvg(): SVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.display = "block";
    svg.style.overflow = "visible";
    return svg;
  }

  private redraw(): void {
    const { colIds, type = "line" } = (this.params.colDef.cellRendererParams || {}) as SparklineParams;
    if (!colIds || colIds.length === 0) {
      // Misconfiguration is otherwise indistinguishable from an empty cell — warn once.
      if (!this.warnedMissingColIds) {
        this.warnedMissingColIds = true;
        console.warn(
          `SparklineRenderer: no "colIds" configured in cellRendererParams for column "${this.params.colDef.colId}"; nothing to draw.`,
        );
      }
      this.svgEl.innerHTML = "";
      return;
    }

    const row = this.params.data;
    const columnModel = this.params.api.getColumnModel();
    const values: number[] = [];
    for (const colId of colIds) {
      // Source ids come from the column menu as instanceIDs, but hand-authored
      // colDefs may reference a colId or key — resolve against all three.
      const col =
        columnModel.getById(colId) ??
        columnModel.getByColId(colId) ??
        columnModel.getByKey(colId);
      // Skip unknown columns and group (non-leaf) columns — only leaves hold values.
      if (!col || col.children.length > 0) continue;
      const val = col.getValue(row);
      if (val != null && !isNaN(Number(val))) {
        values.push(Number(val));
      }
    }

    if (values.length === 0) {
      this.svgEl.innerHTML = "";
      return;
    }

    const rect = this.svgEl.getBoundingClientRect();
    const width = rect.width || 100;
    const height = rect.height || 20;
    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    if (chartWidth <= 0 || chartHeight <= 0) {
      // Element is not yet laid out. Draw at a fallback size so something shows,
      // then remeasure on the next frame once layout has settled.
      this.drawSparkline(values, 100, 20, padding, type);
      if (this.rafId == null) {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = null;
          this.redraw();
        });
      }
      return;
    }

    this.drawSparkline(values, width, height, padding, type);
  }

  private drawSparkline(values: number[], width: number, height: number, padding: number, type: "line" | "bar" | "area"): void {
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    if (chartWidth <= 0 || chartHeight <= 0) return;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const xScale = (i: number) => padding + (i / Math.max(values.length - 1, 1)) * chartWidth;
    const yScale = (v: number) => padding + chartHeight - ((v - min) / range) * chartHeight;

    let svgContent = "";

    if (type === "bar") {
      const barWidth = Math.max(1, (chartWidth / values.length) * 0.8);
      const gap = chartWidth / values.length;
      for (let i = 0; i < values.length; i++) {
        const x = padding + i * gap + (gap - barWidth) / 2;
        const barHeight = Math.max(1, ((values[i] - min) / range) * chartHeight);
        const y = padding + chartHeight - barHeight;
        svgContent += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="#4a90d9" rx="1" />`;
      }
    } else if (type === "line" || type === "area") {
      let pointsStr = "";
      for (let i = 0; i < values.length; i++) {
        const x = xScale(i);
        const y = yScale(values[i]);
        pointsStr += `${x},${y} `;
      }

      if (type === "area") {
        const firstX = xScale(0);
        const lastX = xScale(values.length - 1);
        const baselineY = padding + chartHeight;
        const areaPoints = `${firstX},${baselineY} ${pointsStr}${lastX},${baselineY}`;
        svgContent += `<polygon points="${areaPoints}" fill="rgba(74,144,217,0.2)" stroke="none" />`;
      }

      svgContent += `<polyline points="${pointsStr.trim()}" fill="none" stroke="#4a90d9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />`;
    }

    this.svgEl.innerHTML = svgContent;
  }
}
