export interface MenuItem {
  id?: string;
  label?: string;
  disabled?: boolean;
  onClick?: () => void;
  subMenu?: MenuItem[];
  left?: string;
  right?: string;
  isSeparator?: boolean;
  extra?: any;
}
