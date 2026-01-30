import { GridCore, GridOptions, GridRenderer } from "@grid";
import { IGridCore } from "@grid";
import { GridAPI } from "@grid/api/api";
import { IGridAPI } from "@grid/interfaces/IApi";
import { CanvasMeasurer } from "@grid/renderer";

export function createCore(options: GridOptions): IGridCore {
  return new GridCore(new CanvasMeasurer(), options);
}

export function createApi(core: IGridCore): IGridAPI {
  return new GridAPI(core);
}
