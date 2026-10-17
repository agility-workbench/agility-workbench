import type { CellRendererAlias } from "../interfaces/column";
import type { CellRendererClass } from "../renderer/renderer";
import { BooleanCellRenderer } from "./booleanRenderer";
import { ImageCellRenderer } from "./imageRenderer";
import { LinkCellRenderer } from "./linkRenderer";
import { ProgressCellRenderer } from "./progressRenderer";
import { RatingCellRenderer } from "./ratingRenderer";

/**
 * The built-in renderer each `CellRendererAlias` names. `"text"` maps to no renderer: it is the
 * explicit plain-text opt-out (see `Column.textRendererRequested`), not a renderer.
 */
export const CELL_RENDERER_ALIASES: Readonly<Record<Exclude<CellRendererAlias, "text">, CellRendererClass>> = {
  link: LinkCellRenderer,
  image: ImageCellRenderer,
  progress: ProgressCellRenderer,
  rating: RatingCellRenderer,
};

/** The renderer class a `ColDef.cellRenderer` alias names, or undefined for `"text"`/unknown names. */
export function resolveCellRendererAlias(alias: string): CellRendererClass | undefined {
  return Object.prototype.hasOwnProperty.call(CELL_RENDERER_ALIASES, alias)
    ? CELL_RENDERER_ALIASES[alias as keyof typeof CELL_RENDERER_ALIASES]
    : undefined;
}

/**
 * Whether a column's built-in renderer draws no text a find could highlight: a checkbox, an image,
 * the rating stars, a progress bar without `showValue`. Used by `Column.rendersNoText`.
 */
export function builtInRendererShowsNoText(renderer: unknown, params: any): boolean {
  if (renderer === BooleanCellRenderer || renderer === ImageCellRenderer || renderer === RatingCellRenderer) return true;
  if (renderer === ProgressCellRenderer) return !params?.showValue;
  return false;
}
