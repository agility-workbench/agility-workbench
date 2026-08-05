import {
  ApplicationRef,
  ComponentRef,
  EnvironmentInjector,
  NgZone,
  Type,
  createComponent,
  reflectComponentType,
} from "@angular/core";
import type { ComponentMirror } from "@angular/core";
import type {
  ActionFrameComponent,
  ActionFrameComponentClass,
  ActionFrameComponentParams,
  CellEditor,
  CellEditorClass,
  CellRenderer,
  CellRendererClass,
  CellRendererParams,
  ColDef,
  DefaultColDef,
  IActionFrameComponent,
  ICellEditor,
  ICellEditorParams,
  ICellRenderer,
  ITooltipComponent,
  TooltipComponent,
  TooltipComponentClass,
  TooltipComponentParams,
} from "@agility-workbench/grid";
import {
  isClassActionFrameComponent,
  isClassRenderer,
  isClassTooltipComponent,
} from "@agility-workbench/grid";
import type { NgColDef, NgComponent, NgDefaultColDef } from "./interface";

/** True when `value` is a compiled Angular component class (vs a core class or plain function). */
export function isNgComponent(value: unknown): value is Type<unknown> {
  return typeof value === "function" && reflectComponentType(value as Type<unknown>) !== null;
}

/**
 * Push params into a freshly created / refreshing component using whichever contract it implements:
 * `awbInit(params)` (interface style) or a declared input named `params` (signal-input style).
 */
function deliverParams(
  ref: ComponentRef<unknown>,
  mirror: ComponentMirror<unknown>,
  params: object,
  kind: string,
): void {
  const instance = ref.instance as { awbInit?: (p: object) => void };
  if (typeof instance.awbInit === "function") {
    instance.awbInit(params);
    return;
  }
  if (mirror.inputs.some((i) => i.templateName === "params" || i.propName === "params")) {
    ref.setInput("params", params);
    return;
  }
  throw new Error(
    `[agility-workbench] ${kind} component ${mirror.selector || ref.componentType.name} must either ` +
      `implement awbInit(params) or declare an input named 'params'.`,
  );
}

interface MountedComponent<I = unknown> {
  readonly instance: I;
  /** Re-deliver params. Returns false if the component asked to be recreated (awbRefresh → false). */
  refresh(params: object): boolean;
  destroy(): void;
}

/**
 * Per-grid-instance adapter context. Owns the Angular machinery (injector, ApplicationRef, zone)
 * needed to host arbitrary Angular components inside DOM elements owned by the framework-agnostic
 * core, plus per-component caches so the same component class always maps to the same adapter class
 * (core treats the renderer class identity as the "did the renderer change?" key).
 */
export class NgAdapters {
  private readonly rendererCache = new WeakMap<object, CellRendererClass>();
  private readonly tooltipCache = new WeakMap<object, TooltipComponentClass>();
  private readonly actionFrameCache = new WeakMap<object, ActionFrameComponentClass>();
  private readonly editorCache = new WeakMap<object, CellEditorClass>();

  constructor(
    private readonly appRef: ApplicationRef,
    private readonly envInjector: EnvironmentInjector,
    private readonly zone: NgZone,
  ) {}

  /**
   * Create `component` with `hostElement` as its host, deliver params, attach it to the app for
   * change detection, and run the first CD cycle synchronously (the grid may read the DOM / call
   * imperative methods immediately after init). Runs inside the Angular zone so template event
   * listeners registered during creation trigger change detection in zone-based apps — the grid
   * core itself lives outside the zone.
   */
  mount<I>(component: Type<unknown>, params: object, hostElement: HTMLElement, kind: string): MountedComponent<I> {
    return this.zone.run(() => {
      const mirror = reflectComponentType(component)!;
      const ref = createComponent(component, {
        environmentInjector: this.envInjector,
        hostElement,
      });
      deliverParams(ref, mirror, params, kind);
      this.appRef.attachView(ref.hostView);
      ref.changeDetectorRef.detectChanges();

      return {
        instance: ref.instance as I,
        refresh: (p: object): boolean => {
          return this.zone.run(() => {
            const instance = ref.instance as { awbRefresh?: (p: object) => boolean };
            let handled = true;
            if (typeof instance.awbRefresh === "function") {
              handled = instance.awbRefresh(p) !== false;
            } else {
              deliverParams(ref, mirror, p, kind);
            }
            ref.changeDetectorRef.detectChanges();
            return handled;
          });
        },
        destroy: () => this.zone.run(() => ref.destroy()),
      };
    });
  }

  // --- cell renderers -------------------------------------------------------------------------

  adaptCellRenderer(renderer: CellRenderer | NgComponent | undefined): CellRenderer | undefined {
    if (!renderer) return undefined;
    if (typeof renderer === "function" && isClassRenderer(renderer as CellRenderer)) {
      return renderer as CellRenderer;
    }
    if (!isNgComponent(renderer)) return renderer as CellRenderer;

    const cached = this.rendererCache.get(renderer);
    if (cached) return cached;

    const adapted = this.createRendererClass(renderer);
    this.rendererCache.set(renderer, adapted);
    return adapted;
  }

