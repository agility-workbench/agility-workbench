import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { App } from './app';

// AwbGrid's CanvasMeasurer needs a 2D canvas context to measure text; emulated
// DOM environments do not implement one, so stub the minimum it uses.
beforeAll(() => {
  (HTMLCanvasElement.prototype as unknown as { getContext: () => object }).getContext = () => ({
    font: '',
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    (globalThis as Record<string, unknown>)['ResizeObserver'] = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
});

async function waitFor(
  fixture: ComponentFixture<App>,
  cond: () => boolean,
  label: string,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${label}`);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('AwbGrid consumer smoke', () => {
  it('mounts, renders rows, and answers API calls', async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    const fixture = TestBed.createComponent(App);
    fixture.autoDetectChanges();
    const app = fixture.componentInstance;
    const host = fixture.nativeElement as HTMLElement;

    // gridReady output delivered the API
    await waitFor(fixture, () => app.api !== null, 'gridReady');
    expect(app.log()).toContain('gridReady');

    // real cells rendered from rowData
    await waitFor(fixture, () => (host.textContent ?? '').includes('Item 001'), 'first row rendered');

    // quick filter narrows the rendered rows (Item 002 is an Americas row)
    app.quickFilter('Europe');
    await waitFor(
      fixture,
      () => (host.textContent ?? '').includes('Item 001') && !(host.textContent ?? '').includes('Item 002'),
      'quick filter applied',
    );
    app.quickFilter('');

    // sorting through the API fires the sortChanged output
    app.sortUnitsDesc();
    await waitFor(fixture, () => app.log().includes('sortChanged'), 'sortChanged output');

    // selection through the API fires selectionChanged and reports both rows
    app.selectFirstTwo();
    await waitFor(fixture, () => (app.api?.getSelectedRows().length ?? 0) === 2, 'two rows selected');
    expect(app.log().some((l) => l.startsWith('selectionChanged'))).toBe(true);
  }, 20000);
});
