import "zone.js";
import "zone.js/testing";
import { beforeEach } from "vitest";
import { TestBed, getTestBed } from "@angular/core/testing";
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from "@angular/platform-browser/testing";

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});

// Karma/Jest builders hook this reset automatically; under vitest it is explicit.
beforeEach(() => TestBed.resetTestingModule());

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one to measure text.
(HTMLCanvasElement.prototype as unknown as { getContext: () => object }).getContext = () => ({
  font: "",
  measureText: (t: string) => ({ width: t.length * 7 }),
});
