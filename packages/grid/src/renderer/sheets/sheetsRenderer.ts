import { GridCore } from "../../core/core";
import type { GridSheet, GridViewState, SheetsOptions, SheetTabColor } from "../../interfaces/gridView";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import type { MenuItem } from "../../interfaces/menuItem";
import { isPivotResultColId } from "../../interfaces/pivot";
import { createRecordId } from "../../misc";
import { MenuRenderer } from "../menuRenderer";
import { createCustomColorSwatch, createSheetColorSwatch, SHEET_COLORS } from "./sheetColors";

interface SheetsRendererParams {
  core: GridCore;
  api: IGridAPI;
  /** The footer's left zone (`.pte-footer-tabs`), owned by the pagination renderer. */
  host: HTMLDivElement;
  menuRenderer: MenuRenderer;
  options?: SheetsOptions;
  /** The tab strip mounted or unmounted — the footer re-evaluates its own visibility. */
  onEnabledChange: () => void;
  /** The active tab changed (or the strip toggled) — the grid root re-resolves its accessible name. */
  onActiveTabChange: () => void;
}

/**
 * Spreadsheet-style sheet tabs (footer left zone). A sheet is a named, live `GridViewState` over
 * the shared row model: switching tabs captures the outgoing sheet's state and applies the
 * incoming one — one grid instance, one row model, one edit history. The application owns the
 * sheet list ({@link SheetsOptions} mirrors `SavedViewsOptions`): the strip optimistically updates
 * the supplied list and reports every complete next list through `onChange`.
 *
 * Deliberate contract edges, mirroring saved views:
 *  - `setOptions` only syncs the list and the active highlight; it never applies a view state.
 *    State application happens on user-driven switches (the app can call `api.applyViewState`
 *    itself for programmatic jumps).
 *  - An empty/omitted list shows a synthesized "Data" tab for the grid's current state, so the
 *    strip always has at least one tab; it enters the reported list on the first mutation.
 *  - Selection is per-session, not per-sheet: `GridViewState` doesn't serialize selection, so a
 *    sheet switch clears it like any other model change.
 */
export class SheetsRenderer {
  private sheetsOptions?: SheetsOptions;
  private sheets: GridSheet[] = [];
  private activeSheetId: string | null = null;

  private readonly scrollWrap: HTMLDivElement;
  private readonly tablist: HTMLDivElement;
  private readonly addButton: HTMLButtonElement;
  private renamingSheetId: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  /** The offscreen `<input type="color">` behind "Custom…", built on first use. */
  private colorInput: HTMLInputElement | null = null;

