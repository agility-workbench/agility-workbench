import { IGridCore } from "../../interfaces/iGridCore";
import { getIconClassName } from "../../theme/icons";
import {
  QuickFilterMatchMode,
  ResolvedQuickFilterOptions,
  resolveQuickFilterOptions,
} from "../../interfaces/gridOptions";
import { button, div, span } from "../element";

interface QuickFilterWidgetParams {
  core: IGridCore;
  root: HTMLElement;
  // Pixel offset from the top of the root at which the widget floats (so it sits just below the
  // header). Read lazily on each show so header height changes (e.g. grouped headers) are respected.
  topOffset: () => number;
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
  private matchModeSelect?: HTMLSelectElement;
  private caseCheckbox?: HTMLInputElement;

  private readonly opts: ResolvedQuickFilterOptions;
  // Sticky per-session option state (seeded from the resolved config; user edits mutate it).
  private matchMode: QuickFilterMatchMode;
  private caseSensitive: boolean;

  private debounceTimer: number | null = null;
  private open = false;
  private optionsExpanded = false;

  constructor(private params: QuickFilterWidgetParams) {
    this.opts = resolveQuickFilterOptions(params.core.getOptions().quickFilter);
    this.matchMode = this.opts.matchMode;
    this.caseSensitive = this.opts.caseSensitive;

    // The widget is a vertical stack: a search row, and (when expanded) an options panel below it,
    // all inside one bordered container that grows in height to reveal the options.
    this.wrapper = div("pte-quick-filter");
    this.wrapper.setAttribute("role", "search");

    this.searchRow = div("pte-quick-filter-row");

    const searchIcon = span(`pte-quick-filter-icon ${getIconClassName("filter")}`);
    searchIcon.setAttribute("aria-hidden", "true");

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "pte-quick-filter-input";
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

    if (this.opts.showOptions) {
      // The button's own background is used for the hover highlight, so the icon lives in a child
      // span (its own mask + fill) — otherwise the hover background would overwrite the icon fill.
      this.optionsBtn = button("pte-quick-filter-btn pte-quick-filter-options");
      this.optionsBtn.type = "button";
      this.optionsBtn.setAttribute("aria-label", "Search options");
      this.optionsBtn.setAttribute("aria-haspopup", "true");
      this.optionsBtn.setAttribute("aria-expanded", "false");
      const optionsIcon = span(`pte-quick-filter-options-icon ${getIconClassName("menu")}`);
      optionsIcon.setAttribute("aria-hidden", "true");
      this.optionsBtn.appendChild(optionsIcon);
      this.searchRow.appendChild(this.optionsBtn);
    }

    // A dedicated close button, so dismissing doesn't require pressing Esc. In "always" mode the
    // widget is a permanent fixture with nothing to close, so it's omitted there.
    if (this.opts.mode !== "always") {
      this.closeBtn = button("pte-quick-filter-btn pte-quick-filter-close");
      this.closeBtn.type = "button";
      this.closeBtn.setAttribute("aria-label", "Close search");
      this.closeBtn.title = "Close (Esc)";
      this.closeBtn.textContent = "✕";
      this.searchRow.appendChild(this.closeBtn);
    }

    this.wrapper.appendChild(this.searchRow);
    if (this.opts.showOptions) this.buildOptionsPanel();

    this.bind();
    this.params.root.appendChild(this.wrapper);

    // "always" mode keeps the widget pinned open; otherwise it starts hidden until summoned.
    this.setOpen(this.opts.mode === "always");
  }

  isEnabled(): boolean {
    return this.opts.enabled;
  }

  isOpen(): boolean {
    return this.open;
  }

  // Show and focus the widget. In "always" mode this is a focus-only convenience.
  show(): void {
    this.setOpen(true);
    this.input.focus();
    this.input.select();
  }

  // Hide the widget and clear the search (so a dismissed search doesn't silently keep filtering).
  // No-op in "always" mode, where the widget is a permanent fixture: there we only clear the text.
  hide(): void {
    this.collapseOptions();
    if (this.input.value !== "") {
      this.input.value = "";
      this.clearBtn.hidden = true;
      this.commit(true);
    }
    if (this.opts.mode === "always") return;
    this.setOpen(false);
  }

  toggle(): void {
    if (this.open && this.opts.mode !== "always") this.hide();
    else this.show();
  }

  getElement(): HTMLElement {
    return this.wrapper;
  }

  destroy(): void {
    if (this.debounceTimer != null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.wrapper.remove();
  }

  private setOpen(open: boolean): void {
    this.open = open;
    if (open) {
      // Anchor just below the header on each open so grouped-header height changes are respected.
      this.wrapper.style.top = `${this.params.topOffset()}px`;
    } else {
      this.collapseOptions();
    }
    this.wrapper.classList.toggle("pte-quick-filter-open", open);
    this.wrapper.setAttribute("aria-hidden", open ? "false" : "true");
  }

  private bind(): void {
    this.input.addEventListener("input", () => {
      this.updateClearVisibility();
      this.commit(false);
    });
    // The input is a descendant of the grid root, so its keydowns bubble to the grid's root-level
    // handler — which would otherwise treat typed characters as edit-on-type / navigation / clipboard
    // shortcuts and steal focus into a cell editor. Stop propagation for every key so the search box
    // owns its own keyboard; Escape additionally clears + closes the widget.
    this.input.addEventListener("keydown", (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        this.hide();
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

    // Match mode row.
    const modeRow = div("pte-quick-filter-option-row");
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

    this.optionsPanel.appendChild(modeRow);
    this.optionsPanel.appendChild(caseRow);
    this.wrapper.appendChild(this.optionsPanel);
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
      });
    };
    if (immediate || this.opts.debounceMs === 0) {
      run();
    } else {
      this.debounceTimer = window.setTimeout(run, this.opts.debounceMs);
    }
  }
}
