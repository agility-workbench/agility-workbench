import { ITextMeasurer } from "../interfaces/iTextMeasure";

export class CanvasMeasurer implements ITextMeasurer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context for text measurement");
    }
    this.context = ctx;
  }

  measure(text: string, font: string): number {
    this.context.font = font;
    const metrics = this.context.measureText(text);
    return metrics.width;
  }
}
