export function isTrue(val: any): boolean {
  return val === true || val === "true" || val === 1 || val === "1";
}

export function isFalse(val: any): boolean {
  return val === false || val === "false" || val === 0 || val === "0";
}
