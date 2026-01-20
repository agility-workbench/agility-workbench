export function isTrue(val: any): boolean {
  return val === true || val === "true" || val === 1 || val === "1";
}

export function isFalse(val: any): boolean {
  return val === false || val === "false" || val === 0 || val === "0";
}

export function isNullOrUndefined(val: any): boolean {
  return val === null || val === undefined;
}

// If the pageSizes is boolean, return defPageSizes.
// If pageSizes is an array, convert all the elements to numbers if required and
// return a sorted array. If it is empty, return defPageSizes
export function validatePageSizes(pageSizes: number[] | boolean, defPageSizes: number[]): number[] {
  if (isTrue(pageSizes) || isFalse(pageSizes)) return defPageSizes;
  if (!Array.isArray(pageSizes)) return defPageSizes;

  const normalized = pageSizes
    .map(p => typeof p === "number" ? p : Number(p))
    .filter(p => Number.isFinite(p) && p > 0);

  if (normalized.length === 0) return defPageSizes;

  normalized.sort((a, b) => a - b);
  return normalized;
}
