import { GridCore } from "../../core/core";
import type { GridSheet, GridViewState, SheetsOptions } from "../../interfaces/gridView";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import type { MenuItem } from "../../interfaces/menuItem";
import { MenuRenderer } from "../menuRenderer";

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

function createSheetId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (randomUUID) return randomUUID.call(globalThis.crypto);
  return `sheet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
    this.addButton.setAttribute("aria-label", "Add pivot sheet");
    this.addButton.title = "Add pivot sheet";
    this.addButton.addEventListener("click", () => this.addPivotSheet());

    this.params.host.append(this.scrollWrap, this.addButton);

    this.tablist.addEventListener("scroll", () => this.updateOverflowFades());
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
    if (!this.isEnabled()) return;
    const source = this.params.api.captureViewState();
    const state: GridViewState = {
      ...source,
      pivotMode: true,
      pivotColumns: [],
      aggregateModel: [],
      rowGroupColumns: [],
      groupExpansion: [],
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
    const sheet: GridSheet = { id: createSheetId(), name: this.nextPivotSheetName(), state };
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

  /** Duplicate a sheet (active one: from its live state) and insert the copy right after it. */
  private duplicateSheet(sheetId: string): void {
    const idx = this.sheets.findIndex(sheet => sheet.id === sheetId);
    if (idx < 0) return;
    const source = this.sheets[idx];
    const state = sheetId === this.activeSheetId
      ? this.params.api.captureViewState()
      : source.state;
    const copy: GridSheet = {
      id: createSheetId(),
      name: `${source.name} (copy)`,
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

      if (this.renamingSheetId === sheet.id) {
        tab.appendChild(this.buildRenameInput(sheet));
      } else {
        tab.textContent = sheet.name;
        tab.addEventListener("click", () => this.activateSheet(sheet.id));
        tab.addEventListener("dblclick", () => this.startRename(sheet.id));
        tab.addEventListener("contextmenu", (e) => this.openTabMenu(e, sheet.id));
      }
      this.tablist.appendChild(tab);
    }

    if (hadFocus && this.renamingSheetId == null) {
      this.tablist.querySelector<HTMLButtonElement>("[aria-selected=\"true\"]")?.focus();
    }
    if (this.renamingSheetId != null) {
      this.tablist.querySelector<HTMLInputElement>(".pte-sheet-rename-input")?.focus();
    }
    this.updateOverflowFades();
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

  private openTabMenu(e: MouseEvent, sheetId: string): void {
    e.preventDefault();
    const items: MenuItem[] = [
      { id: "sheetRename", label: "Rename", command: "sheet.rename" },
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
