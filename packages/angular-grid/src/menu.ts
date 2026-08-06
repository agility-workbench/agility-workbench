import type { TemplateRef } from "@angular/core";
import type { MenuItem as GridMenuItem } from "@agility-workbench/grid";

/**
 * A menu-item slot in the Angular wrapper: a plain string, a ready-made element, or an
 * `ng-template` reference whose content is stamped out for the lifetime of the open menu.
 */
export type NgMenuSlot = string | HTMLElement | TemplateRef<unknown> | null | false | undefined;

export interface NgMenuItem extends Omit<GridMenuItem, "left" | "right" | "subMenu"> {
  left?: NgMenuSlot;
  right?: NgMenuSlot;
  subMenu?: NgMenuItem[];
}
