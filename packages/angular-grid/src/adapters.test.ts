import {
  ApplicationRef,
  Component,
  EnvironmentInjector,
  NgZone,
  input,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  CellRendererParams,
  ICellEditor,
  ICellEditorParams,
  ICellRenderer,
} from "@agility-workbench/grid";
import { NgAdapters } from "./adapters";
import type { ICellEditorNgComp, ICellRendererNgComp } from "./interface";

@Component({
  standalone: true,
  template: `<b class="signal-renderer">{{ params()?.value }}:{{ params()?.suffix }}</b>`,
})
class SignalRenderer {
  readonly params = input<CellRendererParams & { suffix?: string }>();
}

@Component({ standalone: true, template: `<i class="init-renderer">{{ value }}</i>` })
class InitRenderer implements ICellRendererNgComp {
  static destroys = 0;
  static instances = 0;
  value = "";

  constructor() {
    InitRenderer.instances++;
  }

  awbInit(params: CellRendererParams): void {
    this.value = `init:${params.value}`;
  }

  awbRefresh(params: CellRendererParams): boolean {
    this.value = `refresh:${params.value}`;
    return true;
  }

  ngOnDestroy(): void {
    InitRenderer.destroys++;
  }
}

@Component({ standalone: true, template: `<span>invalid</span>` })
class InvalidRenderer {}

@Component({ standalone: true, template: `<input class="ng-editor" [value]="value" />` })
class TestEditor implements ICellEditorNgComp {
  static focused = 0;
  static destroyed = 0;
  value = "";

  awbInit(params: ICellEditorParams): void {
    this.value = `edited:${params.value}`;
  }

  getValue(): unknown {
    return this.value;
  }

  isParsed(): boolean {
    return true;
  }

  focus(): void {
    TestEditor.focused++;
  }

  ngOnDestroy(): void {
    TestEditor.destroyed++;
  }
}

class CoreEditor implements ICellEditor {
  private readonly element = document.createElement("input");
  init(): void {}
  getGui(): HTMLElement { return this.element; }
  getValue(): unknown { return this.element.value; }
}

function adapters(): NgAdapters {
  return new NgAdapters(
    TestBed.inject(ApplicationRef),
    TestBed.inject(EnvironmentInjector),
    TestBed.inject(NgZone),
  );
}

function rendererParams(value: unknown, extra?: object): CellRendererParams {
  return {
    value,
    data: { id: 1 },
    rowId: "1",
    rowIndex: 0,
    colDef: { colId: "name", key: "name", label: "Name", cellRendererParams: extra },
  } as CellRendererParams;
}

function editorParams(value: unknown): ICellEditorParams {
  return {
    value,
    row: { data: {} },
    col: {},
    editorParams: undefined,
    eCell: document.createElement("div"),
    api: null,
    getDistinctColumnValues: () => [],
  } as unknown as ICellEditorParams;
}

describe("NgAdapters", () => {
  beforeEach(() => {
    InitRenderer.destroys = 0;
    InitRenderer.instances = 0;
    TestEditor.focused = 0;
    TestEditor.destroyed = 0;
  });

  it("wraps signal-input renderers, merges renderer params, and caches adapter classes", () => {
    const service = adapters();
    const Renderer = service.adaptCellRenderer(SignalRenderer)! as new () => ICellRenderer;
    expect(service.adaptCellRenderer(SignalRenderer)).toBe(Renderer);
    expect(Renderer).not.toBe(SignalRenderer);

    const renderer = new Renderer();
    renderer.init(rendererParams("AAA", { suffix: "custom" }));
    expect(renderer.getGui().querySelector(".signal-renderer")?.textContent).toBe("AAA:custom");

    expect(renderer.refresh?.(rendererParams("BBB", { suffix: "next" }))).toBe(true);
    expect(renderer.getGui().querySelector(".signal-renderer")?.textContent).toBe("BBB:next");
    renderer.destroy?.();
  });

  it("supports awbInit/awbRefresh renderers without recreating their component", () => {
    const Renderer = adapters().adaptCellRenderer(InitRenderer)! as new () => ICellRenderer;
    const renderer = new Renderer();
    renderer.init(rendererParams("AAA"));
    expect(renderer.getGui().textContent).toBe("init:AAA");

    expect(renderer.refresh?.(rendererParams("BBB"))).toBe(true);
    expect(renderer.getGui().textContent).toBe("refresh:BBB");
    expect(InitRenderer.instances).toBe(1);

    renderer.destroy?.();
    expect(InitRenderer.destroys).toBe(1);
  });

  it("reports a useful error for Angular renderers with neither supported params contract", () => {
    const Renderer = adapters().adaptCellRenderer(InvalidRenderer)! as new () => ICellRenderer;
    const renderer = new Renderer();
    expect(() => renderer.init(rendererParams("AAA"))).toThrow(/must either implement awbInit\(params\).*input named 'params'/);
  });

  it("passes editor aliases and core editor classes through unchanged", () => {
    const service = adapters();
    expect(service.adaptCellEditor("number")).toBe("number");
    expect(service.adaptCellEditor("select")).toBe("select");
    expect(service.adaptCellEditor(CoreEditor)).toBe(CoreEditor);
    expect(service.adaptCellEditor(undefined)).toBeUndefined();
  });

  it("bridges Angular editor value, parsed, focus, and teardown methods", async () => {
    const service = adapters();
    const Editor = service.adaptCellEditor(TestEditor)! as new () => ICellEditor;
    expect(service.adaptCellEditor(TestEditor)).toBe(Editor);

    const editor = new Editor();
    editor.init(editorParams("hello"));
    expect(editor.getGui().querySelector(".ng-editor")).toBeTruthy();
    expect(editor.getValue()).toBe("edited:hello");
    expect(editor.isParsed?.()).toBe(true);
    editor.focus?.();
    expect(TestEditor.focused).toBe(1);

    editor.destroy?.();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(TestEditor.destroyed).toBe(1);
  });

  it("adapts nested and default column component slots", () => {
    const service = adapters();
    const [group] = service.adaptColumnDefs([{
      colId: "group",
      label: "Group",
      children: [{ colId: "name", key: "name", label: "Name", cellRenderer: SignalRenderer }],
    }])!;
    expect(group.children?.[0].cellRenderer).not.toBe(SignalRenderer);

    const defaults = service.adaptDefaultColDef({ cellRenderer: SignalRenderer });
    expect(defaults?.cellRenderer).toBe(group.children?.[0].cellRenderer);
  });
});
