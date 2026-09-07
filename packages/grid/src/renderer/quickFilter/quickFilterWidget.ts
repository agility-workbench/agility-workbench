import { IGridCore } from "../../interfaces/iGridCore";
import { getIconClassName } from "../../theme/icons";
import {
  QuickFilterBehavior,
  QuickFilterMatchMode,
  QuickFilterOptions,
  ResolvedQuickFilterOptions,
  resolveQuickFilterOptions,
} from "../../interfaces/gridOptions";
import { QuickFilterFindState } from "../../interfaces/find";
import { button, div, span } from "../element";
import { matchesChord } from "../interaction/keyChord";

// Transient state carried across a config-driven rebuild so the live search isn't lost when the
// widget is torn down and reconstructed with new options (see GridRenderer.setQuickFilterOptions).
// Layout/structural config (mode, position, clearOnClose, showOptions…) comes from the new config;
// only the "what am I searching for" state is preserved here.
export interface QuickFilterRestoreState {
  text: string;
  open: boolean;
  matchMode: QuickFilterMatchMode;
  caseSensitive: boolean;
  /** The live behavior, which the end user may have toggled away from the configured one. */
  behavior: QuickFilterBehavior;
  /**
   * The behavior the OUTGOING config resolved to. Comparing it with the incoming config's tells a
   * user toggle apart from an app-driven change: an app that reconfigures `quickFilter.behavior`
   * means it, and wins; a reconfigure that leaves it alone must not throw away the user's choice.
   */
  configBehavior: QuickFilterBehavior;
}

interface QuickFilterWidgetParams {
  core: IGridCore;
  /** Return keyboard ownership to the grid after this widget dismisses or blurs itself. */
  focusGrid: () => void;
  root: HTMLElement;
  // The raw quick-filter config to build from. Passed explicitly (rather than read from core) so a
  // reconfigure can construct a fresh widget from new options without the grid being remounted.
  options: boolean | QuickFilterOptions | undefined;
  /** The toolbar reuses this widget but suppresses its floating-only presentation controls. */
  presentation?: "floating" | "toolbar";
  // Search state to restore when rebuilding in place (omitted on first construction).
  restore?: QuickFilterRestoreState;
}

// A self-contained, floating global-search widget. It owns its input, an options popover
// (match-mode + case sensitivity), debouncing, and its open/closed state. It dispatches
// `quickFilterSet` into the core and never reads row data directly.
//
// Designed as a standalone panel (not baked into the pagination bar) so a future "advanced filter"
// can grow out of the same widget by promoting its contents into a modal.
export class QuickFilterWidget {
  private wrapper: HTMLDivElement;
  private searchRow: HTMLDivElement;
  private input: HTMLInputElement;
  private clearBtn: HTMLButtonElement;
  private optionsBtn?: HTMLButtonElement;
  private closeBtn?: HTMLButtonElement;
  private optionsPanel?: HTMLDivElement;
  // Find navigation: "3 of 27" plus the two steppers. Present only when the find behavior is
  // reachable at all (configured, or offered through the behavior toggle); hidden while filtering.
  private findNav?: HTMLDivElement;
  private findCountLabel?: HTMLSpanElement;
  private findPrevBtn?: HTMLButtonElement;
  private findNextBtn?: HTMLButtonElement;
  private behaviorSelect?: HTMLSelectElement;
  private matchModeRow?: HTMLDivElement;
  private matchModeSelect?: HTMLSelectElement;
  private caseCheckbox?: HTMLInputElement;
  private anchorSelect?: HTMLSelectElement;
  private keepOpenCheckbox?: HTMLInputElement;
  // Collapsed pill shown when the widget is dismissed but a filter is still active
  // (clearOnClose === false). Clicking it re-opens the full widget.
  private indicatorPill?: HTMLButtonElement;
  private indicatorLabel?: HTMLSpanElement;