  constructor(private params: SheetsRendererParams) {
    this.scrollWrap = document.createElement("div");
    this.scrollWrap.className = "pte-sheet-scroll-wrap";
    this.tablist = document.createElement("div");
    this.tablist.className = "pte-sheet-tabs";
    this.tablist.setAttribute("role", "tablist");
    this.tablist.setAttribute("aria-label", "Sheets");
    this.scrollWrap.appendChild(this.tablist);

    this.addButton = document.createElement("button");
    this.addButton.type = "button";
    this.addButton.className = "pte-sheet-add";
    this.addButton.textContent = "+";
    // A new sheet is a PIVOT sheet, so on a grid that cannot pivot the button has nothing to
    // offer — and pressing it would clear the roles of the sheet it was pressed on to set up a
    // pivot the core then refuses. Both reasons are fixed for the life of the grid, so this is
    // settled once. Disabled rather than hidden: the tooltip is where the "why" lives.
    const pivotable = this.params.core.isPivotSupported();
    this.addButton.disabled = !pivotable;
    const label = pivotable
      ? "Add pivot sheet"
      : "Pivot sheets need the client-side row model without tree data";
    this.addButton.setAttribute("aria-label", label);
    this.addButton.title = label;
    this.addButton.addEventListener("click", () => this.addPivotSheet());

    this.params.host.append(this.scrollWrap, this.addButton);

    this.tablist.addEventListener("scroll", () => this.updateOverflowFades());
    // Not passive: the handler turns a vertical wheel into a horizontal one, which means
    // preventing the default it would otherwise have.
    this.tablist.addEventListener("wheel", (e) => this.onTablistWheel(e), { passive: false });
    this.tablist.addEventListener("keydown", (e) => this.onTablistKeyDown(e));
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.updateOverflowFades());
      this.resizeObserver.observe(this.tablist);
    }

    this.setOptions(params.options);
  }

  isEnabled(): boolean {
    return this.sheetsOptions != null;
  }

  /** Whether "+" has anything to offer: pivot sheets need a row model that can pivot. */
  canAddPivotSheet(): boolean {
    return this.isEnabled() && this.params.core.isPivotSupported();
  }

  /**
   * Hide the "+" button because the footer's ladder displaced it into the overflow menu. The strip
   * itself is never displaced — it is the elastic zone, and scrolls instead.
   */
  setAddButtonDisplaced(displaced: boolean): void {
    this.addButton.classList.toggle("pte-bar-displaced", displaced);
    // The zone's floor comes down with the button, so displacing it actually buys the footer room
    // rather than just taking the button away.
    this.params.host.classList.toggle("pte-footer-tabs-narrow", displaced);
  }

  /** The "+" action, for the footer's overflow menu to offer once the button itself is gone. */
  addPivotSheetFromMenu(): void {
    this.addPivotSheet();
  }

  /** DOM id of the active tab, for the grid root's `aria-labelledby` fallback. Null when disabled. */
  getActiveTabElementId(): string | null {
    if (!this.isEnabled() || this.activeSheetId == null) return null;
    return this.tabElementId(this.activeSheetId);
  }

  /**
   * Adopt the application-supplied options. Sync-only: the list and active highlight update, but no
   * view state is applied (see the class comment).
   */
  setOptions(options: SheetsOptions | undefined): void {
    const wasEnabled = this.isEnabled();
    this.sheetsOptions = options;
    this.sheets = [...(options?.sheets ?? [])];
    if (options && this.sheets.length === 0) {
      this.sheets = [{ id: "data", name: "Data" }];
    }
    if (options?.activeSheetId !== undefined) {
      this.activeSheetId = options.activeSheetId;
    }
    if (this.activeSheetId == null || !this.sheets.some(sheet => sheet.id === this.activeSheetId)) {
      this.activeSheetId = this.sheets[0]?.id ?? null;
    }
    this.params.host.classList.toggle("pte-footer-tabs-enabled", this.isEnabled());
    this.render();
    if (wasEnabled !== this.isEnabled()) this.params.onEnabledChange();
    this.params.onActiveTabChange();
  }

  /** Switch to the sheet's adjacent neighbor (delta ±1) — the Ctrl+PageDown/PageUp binding. */
  activateAdjacent(delta: 1 | -1): boolean {
    if (!this.isEnabled() || this.sheets.length < 2) return false;
    const idx = this.sheets.findIndex(sheet => sheet.id === this.activeSheetId);
    const next = this.sheets[idx + delta];
    if (!next) return false;
    this.activateSheet(next.id);
    return true;
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.colorInput?.remove();
    this.colorInput = null;
  }

  // ---------------- Switching ----------------

  /**
   * User-driven sheet switch: capture the outgoing sheet's live state (reported through
   * `onChange`), then apply the incoming sheet's stored state. A sheet without one adopts the
   * grid's current state instead — it gets captured when the user leaves it.
   */
  private activateSheet(sheetId: string): void {
    if (sheetId === this.activeSheetId) return;
    const target = this.sheets.find(sheet => sheet.id === sheetId);
    if (!target) return;

    this.commitSheets(this.withCapturedActiveState(this.sheets));
    this.setActiveSheet(sheetId);
    if (target.state) this.params.api.applyViewState(target.state);
  }

  /** The list with the live view state stored on the active sheet (unchanged when it's gone). */
  private withCapturedActiveState(sheets: GridSheet[]): GridSheet[] {
    const active = sheets.find(sheet => sheet.id === this.activeSheetId);
    if (!active) return sheets;
    const state = this.params.api.captureViewState();
    return sheets.map(sheet => (sheet.id === active.id ? { ...sheet, state } : sheet));
  }

  private setActiveSheet(sheetId: string | null): void {
    if (this.activeSheetId === sheetId) return;
    this.activeSheetId = sheetId;
    this.render();
    this.sheetsOptions?.onActiveSheetChange?.(sheetId);
    this.params.onActiveTabChange();
  }

  private commitSheets(sheets: GridSheet[]): void {
    this.sheets = sheets;
    if (this.activeSheetId && !sheets.some(sheet => sheet.id === this.activeSheetId)) {
      this.setActiveSheet(sheets[0]?.id ?? null);
    }
    this.render();
    this.sheetsOptions?.onChange?.([...sheets]);
  }

  // ---------------- Mutations ----------------

  /**
   * The **+** button: append a fresh pivot sheet and switch to it. Its state derives from the
   * current live state with a blank pivot configuration — pivot mode on, no pivot columns, no
   * measures, no row groups — so the new sheet opens on the "choose an aggregate" hint, ready to
   * be configured. Columns and filters carry over from the sheet the user pressed + on.
   */
  private addPivotSheet(): void {
    if (!this.isEnabled() || !this.params.core.isPivotSupported()) return;
    const source = this.params.api.captureViewState();
    const autoGroupColIds = new Set(
      this.params.core.getColumnModel().getAutoGroupColumns().map(col => col.colId),
    );
    const state: GridViewState = {
      ...source,
      pivotMode: true,
      pivotColumns: [],
      aggregateModel: [],
      rowGroupColumns: [],
      groupExpansion: [],
      // A sort on a generated pivot column belongs to the sheet whose pivot generated it. This
      // sheet starts with no pivot configuration at all, so carrying those ids over would sort it
      // by columns it never produces — and persist them into its saved state. A sort on the
      // auto-group column goes the same way: it orders the group buckets of a grouping this sheet
      // clears above, so it would arrive as a sort the user never asked this sheet for.
      sortModel: (source.sortModel ?? []).filter(item =>
        !isPivotResultColId(item.colId) && !autoGroupColIds.has(item.colId)),
      // Turning pivot mode off on this sheet lands on the sheet the user pressed + on — its
      // non-pivot roles, which is its own base layer when it was itself pivoted. A fresh sheet has
      // no earlier pivot configuration to reinstate, so the source sheet's stash never carries in.
      prePivotState: source.prePivotState ?? {
        rowGroupColumns: source.rowGroupColumns,
        aggregateModel: source.aggregateModel ?? [],
        pivotColumns: source.pivotColumns ?? [],
      },
      pivotState: undefined,
    };
    const sheet: GridSheet = { id: createRecordId("sheet"), name: this.nextPivotSheetName(), state };
    this.commitSheets([...this.withCapturedActiveState(this.sheets), sheet]);
    this.setActiveSheet(sheet.id);
    this.params.api.applyViewState(state);
    this.focusTab(sheet.id);
  }

  private nextPivotSheetName(): string {
    const used = new Set<number>();
    for (const sheet of this.sheets) {
      const match = /^Pivot (\d+)$/.exec(sheet.name);
      if (match) used.add(Number(match[1]));
    }
    let n = 1;
    while (used.has(n)) n++;
    return `Pivot ${n}`;
  }

  private renameSheet(sheetId: string, name: string): void {
    const trimmed = name.trim();
    const current = this.sheets.find(sheet => sheet.id === sheetId);
    if (!trimmed || !current || current.name === trimmed) return;
    this.commitSheets(this.sheets.map(sheet =>
      sheet.id === sheetId ? { ...sheet, name: trimmed } : sheet,
    ));
  }

  /**
   * Apply a tab colour, or clear it with `null`. Colour is sheet metadata, not view state, so this
   * touches only the list — no capture, no state application, and the active sheet is unaffected
   * by colouring a different one.
   */
  private setSheetColor(sheetId: string, color: string | null): void {
    const current = this.sheets.find(sheet => sheet.id === sheetId);
    if (!current || (current.color ?? null) === color) return;
    this.commitSheets(this.sheets.map(sheet => {
      if (sheet.id !== sheetId) return sheet;
      const next = { ...sheet };
      // Deleted rather than set to undefined: the list goes to the application to persist, and an
      // explicit `color: undefined` survives a structuredClone but not a JSON round-trip.
      if (color) next.color = color;
      else delete next.color;
      return next;
    }));
  }

  /** Duplicate a sheet (active one: from its live state) and insert the copy right after it. */
  private duplicateSheet(sheetId: string): void {
    const idx = this.sheets.findIndex(sheet => sheet.id === sheetId);
    if (idx < 0) return;
    const source = this.sheets[idx];
    const state = sheetId === this.activeSheetId
      ? this.params.api.captureViewState()
      : source.state;
    const copy: GridSheet = {
      id: createRecordId("sheet"),
      name: `${source.name} (copy)`,
      ...(source.color ? { color: source.color } : {}),
      ...(state ? { state: structuredClone(state) } : {}),
    };
    const next = [...this.sheets];
    next.splice(idx + 1, 0, copy);
    this.commitSheets(next);
  }

  /** Delete a sheet; deleting the active one activates its right neighbor (else the left one). */
  private deleteSheet(sheetId: string): void {
    if (this.sheets.length <= 1) return;
    const idx = this.sheets.findIndex(sheet => sheet.id === sheetId);
    if (idx < 0) return;
    const wasActive = sheetId === this.activeSheetId;
    const next = this.sheets.filter(sheet => sheet.id !== sheetId);
    const successor = next[Math.min(idx, next.length - 1)];
    if (wasActive && successor) {
      // The deleted sheet's state dies with it — no capture, straight to the successor.
      this.sheets = next;
      this.render();
      this.sheetsOptions?.onChange?.([...next]);
      this.setActiveSheet(successor.id);
      if (successor.state) this.params.api.applyViewState(successor.state);
      return;
    }
    this.commitSheets(next);
  }

  // ---------------- Tab strip ----------------

  private tabElementId(sheetId: string): string {
    return `${this.params.core.id}-sheet-tab-${encodeURIComponent(sheetId)}`;
  }

  private render(): void {
    const hadFocus = this.tablist.contains(document.activeElement);
    this.tablist.innerHTML = "";
    this.addButton.style.display = this.isEnabled() ? "" : "none";
    if (!this.isEnabled()) {
      this.updateOverflowFades();
      return;
    }

    for (const sheet of this.sheets) {
      // A tab being renamed IS the text field — the input replaces the button rather than nesting
      // inside it. A control inside a control is invalid HTML, and browsers are free to route the
      // click and the focus to the outer button, which is what could leave a rename stuck open.
      this.tablist.appendChild(
        this.renamingSheetId === sheet.id ? this.buildRenameInput(sheet) : this.buildTab(sheet),
      );
    }

    if (hadFocus && this.renamingSheetId == null) {
      this.tablist.querySelector<HTMLButtonElement>("[aria-selected=\"true\"]")?.focus();
    }
    if (this.renamingSheetId != null) {
      this.tablist.querySelector<HTMLInputElement>(".pte-sheet-rename-input")?.focus();
    }
    this.updateOverflowFades();
  }

  private buildTab(sheet: GridSheet): HTMLButtonElement {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "pte-sheet-tab";
    tab.id = this.tabElementId(sheet.id);
    tab.setAttribute("role", "tab");
    const active = sheet.id === this.activeSheetId;
    tab.setAttribute("aria-selected", String(active));
    // Roving tabindex: the strip is one tab stop; arrows move within it.
    tab.tabIndex = active ? 0 : -1;
    tab.dataset.sheetId = sheet.id;
    if (sheet.color) {
      // The class is what arms the tint overlay; the raw colour rides a custom property so the
      // stylesheet owns how much of it reaches the tab (tinted here, solid in the underline).
      tab.classList.add("pte-sheet-tab-colored");
      tab.style.setProperty("--pte-sheet-tab-color", sheet.color);
    }
    // The name lives in a span so a long one can ellipsize against the tab's max width; the tab
    // itself is a flex container, where `text-overflow` has no bare text box to act on.
    const label = document.createElement("span");
    label.className = "pte-sheet-tab-label";
    label.textContent = sheet.name;
    tab.appendChild(label);
    // The visible label may be the truncated one, so the full name stays reachable on hover. The
    // accessible name still comes from the tab's own text, not from this.
    tab.title = sheet.name;
    tab.addEventListener("click", () => this.activateSheet(sheet.id));
    tab.addEventListener("dblclick", () => this.startRename(sheet.id));
    tab.addEventListener("contextmenu", (e) => this.openTabMenu(e, sheet.id));
    return tab;
  }

  private startRename(sheetId: string): void {
    this.renamingSheetId = sheetId;
    this.render();
    this.tablist.querySelector<HTMLInputElement>(".pte-sheet-rename-input")?.select();
  }

  private buildRenameInput(sheet: GridSheet): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "pte-sheet-rename-input";
    input.value = sheet.name;
    input.setAttribute("aria-label", `Rename sheet ${sheet.name}`);
    // The input stands in for the tab, so it carries the tab's identity: `focusTab` addresses it,
    // and the grid root's aria-labelledby points at this id while the active sheet is renamed.
    input.id = this.tabElementId(sheet.id);
    input.dataset.sheetId = sheet.id;
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      this.renamingSheetId = null;
      if (commit) this.renameSheet(sheet.id, input.value);
      this.render();
      this.focusTab(sheet.id);
    };
    input.addEventListener("keydown", (e) => {
      // The strip's own arrow/Home/End handling and the grid's router must not see editing keys.
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("click", (e) => e.stopPropagation());
    return input;
  }

  /**
   * The palette for one sheet: the application's if it supplied one, else the built-in list. The
   * function form is called per menu-open rather than cached, so it sees the application's current
   * state — and the sheet it is asked about, which is what makes a palette sheet-specific.
   */
  private paletteFor(sheet: GridSheet): readonly SheetTabColor[] {
    const colors = this.sheetsOptions?.colors;
    if (colors == null) return SHEET_COLORS;
    return typeof colors === "function" ? colors(sheet) : colors;
  }

  /** Whether this sheet's menu offers the platform colour picker. Off unless asked for. */
  private customColorFor(sheet: GridSheet): boolean {
    const custom = this.sheetsOptions?.customColor;
    return typeof custom === "function" ? custom(sheet) : custom === true;
  }

  /**
   * The "Change color" submenu: "None" first, then the palette. A check marks the sheet's current
   * colour — matched case-insensitively, since the list round-trips through the application's own
   * storage and can come back as `#EF4444`. A colour outside the palette (set programmatically, or
   * persisted from a palette since changed) leaves every entry unchecked and still paints its tab;
   * "None" clears it either way.
   *
   * Only ever called for a non-empty palette — an empty one drops the parent item entirely, since a
   * "Change color" offering nothing but "None" is a dead end.
   */
  private colorMenuItems(sheet: GridSheet, palette: readonly SheetTabColor[]): MenuItem[] {
    const current = sheet.color?.toLowerCase();
    // A colour the palette does not offer is, by definition, the custom one — so the check and the
    // chip move to "Custom…" rather than the menu showing nothing selected at all.
    const custom = this.customColorFor(sheet);
    const currentIsCustom = current != null
      && !palette.some(entry => entry.color.toLowerCase() === current);
    return [
      {
        id: "sheetColorNone",
        label: "None",
        command: "sheet.color",
        payload: null,
        left: createSheetColorSwatch(),
        right: current ? undefined : "icon-check",
      },
      { id: "sheetColorSeparator", isSeparator: true },
      // Index-based ids: a supplied entry has no identity of its own, and two entries sharing a
      // name (or a colour) must still get distinct menu items.
      ...palette.map((entry, idx): MenuItem => ({
        id: `sheetColor-${idx}`,
        label: entry.name ?? entry.color,
        command: "sheet.color",
        payload: entry.color,
        left: createSheetColorSwatch(entry.color),
        right: current === entry.color.toLowerCase() ? "icon-check" : undefined,
      })),
      ...(custom
        ? [
          // The separator only earns its place between two groups; with an empty palette the
          // picker is the whole menu below "None".
          ...(palette.length > 0
            ? [{ id: "sheetColorCustomSeparator", isSeparator: true } satisfies MenuItem]
            : []),
          {
            id: "sheetColorCustom",
            label: "Custom…",
            command: "sheet.colorCustom",
            left: createCustomColorSwatch(currentIsCustom ? sheet.color : undefined),
            right: currentIsCustom ? "icon-check" : undefined,
          } satisfies MenuItem,
        ]
        : []),
    ];
  }

  /**
   * Open the platform colour picker for a sheet. Reached from a menu item click, so the call still
   * carries the user activation `showPicker()` requires; `click()` is the fallback for engines
   * without it. Committing on `change` and not on `input` is what makes a dismissed picker a
   * no-op — and keeps a drag across the spectrum from reporting a hundred lists to the application.
   */
  private openColorPicker(sheetId: string): void {
    const sheet = this.sheets.find(candidate => candidate.id === sheetId);
    if (!sheet) return;
    const input = this.ensureColorInput();
    this.positionColorInput(sheetId);
    // The control only speaks #rrggbb: seeding it with anything else silently lands on black, so a
    // sheet wearing an hsl()/named colour opens the picker on the palette's blue instead.
    input.value = /^#[0-9a-f]{6}$/i.test(sheet.color ?? "") ? sheet.color! : "#3b82f6";
    // Assigned, not added: the handler closes over one sheet id, and each open replaces the last.
    input.onchange = () => {
      this.setSheetColor(sheetId, input.value);
      // The picker took focus out of the strip, so render() cannot restore it on its own.
      this.focusTab(sheetId);
    };
    try {
      if (typeof input.showPicker === "function") input.showPicker();
      else input.click();
    } catch {
      input.click();
    }
  }

  /**
   * Park the invisible control on the tab it belongs to. Chromium anchors the picker popup to the
   * control's box, so a control left where it was laid out — 1px, at the origin of its containing
   * block — opens the picker in the corner of the grid instead of under the tab the menu came from.
   * Sized to the tab as well as placed on it, so the popup clears the tab the way a menu would.
   * (Firefox and Safari open a dialog of their own and ignore all of this.)
   *
   * The offsets are measured against the containing block — the padding box of `offsetParent`,
   * which is the grid root — rather than against the viewport, so the control still lands on the
   * tab when the application has the grid inside a translated ancestor.
   */
  private positionColorInput(sheetId: string): void {
    const input = this.ensureColorInput();
    const anchor = this.tablist.querySelector<HTMLElement>(`[id="${this.tabElementId(sheetId)}"]`)
      ?? this.scrollWrap;
    const rect = anchor.getBoundingClientRect();
    const parent = input.offsetParent as HTMLElement | null;
    const parentRect = parent?.getBoundingClientRect();
    const originX = parentRect ? parentRect.left + parent!.clientLeft : 0;
    const originY = parentRect ? parentRect.top + parent!.clientTop : 0;
    input.style.left = `${rect.left - originX}px`;
    input.style.top = `${rect.top - originY}px`;
    input.style.width = `${rect.width}px`;
    input.style.height = `${rect.height}px`;
    // Force the box to be laid out now. Blink reads the control's CURRENT layout to place the
    // popup, and a control styled and opened inside one task has none yet — which is how the
    // picker ended up in the grid's top corner, at the control's declared 0,0, rather than on the
    // tab. Reading a layout property is the flush.
    void input.offsetWidth;
  }

  private ensureColorInput(): HTMLInputElement {
    if (this.colorInput) return this.colorInput;
    const input = document.createElement("input");
    input.type = "color";
    // Offscreen rather than display:none — a picker cannot be opened on an unrendered control —
    // and out of the tab order and the accessibility tree, since the menu item is the real control.
    input.className = "pte-sheet-color-input";
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");
    this.params.host.appendChild(input);
    this.colorInput = input;
    return input;
  }

  private openTabMenu(e: MouseEvent, sheetId: string): void {
    e.preventDefault();
    const sheet = this.sheets.find(candidate => candidate.id === sheetId);
    const palette = sheet ? this.paletteFor(sheet) : [];
    // Park the picker's control on this tab now rather than when "Custom…" is clicked: opening the
    // menu, walking to the submenu and clicking is many frames, so the box is long since laid out
    // by the time the picker asks where it is. openColorPicker repositions anyway, for the case
    // where something moved the strip while the menu was open.
    if (sheet && this.customColorFor(sheet)) this.positionColorInput(sheetId);
    const items: MenuItem[] = [
      { id: "sheetRename", label: "Rename", command: "sheet.rename" },
      ...(sheet && (palette.length > 0 || this.customColorFor(sheet))
        ? [{ id: "sheetColor", label: "Change color", subMenu: this.colorMenuItems(sheet, palette) }]
        : []),
      { id: "sheetDuplicate", label: "Duplicate", command: "sheet.duplicate" },
      {
        id: "sheetDelete",
        label: "Delete",
        command: "sheet.delete",
        disabled: this.sheets.length <= 1,
        title: this.sheets.length <= 1 ? "The last sheet cannot be deleted" : undefined,
      },
    ];
    this.params.menuRenderer.open({
      clientX: e.clientX,
      clientY: e.clientY,
      items,
      ariaLabel: "Sheet actions",
      onItemClick: (item) => {
        if (item.command === "sheet.rename") this.startRename(sheetId);
        else if (item.command === "sheet.color") this.setSheetColor(sheetId, item.payload ?? null);
        else if (item.command === "sheet.colorCustom") this.openColorPicker(sheetId);
        else if (item.command === "sheet.duplicate") this.duplicateSheet(sheetId);
        else if (item.command === "sheet.delete") this.deleteSheet(sheetId);
      },
    });
  }

  private onTablistKeyDown(e: KeyboardEvent): void {
    if (this.renamingSheetId != null) return;
    const tabs = [...this.tablist.querySelectorAll<HTMLButtonElement>(".pte-sheet-tab")];
    if (tabs.length === 0) return;
    const currentIdx = tabs.findIndex(tab => tab === document.activeElement);

    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = Math.min(tabs.length - 1, Math.max(0, currentIdx) + 1);
    else if (e.key === "ArrowLeft") nextIdx = Math.max(0, (currentIdx < 0 ? tabs.length : currentIdx) - 1);
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = tabs.length - 1;
    else if (e.key === "F2" && currentIdx >= 0) {
      e.preventDefault();
      e.stopPropagation();
      this.startRename(tabs[currentIdx].dataset.sheetId!);
      return;
    }
    if (nextIdx == null) return;
    e.preventDefault();
    e.stopPropagation();
    // Manual activation (arrows move focus, Enter/Space — the button default — activates):
    // switching sheets swaps the whole view state, too heavy to run on every focus move.
    tabs[nextIdx].focus();
  }

  private focusTab(sheetId: string): void {
    this.tablist.querySelector<HTMLButtonElement>(`[id="${this.tabElementId(sheetId)}"]`)?.focus();
  }

  /**
   * A tab strip scrolls sideways, but a mouse wheel only ever sends `deltaY` — and a browser sends
   * that to the nearest *vertical* scroller, which is the grid body, not the strip. So the strip
   * showed its overflow fades while the tabs behind them stayed unreachable to anyone without a
   * trackpad. Translate the dominant axis into a horizontal scroll.
   *
   * The event is claimed only while the strip can actually move that way, so at either end the
   * wheel goes back to meaning what it usually means and the page still scrolls.
   */
  private onTablistWheel(e: WheelEvent): void {
    const el = this.tablist;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    const next = Math.max(0, Math.min(max, el.scrollLeft + delta));
    if (next === el.scrollLeft) return;
    e.preventDefault();
    el.scrollLeft = next;
  }

  private updateOverflowFades(): void {
    const el = this.tablist;
    const overflowing = el.scrollWidth > el.clientWidth + 1;
    this.scrollWrap.classList.toggle("pte-sheet-overflow-left", overflowing && el.scrollLeft > 1);
    this.scrollWrap.classList.toggle(
      "pte-sheet-overflow-right",
      overflowing && el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    );
  }
}
