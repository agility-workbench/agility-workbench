import { GridCore, GridOptions } from "@grid";
import { GridAPI } from "@grid/api";
import { CanvasMeasurer } from "@grid/renderer";

export function createCore(options: GridOptions): GridCore {
  return new GridCore(new CanvasMeasurer(), options);
}

export function createApi(core: GridCore): GridAPI {
  return new GridAPI(core);
}
