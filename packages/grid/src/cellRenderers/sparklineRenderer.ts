import { Column } from "../column/column";
import { IGridAPI } from "../interfaces/iGridAPI";
import { IRowNode } from "../interfaces/iRowNode";
import { ICellRenderer, CellRendererParams } from "../renderer/renderer";
import { notifyRendererTooltipTargetsUpdated } from "../renderer/tooltip/rendererTooltipTarget";

export type SparklineXValue =
  | string
  | number
  | Date
  | { toString(): string };

export type SparklineTuple = readonly [SparklineXValue, number];
export type SparklineData = readonly number[] | readonly SparklineTuple[];

export interface SparklineTooltipValueFormatterParams {
  xValue: SparklineXValue;
  yValue: number;
  /** Backward-compatible alias for yValue. */
  value: number;
  /** Index in the original array returned by the column's valueGetter. */
  index: number;
  /** The row's underlying data object. */
  data: any;
  /** The row node used by the grid. */
  rowNode: IRowNode;
  rowId: string;
  rowIndex: number;
  colDef: Column;
  api: IGridAPI;
}

export interface SparklineParams {
  type?: "line" | "bar" | "area";
  /** Draw a visible marker at each point on line and area sparklines. Default false. */
  showPoints?: boolean;
  /** Format the text shown by the grid tooltip for an individual data point. */
  tooltipValueFormatter?: (params: SparklineTooltipValueFormatterParams) => string;
}

type SparklinePoint = {
  index: number;
  /** Ordinal position used by the default category axis. */
  position: number;
  xValue: SparklineXValue;
  yValue: number;
  explicitX: boolean;
};

type SparklineTooltipEntry = {
  kind: "bar" | "point";
  point: SparklinePoint;
  target: SVGRectElement;
  anchor?: SVGCircleElement;
  cleanup: () => void;
};

const SVG_NS = "http://www.w3.org/2000/svg";

export class SparklineRenderer implements ICellRenderer {
  private params!: CellRendererParams;
  private svgEl!: SVGSVGElement;
  private rafId: number | null = null;
  private width = 100;
  private height = 20;
  private tooltipEntries = new Map<number, SparklineTooltipEntry>();
  private warnedInvalidValue = false;

  init(params: CellRendererParams): void {
    this.params = params;
    this.svgEl = this.createSvg();
    this.redraw();
    this.scheduleMeasure();
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
    if (params.refreshReason === "resize") this.scheduleMeasure();
    return true;
  }

  destroy(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.clearTooltipTargets();
  }

