import { ApplicationRef, Type } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";

export type MountedGridHost<T> = {
  fixture: ComponentFixture<T>;
  gridEl: HTMLElement;
  host: T;
};

/** Mount a standalone host and flush AwbGrid's afterNextRender creation callback. */
export async function mountGridHost<T>(hostType: Type<T>, height = 600): Promise<MountedGridHost<T>> {
  TestBed.configureTestingModule({ imports: [hostType] });
  const fixture = TestBed.createComponent(hostType);
  fixture.detectChanges();

  const gridEl = fixture.nativeElement.querySelector("awb-grid") as HTMLElement | null;
  if (!gridEl) throw new Error("The test host must render an <awb-grid> element");
  Object.defineProperty(gridEl, "clientHeight", { value: height, configurable: true });
  Object.defineProperty(gridEl, "clientWidth", { value: 900, configurable: true });

  TestBed.inject(ApplicationRef).tick();
  await fixture.whenStable();
  return { fixture, gridEl, host: fixture.componentInstance };
}

/** Flush signal-input effects after mutating a host property. */
export async function syncGridInputs<T>(fixture: ComponentFixture<T>): Promise<void> {
  fixture.detectChanges();
  TestBed.inject(ApplicationRef).tick();
  await fixture.whenStable();
}

export function dataCell(gridEl: HTMLElement, viewIdx: number, colIdx: number): HTMLElement {
  const row = gridEl.querySelector<HTMLElement>(`.pte-row[data-view-idx='${viewIdx}']`);
  const cell = row?.querySelectorAll<HTMLElement>(".pte-cell:not(.pte-row-number-cell)")[colIdx];
  if (!cell) throw new Error(`Missing cell at row ${viewIdx}, column ${colIdx}`);
  return cell;
}