  private createRendererClass(component: Type<unknown>): CellRendererClass {
    const adapters = this;
    return class NgCellRendererAdapter implements ICellRenderer {
      private el = document.createElement("span");
      private mounted: MountedComponent | null = null;

      init(params: CellRendererParams): void {
        this.el.style.display = "inline-flex";
        this.el.style.alignItems = "center";
        this.el.style.width = "100%";
        this.el.style.height = "100%";
        this.el.style.overflow = "hidden";
        this.mounted = adapters.mount(component, getRendererProps(params), this.el, "cellRenderer");
      }

      getGui(): HTMLElement {
        return this.el;
      }

      refresh(params: CellRendererParams): boolean {
        return this.mounted?.refresh(getRendererProps(params)) ?? false;
      }

      destroy(): void {
        this.mounted?.destroy();
        this.mounted = null;
      }
    };
  }

  // --- tooltips --------------------------------------------------------------------------------

  adaptTooltip(comp: TooltipComponent | NgComponent | undefined): TooltipComponent | undefined {
    if (!comp) return undefined;
    if (typeof comp === "function" && isClassTooltipComponent(comp as TooltipComponent)) {
      return comp as TooltipComponent;
    }
    if (!isNgComponent(comp)) return comp as TooltipComponent;

    const cached = this.tooltipCache.get(comp);
    if (cached) return cached;

    const adapted = this.createTooltipClass(comp);
    this.tooltipCache.set(comp, adapted);
    return adapted;
  }

  /** headerTooltip may be a plain string (pass through) or a component (adapt like a tooltip). */
  adaptHeaderTooltip(
    ht: string | TooltipComponent | NgComponent | undefined,
  ): string | TooltipComponent | undefined {
    if (ht == null || typeof ht === "string") return ht;
    return this.adaptTooltip(ht);
  }

  private createTooltipClass(component: Type<unknown>): TooltipComponentClass {
    const adapters = this;
    return class NgTooltipAdapter implements ITooltipComponent {
      private el = document.createElement("div");
      private mounted: MountedComponent | null = null;

      init(params: TooltipComponentParams): void {
        // One component instance lives for the life of this tooltip; refresh re-delivers params
        // rather than recreating, so interactive content keeps its state across repositions.
        this.mounted = adapters.mount(component, getTooltipProps(params), this.el, "tooltip");
      }

      getGui(): HTMLElement {
        return this.el;
      }

      refresh(params: TooltipComponentParams): boolean {
        return this.mounted?.refresh(getTooltipProps(params)) ?? false;
      }

      destroy(): void {
        this.mounted?.destroy();
        this.mounted = null;
      }
    };
  }

  // --- ActionFrame -----------------------------------------------------------------------------

  adaptActionFrame(
    comp: ActionFrameComponent | NgComponent | undefined,
  ): ActionFrameComponent | undefined {
    if (!comp) return undefined;
    if (typeof comp === "function" && isClassActionFrameComponent(comp as ActionFrameComponent)) {
      return comp as ActionFrameComponent;
    }
    if (!isNgComponent(comp)) return comp as ActionFrameComponent;

    const cached = this.actionFrameCache.get(comp);
    if (cached) return cached;

    const adapted = this.createActionFrameClass(comp);
    this.actionFrameCache.set(comp, adapted);
    return adapted;
  }

  private createActionFrameClass(component: Type<unknown>): ActionFrameComponentClass {
    const adapters = this;
    return class NgActionFrameAdapter implements IActionFrameComponent {
      private el = document.createElement("div");
      private mounted: MountedComponent | null = null;

      init(params: ActionFrameComponentParams): void {
        // One component instance for the life of the open frame; refresh re-delivers params so the
        // form keeps its state across repositions (scroll tracking repositions, not remounts).
        this.mounted = adapters.mount(component, getActionFrameProps(params), this.el, "actionFrame");
      }

      getGui(): HTMLElement {
        return this.el;
      }

      refresh(params: ActionFrameComponentParams): boolean {
        return this.mounted?.refresh(getActionFrameProps(params)) ?? false;
      }

      destroy(): void {
        this.mounted?.destroy();
        this.mounted = null;
      }
    };
  }

  // --- cell editors ----------------------------------------------------------------------------

  adaptCellEditor(editor: CellEditor | NgComponent | undefined): CellEditor | undefined {
    if (editor == null) return undefined;
    if (typeof editor === "string") return editor; // built-in alias
    if (isCoreEditorClass(editor)) return editor as CellEditor;
    if (!isNgComponent(editor)) return editor as CellEditor;

    const cached = this.editorCache.get(editor);
    if (cached) return cached;

    const adapted = this.createEditorClass(editor);
    this.editorCache.set(editor, adapted);
    return adapted;
  }