  private createSvg(): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.classList.add("pte-sparkline");
    svg.style.display = "block";
    svg.style.overflow = "visible";
    return svg;
  }

  private redraw(): void {
    const {
      type = "line",
      showPoints = false,
    } = (this.params.colDef.cellRendererParams || {}) as SparklineParams;
    const series = this.params.value;
    if (!Array.isArray(series)) {
      if (!this.warnedInvalidValue) {
        this.warnedInvalidValue = true;
        console.warn(
          `SparklineRenderer: expected the valueGetter for column "${this.params.colDef.colId}" to return number[] or [x, number][]; nothing to draw.`,
        );
      }
      this.clearTooltipTargets();
      this.svgEl.replaceChildren();
      return;
    }

    const { points, domainLength } = this.normalizeSeries(series);

    if (points.length === 0) {
      this.clearTooltipTargets();
      this.svgEl.replaceChildren();
      return;
    }

    const padding = 2;
    this.drawSparkline(points, domainLength, this.width, this.height, padding, type, showPoints);
  }

  /**
   * Cell dimensions are stable while rows are recycled during vertical scrolling. Measuring in
   * every refresh forces layout once per visible sparkline, so measure only after mount and after
   * an explicit column resize, then reuse the cached dimensions for ordinary row refreshes.
   */
  private scheduleMeasure(): void {
    if (this.rafId != null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      const rect = this.svgEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      if (rect.width === this.width && rect.height === this.height) return;
      this.width = rect.width;
      this.height = rect.height;
      this.redraw();
    });
  }

  private normalizeSeries(series: unknown[]): {
    points: SparklinePoint[];
    domainLength: number;
  } {
    // A tuple series uses a category axis: valid tuples are compacted and evenly spaced in their
    // original order. A number series retains array indexes as X values, including gaps left by an
    // invalid Y value.
    const tupleSeries = series.some(value => Array.isArray(value));
    const points: SparklinePoint[] = [];

    series.forEach((datum, index) => {
      if (tupleSeries) {
        if (!Array.isArray(datum) || datum.length < 2) return;
        const [xValue, yValue] = datum;
        if (!this.isValidXValue(xValue) || typeof yValue !== "number" || !Number.isFinite(yValue)) {
          return;
        }
        points.push({
          index,
          position: points.length,
          xValue,
          yValue,
          explicitX: true,
        });
        return;
      }

      if (typeof datum === "number" && Number.isFinite(datum)) {
        points.push({
          index,
          position: index,
          xValue: index,
          yValue: datum,
          explicitX: false,
        });
      }
    });

    return {
      points,
      domainLength: tupleSeries ? points.length : series.length,
    };
  }

  private isValidXValue(value: unknown): value is SparklineXValue {
    if (typeof value === "string") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (value instanceof Date) return Number.isFinite(value.getTime());
    return value != null && typeof (value as { toString?: unknown }).toString === "function";
  }

  private drawSparkline(
    points: SparklinePoint[],
    seriesLength: number,
    width: number,
    height: number,
    padding: number,
    type: "line" | "bar" | "area",
    showPoints: boolean,
  ): void {
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    if (chartWidth <= 0 || chartHeight <= 0) return;

    this.svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const fragment = document.createDocumentFragment();

    let min = points[0].yValue;
    let max = min;
    for (let i = 1; i < points.length; i++) {
      const value = points[i].yValue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const range = max - min || 1;

    const xScale = (position: number) =>
      padding + (position / Math.max(seriesLength - 1, 1)) * chartWidth;
    const yScale = (value: number) =>
      padding + chartHeight - ((value - min) / range) * chartHeight;

    if (type === "bar") {
      const usedTooltipIndexes = new Set<number>();
      const gap = chartWidth / Math.max(seriesLength, 1);
      const barWidth = Math.max(1, gap * 0.8);
      for (const point of points) {
        const x = padding + point.position * gap + (gap - barWidth) / 2;
        const barHeight = Math.max(1, ((point.yValue - min) / range) * chartHeight);
        const y = padding + chartHeight - barHeight;
        const entry = this.getOrCreateTooltipEntry(point, "bar");
        const bar = entry.target;
        usedTooltipIndexes.add(point.index);
        bar.setAttribute("x", String(x));
        bar.setAttribute("y", String(y));
        bar.setAttribute("width", String(barWidth));
        bar.setAttribute("height", String(barHeight));
        bar.setAttribute("rx", "1");
        fragment.appendChild(bar);
      }
      this.commitDraw(fragment, usedTooltipIndexes);
      return;
    }

    const pointList = points
      .map(point => `${xScale(point.position)},${yScale(point.yValue)}`)
      .join(" ");
    if (type === "area") {
      const area = document.createElementNS(SVG_NS, "polygon");
      const firstX = xScale(points[0].position);
      const lastX = xScale(points[points.length - 1].position);
      const baselineY = padding + chartHeight;
      area.setAttribute("points", `${firstX},${baselineY} ${pointList} ${lastX},${baselineY}`);
      area.setAttribute("fill", "rgba(74,144,217,0.2)");
      area.setAttribute("stroke", "none");
      fragment.appendChild(area);
    }

    const line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("points", pointList);
    line.classList.add("pte-sparkline-path");
    fragment.appendChild(line);

    // Each point owns the vertical band halfway to its neighbours. This makes the nearest X value
    // discoverable anywhere over the chart while a separate tiny anchor keeps the floating tooltip
    // visually attached to the plotted point rather than the centre of the hit band.
    const usedTooltipIndexes = new Set<number>();
    points.forEach((point, pointIndex) => {
      const pointX = xScale(point.position);
      if (showPoints) {
        const marker = document.createElementNS(SVG_NS, "circle");
        marker.setAttribute("cx", String(pointX));
        marker.setAttribute("cy", String(yScale(point.yValue)));
        marker.setAttribute("r", "2.5");
        marker.classList.add("pte-sparkline-point");
        marker.dataset.sparklinePointIndex = String(point.index);
        fragment.appendChild(marker);
      }

      const entry = this.getOrCreateTooltipEntry(point, "point");
      const anchor = entry.anchor!;
      usedTooltipIndexes.add(point.index);
      anchor.setAttribute("cx", String(pointX));
      anchor.setAttribute("cy", String(yScale(point.yValue)));
      anchor.setAttribute("r", "1");
      anchor.setAttribute("fill", "transparent");
      anchor.setAttribute("pointer-events", "none");
      fragment.appendChild(anchor);

      const previousX =
        pointIndex > 0 ? xScale(points[pointIndex - 1].position) : 0;
      const nextX =
        pointIndex < points.length - 1
          ? xScale(points[pointIndex + 1].position)
          : width;
      const left = pointIndex > 0 ? (previousX + pointX) / 2 : 0;
      const right =
        pointIndex < points.length - 1
          ? (pointX + nextX) / 2
          : width;

      const hitTarget = entry.target;
      hitTarget.setAttribute("x", String(left));
      hitTarget.setAttribute("y", "0");
      hitTarget.setAttribute("width", String(Math.max(1, right - left)));
      hitTarget.setAttribute("height", String(height));
      hitTarget.setAttribute("fill", "transparent");
      fragment.appendChild(hitTarget);
    });
    this.commitDraw(fragment, usedTooltipIndexes);
  }

  private getOrCreateTooltipEntry(
    point: SparklinePoint,
    kind: SparklineTooltipEntry["kind"],
  ): SparklineTooltipEntry {
    const existing = this.tooltipEntries.get(point.index);
    if (existing?.kind === kind) {
      existing.point = point;
      return existing;
    }
    existing?.cleanup();

    const target = document.createElementNS(SVG_NS, "rect");
    target.classList.add(
      ...(kind === "bar"
        ? ["pte-sparkline-bar", "pte-sparkline-tooltip-target"]
        : ["pte-sparkline-tooltip-target"]),
    );
    target.dataset.sparklinePointIndex = String(point.index);
    const anchor = kind === "point" ? document.createElementNS(SVG_NS, "circle") : undefined;
    const entry = { kind, point, target, anchor, cleanup: () => {} } as SparklineTooltipEntry;
    entry.cleanup = this.params.registerTooltipTarget(target, () => this.formatPointTooltip(entry.point), anchor);
    this.tooltipEntries.set(point.index, entry);
    return entry;
  }

  private formatPointTooltip(point: SparklinePoint): string {
    const rendererParams = (this.params.colDef.cellRendererParams || {}) as SparklineParams;
    const formatter = rendererParams.tooltipValueFormatter;
    if (!formatter) {
      return point.explicitX
        ? `${this.formatXValue(point.xValue)}: ${point.yValue}`
        : String(point.yValue);
    }
    const rowNode = this.params.data as IRowNode;
    return formatter({
      xValue: point.xValue,
      yValue: point.yValue,
      value: point.yValue,
      index: point.index,
      data: rowNode?.data ?? rowNode,
      rowNode,
      rowId: this.params.rowId,
      rowIndex: this.params.rowIndex,
      colDef: this.params.colDef,
      api: this.params.api,
    });
  }

  private commitDraw(fragment: DocumentFragment, usedTooltipIndexes: Set<number>): void {
    for (const [index, entry] of this.tooltipEntries) {
      if (usedTooltipIndexes.has(index)) continue;
      entry.cleanup();
      this.tooltipEntries.delete(index);
    }
    this.svgEl.replaceChildren(fragment);
    // Stable targets retain an open tooltip. Tell the delegated owner to update its text and
    // reposition against the anchor's new coordinates now that the SVG is back in the document.
    notifyRendererTooltipTargetsUpdated(
      [...usedTooltipIndexes].map(index => this.tooltipEntries.get(index)!.target),
    );
  }

  private formatXValue(value: SparklineXValue): string {
    return value instanceof Date ? value.toLocaleString() : String(value);
  }

  private clearTooltipTargets(): void {
    for (const entry of this.tooltipEntries.values()) entry.cleanup();
    this.tooltipEntries.clear();
  }
}