  private readonly opts: ResolvedQuickFilterOptions;
  // Sticky per-session option state (seeded from the resolved config; user edits mutate it).
  private matchMode: QuickFilterMatchMode;
  private caseSensitive: boolean;
  // Layout state is also sticky per-session and, when `showLayoutOptions` is on, user-editable.
  private anchor: "left" | "right";
  private clearOnClose: boolean;
  // Filter rows, or highlight matches? Sticky per-session like match/case when the user owns the
  // toggle; forced by the config when they do not.
  private behavior: QuickFilterBehavior;

  private debounceTimer: number | null = null;
  private open = false;
  private optionsExpanded = false;
  private unsubscribeCore: (() => void) | null = null;
  private unsubscribePivot: (() => void) | null = null;

  constructor(private params: QuickFilterWidgetParams) {
    this.opts = resolveQuickFilterOptions(params.options);
    // Match/case are per-session sticky: on a rebuild they carry over from the previous widget's
    // live state (via `restore`); on first build they seed from the resolved config.
    this.matchMode = params.restore?.matchMode ?? this.opts.matchMode;
    this.caseSensitive = params.restore?.caseSensitive ?? this.opts.caseSensitive;
    // Behavior is sticky the same way, with one exception: a reconfigure that CHANGED
    // `quickFilter.behavior` is the app saying which one it wants, and overrides the user's choice.
    const restore = params.restore;
    this.behavior = restore == null || restore.configBehavior !== this.opts.behavior
      ? this.opts.behavior
      : restore.behavior;
    // Anchor/clearOnClose always take the *new* config on a rebuild (the reconfigure is what changed
    // them), so they are seeded from `opts`, not from `restore`.
    this.anchor = this.opts.position.anchor;
    this.clearOnClose = this.opts.clearOnClose;

    // The widget is a vertical stack: a search row, and (when expanded) an options panel below it,
    // all inside one bordered container that grows in height to reveal the options.
    this.wrapper = div(
      params.presentation === "toolbar"
        ? "pte-quick-filter pte-quick-filter-toolbar"
        : "pte-quick-filter",
    );
    this.wrapper.setAttribute("role", "search");

    this.searchRow = div("pte-quick-filter-row");

    const searchIcon = span(`pte-quick-filter-icon ${getIconClassName("filter")}`);
    searchIcon.setAttribute("aria-hidden", "true");

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "pte-quick-filter-input";
    // Wording follows the behavior (see syncBehaviorUI); seeded here for the filtering default.
    this.input.placeholder = "Search…";
    this.input.setAttribute("aria-label", "Search all columns");
    this.input.autocomplete = "off";
    this.input.spellcheck = false;

    this.clearBtn = button("pte-quick-filter-clear");
    this.clearBtn.type = "button";
    this.clearBtn.setAttribute("aria-label", "Clear search");
    this.clearBtn.textContent = "×";
    this.clearBtn.hidden = true;

    // The search icon + input + clear button live inside a plain (white, in light theme) bordered
    // field; the surrounding row/container is tinted, so the field reads clearly as the text entry
    // and the trailing buttons read as controls sitting on the chrome.
    const field = div("pte-quick-filter-field");
    field.appendChild(searchIcon);
    field.appendChild(this.input);
    field.appendChild(this.clearBtn);
    this.searchRow.appendChild(field);

    // Built whenever finding is possible — configured now, or one popover toggle away — so switching
    // behavior never has to rebuild the row.
    if (this.opts.behavior === "find" || this.opts.showBehaviorToggle) this.buildFindNav();

    if (this.hasOptionsPopover()) {
      // The button's own background is used for the hover highlight, so the icon lives in a child
      // span (its own mask + fill) — otherwise the hover background would overwrite the icon fill.
      this.optionsBtn = button("pte-quick-filter-btn pte-quick-filter-options");
      this.optionsBtn.type = "button";
      this.optionsBtn.setAttribute("aria-label", "Search options");
      this.optionsBtn.setAttribute("aria-haspopup", "true");
      this.optionsBtn.setAttribute("aria-expanded", "false");
      const optionsIcon = span(`pte-quick-filter-options-icon ${getIconClassName("search-options")}`);
      optionsIcon.setAttribute("aria-hidden", "true");
      this.optionsBtn.appendChild(optionsIcon);
      this.searchRow.appendChild(this.optionsBtn);
    }

    // A dedicated close button, so dismissing doesn't require pressing Esc. In "always" mode the
    // widget is a permanent fixture with nothing to close, so it's omitted there.
    if (!this.isPermanent()) {
      this.closeBtn = button("pte-quick-filter-btn pte-quick-filter-close");
      this.closeBtn.type = "button";
      this.closeBtn.setAttribute("aria-label", "Close search");
      this.closeBtn.title = "Close (Esc)";
      this.closeBtn.textContent = "✕";
      this.searchRow.appendChild(this.closeBtn);
    }

    this.wrapper.appendChild(this.searchRow);
    if (this.hasOptionsPopover()) this.buildOptionsPanel();

    // When the filter can persist past a close, a compact pill stands in for the collapsed widget so
    // the active search stays visible (and re-openable) rather than filtering silently. The pill is
    // built whenever persistence is possible — either configured off now, or reachable at runtime via
    // the layout controls (which can flip `clearOnClose` to false).
    const canPersist = !this.clearOnClose || this.opts.showLayoutOptions;
    if (canPersist && !this.isPermanent()) this.buildIndicatorPill();

    this.bind();
    // Pivot mode decides whether finding is possible at all, so the affordances have to follow it.
    this.unsubscribePivot = this.params.core.on("pivotChanged", () => this.syncBehaviorUI());
    this.unsubscribeCore = this.params.core.on("modelUpdated", event => {
      if (event.reason !== "filter") return;
      const text = this.params.core.getQuickFilterText();
      if (this.input.value === text) return;
      this.input.value = text;
      this.updateClearVisibility();
      this.syncIndicator();
    });
    this.params.root.appendChild(this.wrapper);

    // Restore a carried-over search on rebuild; otherwise start empty.
    if (params.restore?.text) {
      this.input.value = params.restore.text;
      this.updateClearVisibility();
    }

    this.syncBehaviorUI();
    this.syncFindState(this.params.core.getFindState());

    // Open if "always" mode (pinned), or if a rebuild is restoring a previously-open widget.
    const startOpen = this.isPermanent() || (params.restore?.open ?? false);
    this.setOpen(startOpen);
  }

