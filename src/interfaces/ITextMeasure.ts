export interface TextMeasureParams {
  headerFont?: string;
  cellFont?: string;
}

export interface ITextMeasurer {
  // width of a single line of text in px, given font token
  measure(text: string, font: string): number;
}
