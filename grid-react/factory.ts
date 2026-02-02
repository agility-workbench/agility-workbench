import { GridCore, GridOptions } from "@grid";
import { IGridCore } from "@grid";
import { GridAPI } from "@grid/api";
import { IGridAPI } from "@grid/interfaces";
import { CanvasMeasurer } from "@grid/renderer";

export function createCore(options: GridOptions): IGridCore {
  return new GridCore(new CanvasMeasurer(), options);
}

export function createApi(core: IGridCore): IGridAPI {
  return new GridAPI(core);
}