  // ---------------- Find behavior ----------------

  /**
   * Whether the widget is showing its find affordances. The CORE decides, not `this.behavior`: a
   * requested find that cannot run (pivoted, server-side) falls back to filtering, and the widget
   * must show what is actually happening.
   */
  private isFinding(): boolean {
    return this.params.core.getFindState().behavior === "find";
  }

  // "3 of 27" plus previous/next steppers, sitting between the input field and the options button.
  private buildFindNav(): void {
    this.findNav = div("pte-quick-filter-find-nav");
    this.findCountLabel = span("pte-quick-filter-find-count");
    // Polite, not assertive: the count changes on every keystroke, and the grid announces the
    // navigation result itself when the user steps to a match.
    this.findCountLabel.setAttribute("aria-live", "polite");
    this.findNav.appendChild(this.findCountLabel);

    const stepper = (label: string, title: string, icon: string, dir: "previous" | "next") => {
      const btn = button(`pte-quick-filter-btn pte-quick-filter-find-step`);
      btn.type = "button";
      btn.setAttribute("aria-label", label);
      btn.title = title;
      const iconSpan = span(`pte-quick-filter-find-step-icon ${getIconClassName(icon)}`);
      iconSpan.setAttribute("aria-hidden", "true");
      btn.appendChild(iconSpan);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.navigateFind(dir);
        // Steppers are a search gesture: keyboard ownership stays with the box so Enter carries on.
        this.input.focus();
      });
      this.findNav!.appendChild(btn);
      return btn;
    };
    this.findPrevBtn = stepper("Previous match", "Previous match (Shift+Enter)", "move-up", "previous");
    this.findNextBtn = stepper("Next match", "Next match (Enter)", "move-down", "next");
    this.searchRow.appendChild(this.findNav);
  }

  private navigateFind(direction: "previous" | "next"): void {
    if (!this.isFinding()) return;
    // Flush a pending debounce first, or Enter would step through the matches of the term the user
    // has already finished editing away from.
    this.flushPendingCommit();
    this.params.core.dispatch({ type: "findNavigate", direction });
  }

  /**
   * The core's find state changed. Adopt anything a programmatic `api.setQuickFilter` changed
   * behind the widget's back — a find-only change moves no rows, so it emits no `modelUpdated` and
   * the filtering path's own catch-up handler never sees it — then refresh the counter.
   */
  onFindChanged(state: QuickFilterFindState): void {
    this.behavior = this.params.core.getQuickFilterBehavior();
    // Not while a debounce is in flight: the box then holds newer text than the state being
    // reported, and adopting would undo the user's last keystrokes.
    if (this.debounceTimer == null && this.input.value !== state.text) {
      this.input.value = state.text;
      this.updateClearVisibility();
      this.syncIndicator();
    }
    // Unconditionally, and from the CORE's state — never gated on this widget's own `behavior`
    // field agreeing. A reconfigure builds the replacement widget from the new config and only
    // *then* re-commits that behavior to the core (see GridRenderer._buildQuickFilterWidget), so
    // the field already reads the new behavior while the affordances still show the old one; a
    // field-vs-field check finds nothing to do and leaves the widget a flip behind for good.
    this.syncBehaviorUI();
  }

  /** Reflect the core's find state in the counter and the steppers. */
  syncFindState(state: QuickFilterFindState): void {
    if (!this.findNav || !this.findCountLabel) return;
    const searching = this.isFinding() && this.input.value.trim() !== "";
    const count = state.matchCount;
    this.findCountLabel.textContent = !searching
      ? ""
      : count === 0
        ? "No matches"
        : state.activeIndex > 0
          ? `${state.activeIndex} of ${count}`
          : `${count} ${count === 1 ? "match" : "matches"}`;
    const stepsDisabled = !searching || count === 0;
    if (this.findPrevBtn) this.findPrevBtn.disabled = stepsDisabled;
    if (this.findNextBtn) this.findNextBtn.disabled = stepsDisabled;
  }

  /**
   * Show the find affordances (and hide the row-level match-mode control) while finding. Reads the
   * core, not `this.behavior`, so it reports what is actually in force; idempotent, so any caller
   * that suspects a change can just call it.
   */
  private syncBehaviorUI(): void {
    const finding = this.isFinding();
    this.wrapper.classList.toggle("pte-quick-filter-finding", finding);
    if (this.findNav) this.findNav.hidden = !finding;
    // `matchMode` is row-level ("all words, anywhere in the row") and cannot point at a cell, so it
    // has no meaning while finding — hidden rather than disabled, since there is nothing to choose.
    if (this.matchModeRow) this.matchModeRow.hidden = finding;
    if (this.behaviorSelect) {
      const available = this.params.core.getFindState().available;
      // Show what is in force, not what was asked for, and say why the choice is gone.
      this.behaviorSelect.value = finding ? "find" : "filter";
      this.behaviorSelect.disabled = !available;
      this.behaviorSelect.title = available
        ? ""
        : "Highlighting matches is not available while the grid is pivoted";
    }
    this.input.placeholder = finding ? "Find…" : "Search…";
    this.input.setAttribute(
      "aria-label",
      finding ? "Find in all columns" : "Search all columns",
    );
    this.syncFindState(this.params.core.getFindState());
  }

  isEnabled(): boolean {
    return this.opts.enabled;
  }

  // Snapshot the live search state so a reconfigure can rebuild the widget without losing it.
  captureState(): QuickFilterRestoreState {
    return {
      text: this.input.value,
      open: this.open,
      matchMode: this.matchMode,
      caseSensitive: this.caseSensitive,
      behavior: this.behavior,
      configBehavior: this.opts.behavior,
    };
  }

  /** The behavior the widget is driving — read by the renderer to re-commit after a rebuild. */
  getBehavior(): QuickFilterBehavior {
    return this.behavior;
  }

  // The options popover is present when either the match controls or the layout controls are enabled.
  private hasOptionsPopover(): boolean {
    return this.opts.showOptions
      || this.opts.showBehaviorToggle
      || (!this.isToolbarPresentation() && this.opts.showLayoutOptions);
  }

  private isToolbarPresentation(): boolean {
    return this.params.presentation === "toolbar";
  }

  private isPermanent(): boolean {
    return this.isToolbarPresentation() || this.opts.mode === "always";
  }

  isOpen(): boolean {
    return this.open;
  }

  containsFocus(): boolean {
    return this.wrapper.contains(this.wrapper.ownerDocument.activeElement);
  }

  /** Restore keyboard ownership after a config-driven rebuild replaced the focused widget DOM. */
  restoreFocus(): void {
    if (this.open || this.isPermanent()) {
      this.input.focus();
    } else if (this.indicatorPill && !this.indicatorPill.hidden) {
      this.indicatorPill.focus();
    } else {
      this.params.focusGrid();
    }
  }

  // Show and focus the widget. In "always" mode this is a focus-only convenience.
  show(): void {
    this.setOpen(true);
    this.input.focus();
    this.input.select();
  }

  // Hide the widget. By default (`clearOnClose`) the search is cleared too, so a dismissed search
  // doesn't silently keep filtering. When `clearOnClose` is false the filter persists and a compact
  // indicator pill takes the widget's place (see `syncIndicator`).
  // No-op in "always" mode, where the widget is a permanent fixture: there we only clear the text.
  hide(): void {
    this.collapseOptions();
    if (this.isToolbarPresentation()) {
      this.params.focusGrid();
      return;
    }
    if (this.clearOnClose && this.input.value !== "") {
      this.input.value = "";
      this.clearBtn.hidden = true;
      this.commit(true);
    }
    if (this.opts.mode === "always") return;
    this.setOpen(false);
    this.params.focusGrid();
  }

  toggle(): void {
    if (this.open && !this.isPermanent()) this.hide();
    else this.show();
  }

  getElement(): HTMLElement {
    return this.wrapper;
  }

  destroy(): void {
    this.unsubscribeCore?.();
    this.unsubscribeCore = null;
    this.unsubscribePivot?.();
    this.unsubscribePivot = null;
    if (this.debounceTimer != null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.wrapper.remove();
  }

  private setOpen(open: boolean): void {
    this.open = open;
    if (open) {
      if (!this.isToolbarPresentation()) this.applyPosition();
      this.updateClearVisibility();
    } else {
      this.collapseOptions();
    }
    this.wrapper.classList.toggle("pte-quick-filter-open", open);
    // The collapsed pill (if any) is only shown while closed with an active persisted filter.
    this.syncIndicator();
    // aria-hidden must stay false whenever anything in the widget is visible (open, or the pill).
    const visible = open || !this.indicatorPill?.hidden;
    this.wrapper.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  // The floating host is a zero-height sibling immediately after the header, so `offsetTop` is
  // already relative to the header's bottom and needs no layout measurement.
  private applyPosition(): void {
    if (this.isToolbarPresentation()) return;
    const { offsetX, offsetTop } = this.opts.position;
    this.wrapper.style.top = `${offsetTop}px`;
    // Release the opposite edge with an explicit `auto` (not "") so the widget keeps its intrinsic
    // width. Clearing to "" would fall back to the stylesheet's base `right` rule, pinning *both*
    // edges and stretching the panel across the full width.
    if (this.anchor === "left") {
      this.wrapper.style.left = `${offsetX}px`;
      this.wrapper.style.right = "auto";
    } else {
      // Add the scrollbar gutter so the widget never sits over the vertical scrollbar thumb.
      this.wrapper.style.right = `calc(var(--pte-scrollbar-size, 10px) + ${offsetX}px)`;
      this.wrapper.style.left = "auto";
    }
  }

  private bind(): void {
    this.input.addEventListener("input", () => {
      this.updateClearVisibility();
      // Reflect "typing" immediately (the counter blanks while the box is empty); the real count
      // arrives with the debounced commit's quickFilterFindChanged.
      this.syncFindState(this.params.core.getFindState());
      this.commit(false);
    });
    // The input is a descendant of the grid root, so its keydowns bubble to the grid's root-level
    // handler — which would otherwise treat typed characters as edit-on-type / navigation / clipboard
    // shortcuts and steal focus into a cell editor. Stop propagation for every key so the search box
    // owns its own keyboard; Escape additionally clears + closes the widget.
    this.input.addEventListener("keydown", (e: KeyboardEvent) => {
      e.stopPropagation();
      // The input intentionally owns its keyboard events, so the root-level shortcut cannot
      // prevent the browser's native Find dialog while focus is here. Claim Ctrl/Cmd+F locally —
      // the same chord the root claims, matched the same way, so which one runs depends only on
      // where focus is and never on what the two matchers happen to accept.
      if (matchesChord(e, "mod+f")) {
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.hide();
        return;
      }
      // Enter walks the matches, the way a browser's find bar does — and Shift+Enter walks back.
      // While filtering there is nothing to walk (the rows already narrowed as the user typed), so
      // Enter is swallowed rather than doing something surprising.
      if (e.key === "Enter") {
        e.preventDefault();
        if (this.isFinding()) this.navigateFind(e.shiftKey ? "previous" : "next");
      }
    });
    this.clearBtn.addEventListener("click", () => {
      this.input.value = "";
      this.updateClearVisibility();
      this.commit(true);
      this.input.focus();
    });
    this.optionsBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleOptions();
    });
    this.closeBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
    });
  }

  // Show the clear ("×") button only when there's text to clear.
  private updateClearVisibility(): void {
    this.clearBtn.hidden = this.input.value === "";
  }

  // The options panel lives inside the widget container (below the search row) rather than in a
  // separate popover; clicking the options button expands the container to reveal it.
  private buildOptionsPanel(): void {
    this.optionsPanel = div("pte-quick-filter-options-panel");
    this.optionsPanel.hidden = true;

    // Behavior row — first, because it changes what the rows below mean.
    if (this.opts.showBehaviorToggle) this.buildBehaviorRow();

    // Match controls (match-mode + case sensitivity) — only when `showOptions` is on.
    if (this.opts.showOptions) {
      // Match mode row.
      const modeRow = div("pte-quick-filter-option-row");
      this.matchModeRow = modeRow;
      const modeLabel = document.createElement("label");
      modeLabel.className = "pte-quick-filter-option-label";
      modeLabel.textContent = "Match";
      this.matchModeSelect = document.createElement("select");
      this.matchModeSelect.className = "pte-select pte-quick-filter-option-select";
      for (const [value, text] of [["multiTerm", "All words"], ["substring", "Exact phrase"]] as const) {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = text;
        this.matchModeSelect.appendChild(o);
      }
      this.matchModeSelect.value = this.matchMode;
      this.matchModeSelect.addEventListener("change", () => {
        this.matchMode = this.matchModeSelect!.value as QuickFilterMatchMode;
        this.commit(true);
      });
      modeLabel.appendChild(this.matchModeSelect);
      modeRow.appendChild(modeLabel);

      // Case sensitivity row.
      const caseRow = div("pte-quick-filter-option-row");
      const caseLabel = document.createElement("label");
      caseLabel.className = "pte-quick-filter-option-label";
      this.caseCheckbox = document.createElement("input");
      this.caseCheckbox.type = "checkbox";
      this.caseCheckbox.checked = this.caseSensitive;
      this.caseCheckbox.addEventListener("change", () => {
        this.caseSensitive = this.caseCheckbox!.checked;
        this.commit(true);
      });
      caseLabel.appendChild(this.caseCheckbox);
      caseLabel.appendChild(document.createTextNode(" Match case"));
      caseRow.appendChild(caseLabel);

      if (this.opts.showBehaviorToggle) this.optionsPanel.appendChild(div("pte-quick-filter-option-sep"));
      this.optionsPanel.appendChild(modeRow);
      this.optionsPanel.appendChild(caseRow);
    }

    // Layout controls (anchor + keep-on-close) — only when `showLayoutOptions` is on.
    if (!this.isToolbarPresentation() && this.opts.showLayoutOptions) this.buildLayoutRows();

    this.wrapper.appendChild(this.optionsPanel);
  }

  /**
   * The filter-or-find switch. Changing it re-commits the current text under the new behavior, so
   * the same search immediately stops filtering and starts highlighting (or the reverse).
   */
  private buildBehaviorRow(): void {
    const row = div("pte-quick-filter-option-row");
    const label = document.createElement("label");
    label.className = "pte-quick-filter-option-label";
    label.textContent = "Search";
    this.behaviorSelect = document.createElement("select");
    this.behaviorSelect.className = "pte-select pte-quick-filter-option-select pte-quick-filter-behavior-select";
    for (const [value, text] of [["filter", "Filter rows"], ["find", "Highlight matches"]] as const) {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = text;
      this.behaviorSelect.appendChild(o);
    }
    this.behaviorSelect.value = this.behavior;
    this.behaviorSelect.addEventListener("change", () => {
      this.behavior = this.behaviorSelect!.value as QuickFilterBehavior;
      // Commit before syncing the UI: the affordances follow the behavior the CORE settled on.
      this.commit(true);
      this.syncBehaviorUI();
    });
    label.appendChild(this.behaviorSelect);
    row.appendChild(label);
    this.optionsPanel!.appendChild(row);
  }

  // Anchor (left/right) and keep-filter-on-close controls, appended to the options panel. Changing
  // the anchor re-places the widget immediately; the keep-on-close toggle mutates `clearOnClose`
  // (the checkbox is phrased positively as "Keep filter when closed", i.e. the inverse). The
  // keep-on-close row is omitted in "always" mode, where the widget never closes.
  private buildLayoutRows(): void {
    const panel = this.optionsPanel!;
    // A separator so the layout section reads as distinct from the match controls (when both shown).
    if (this.opts.showOptions) panel.appendChild(div("pte-quick-filter-option-sep"));

    // Anchor row.
    const anchorRow = div("pte-quick-filter-option-row");
    const anchorLabel = document.createElement("label");
    anchorLabel.className = "pte-quick-filter-option-label";
    anchorLabel.textContent = "Anchor";
    this.anchorSelect = document.createElement("select");
    this.anchorSelect.className = "pte-select pte-quick-filter-option-select pte-quick-filter-anchor-select";
    for (const [value, text] of [["right", "Right"], ["left", "Left"]] as const) {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = text;
      this.anchorSelect.appendChild(o);
    }
    this.anchorSelect.value = this.anchor;
    this.anchorSelect.addEventListener("change", () => {
      this.anchor = this.anchorSelect!.value as "left" | "right";
      this.applyPosition();
    });
    anchorLabel.appendChild(this.anchorSelect);
    anchorRow.appendChild(anchorLabel);
    panel.appendChild(anchorRow);

    if (this.opts.mode !== "always") {
      // Keep-on-close row.
      const keepRow = div("pte-quick-filter-option-row");
      const keepLabel = document.createElement("label");
      keepLabel.className = "pte-quick-filter-option-label";
      this.keepOpenCheckbox = document.createElement("input");
      this.keepOpenCheckbox.type = "checkbox";
      this.keepOpenCheckbox.className = "pte-quick-filter-keep-checkbox";
      this.keepOpenCheckbox.checked = !this.clearOnClose;
      this.keepOpenCheckbox.addEventListener("change", () => {
        this.clearOnClose = !this.keepOpenCheckbox!.checked;
      });
      keepLabel.appendChild(this.keepOpenCheckbox);
      keepLabel.appendChild(document.createTextNode(" Keep filter when closed"));
      keepRow.appendChild(keepLabel);
      panel.appendChild(keepRow);
    }
  }

  private toggleOptions(): void {
    if (this.optionsExpanded) this.collapseOptions();
    else this.expandOptions();
  }

  private expandOptions(): void {
    if (!this.optionsPanel || this.optionsExpanded) return;
    this.optionsPanel.hidden = false;
    this.optionsExpanded = true;
    this.wrapper.classList.add("pte-quick-filter-options-open");
    this.optionsBtn?.setAttribute("aria-expanded", "true");
  }

  private collapseOptions(): void {
    if (!this.optionsPanel || !this.optionsExpanded) return;
    this.optionsPanel.hidden = true;
    this.optionsExpanded = false;
    this.wrapper.classList.remove("pte-quick-filter-options-open");
    this.optionsBtn?.setAttribute("aria-expanded", "false");
  }

  // The collapsed pill: a single button (filter icon + current search text) that reopens the widget.
  // Built only when the filter can outlive a close (`clearOnClose === false`, non-"always" mode).
  private buildIndicatorPill(): void {
    this.indicatorPill = button("pte-quick-filter-pill");
    this.indicatorPill.type = "button";
    this.indicatorPill.hidden = true;
    this.indicatorPill.setAttribute("aria-label", "Active search — click to edit");
    const pillIcon = span(`pte-quick-filter-pill-icon ${getIconClassName("filter")}`);
    pillIcon.setAttribute("aria-hidden", "true");
    this.indicatorLabel = span("pte-quick-filter-pill-label");
    this.indicatorPill.appendChild(pillIcon);
    this.indicatorPill.appendChild(this.indicatorLabel);
    this.indicatorPill.addEventListener("click", (e) => {
      e.stopPropagation();
      this.show();
    });
    this.wrapper.appendChild(this.indicatorPill);
  }

  // Reflect the collapsed-with-active-filter state: show the pill (and keep the wrapper displayed)
  // only when the widget is closed and a persisted filter is active. A no-op unless a pill exists.
  private syncIndicator(): void {
    if (!this.indicatorPill || !this.indicatorLabel) return;
    const term = this.input.value.trim();
    const active = !this.open && term !== "";
    this.indicatorPill.hidden = !active;
    if (active) this.indicatorLabel.textContent = term;
    // Keep the wrapper positioned even while "closed" so the pill floats in the right place.
    if (active) this.applyPosition();
    this.wrapper.classList.toggle("pte-quick-filter-has-indicator", active);
  }

  /** Run a debounced commit now, if one is pending. */
  private flushPendingCommit(): void {
    if (this.debounceTimer == null) return;
    this.commit(true);
  }

  // Push the current search state into the core. `immediate` skips the debounce (used for clears and
  // option toggles, where the user expects an instant refilter).
  private commit(immediate: boolean): void {
    if (this.debounceTimer != null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const run = () => {
      this.debounceTimer = null;
      this.params.core.dispatch({
        type: "quickFilterSet",
        text: this.input.value,
        matchMode: this.matchMode,
        caseSensitive: this.caseSensitive,
        behavior: this.behavior,
      });
    };
    if (immediate || this.opts.debounceMs === 0) {
      run();
    } else {
      this.debounceTimer = window.setTimeout(run, this.opts.debounceMs);
    }
  }
}