  private createEditorClass(component: Type<unknown>): CellEditorClass {
    const adapters = this;
    type EditorInstance = {
      getValue?: () => unknown;
      isParsed?: () => boolean;
      focus?: () => void;
      isCancelBeforeStart?: () => boolean;
    };
    return class NgCellEditorAdapter implements ICellEditor {
      private el = document.createElement("div");
      private mounted: MountedComponent<EditorInstance> | null = null;

      init(params: ICellEditorParams): void {
        this.el.style.width = "100%";
        this.el.style.height = "100%";
        // mount() runs the first change-detection cycle synchronously, so the instance is fully
        // initialized before the grid calls focus()/getValue().
        this.mounted = adapters.mount<EditorInstance>(component, params, this.el, "cellEditor");
      }

      getGui(): HTMLElement {
        return this.el;
      }

      getValue(): unknown {
        return this.mounted?.instance.getValue?.();
      }

      isParsed(): boolean {
        return this.mounted?.instance.isParsed?.() ?? false;
      }

      focus(): void {
        this.mounted?.instance.focus?.();
      }

      isCancelBeforeStart(): boolean {
        return this.mounted?.instance.isCancelBeforeStart?.() ?? false;
      }

      destroy(): void {
        // Defer teardown out of the current commit/keyboard dispatch: the destroy may be triggered
        // by an event fired from inside the component's own template.
        const mounted = this.mounted;
        this.mounted = null;
        if (mounted) queueMicrotask(() => mounted.destroy());
      }
    };
  }

  // --- column defs -----------------------------------------------------------------------------

  /**
   * Adapt the Angular-aware components carried by a single column def into their core equivalents.
   * Used for real column defs and, via {@link adaptDefaultColDef}, the grid-level `defaultColDef`.
   */
  adaptColDef(colDef: NgColDef): ColDef {
    return {
      ...colDef,
      cellRenderer: this.adaptCellRenderer(colDef.cellRenderer),
      cellEditor: this.adaptCellEditor(colDef.cellEditor),
      tooltipComponent: this.adaptTooltip(colDef.tooltipComponent),
      headerTooltip: this.adaptHeaderTooltip(colDef.headerTooltip),
      actionFrameComponent: this.adaptActionFrame(colDef.actionFrameComponent),
      children: colDef.children ? (this.adaptColumnDefs(colDef.children) ?? undefined) : undefined,
    };
  }

  adaptColumnDefs(columnDefs?: NgColDef[] | ColDef[] | null): ColDef[] | null | undefined {
    if (columnDefs == null) return columnDefs;
    return (columnDefs as NgColDef[]).map((colDef) => this.adaptColDef(colDef));
  }

  /**
   * Adapt a grid-level `defaultColDef`: same per-field component adaptation as a real column def,
   * but only the fields actually present are adapted (it is a partial), so an omitted field stays
   * omitted rather than being forced to `undefined`.
   */
  adaptDefaultColDef(defaultColDef?: NgDefaultColDef | null): DefaultColDef | undefined {
    if (defaultColDef == null) return undefined;
    const next = { ...defaultColDef } as unknown as DefaultColDef;
    if ("cellRenderer" in defaultColDef) next.cellRenderer = this.adaptCellRenderer(defaultColDef.cellRenderer);
    if ("cellEditor" in defaultColDef) next.cellEditor = this.adaptCellEditor(defaultColDef.cellEditor);
    if ("tooltipComponent" in defaultColDef) next.tooltipComponent = this.adaptTooltip(defaultColDef.tooltipComponent);
    if ("headerTooltip" in defaultColDef) next.headerTooltip = this.adaptHeaderTooltip(defaultColDef.headerTooltip);
    if ("actionFrameComponent" in defaultColDef) {
      next.actionFrameComponent = this.adaptActionFrame(defaultColDef.actionFrameComponent);
    }
    return next;
  }
}

function isCoreEditorClass(e: unknown): e is CellEditorClass {
  const proto = (e as { prototype?: Record<string, unknown> })?.prototype;
  return (
    typeof e === "function" &&
    !!proto &&
    typeof proto.init === "function" &&
    typeof proto.getGui === "function"
  );
}

function getRendererProps(params: CellRendererParams): CellRendererParams {
  const extraParams = params.colDef.cellRendererParams;
  if (extraParams == null || typeof extraParams !== "object") return params;
  return { ...params, ...extraParams };
}

function getTooltipProps(params: TooltipComponentParams): TooltipComponentParams {
  const extraParams = params.colDef?.tooltipComponentParams;
  if (extraParams == null || typeof extraParams !== "object") return params;
  return { ...params, ...extraParams };
}

function getActionFrameProps(params: ActionFrameComponentParams): ActionFrameComponentParams {
  const extraParams = params.colDef?.actionFrameComponentParams;
  if (extraParams == null || typeof extraParams !== "object") return params;
  return { ...params, ...extraParams };
}
