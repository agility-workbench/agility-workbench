export interface MenuItem {
  // identity
  id?: string;

  // rendering
  label?: string;
  left?: string | HTMLElement;
  right?: string | HTMLElement;

  // behavior
  disabled?: boolean;

  // For default items
  command?: string;
  payload?: any;

  // For app-provided items
  onClick?: () => void;

  // hierarchy
  subMenu?: MenuItem[];

  // structure
  isSeparator?: boolean;

  // extension points
  extra?: any; // app-specific data
}
