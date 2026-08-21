export function isTrue(val: any): boolean {
  return val === true || val === "true" || val === 1 || val === "1";
}

export function isFalse(val: any): boolean {
  return val === false || val === "false" || val === 0 || val === "0";
}

export function isNullOrUndefined(val: any): boolean {
  return val === null || val === undefined;
}

/**
 * The grid's definition of a blank cell value: null, undefined, or the empty string. Deliberately
 * NOT `0` or `false`, which are values a user chose. Grouping ("(Blanks)" buckets), the set filter's
 * blanks row, and the isBlank/isNotBlank operators all answer the question this way, so it lives in
 * one place rather than being re-inlined per call site.
 */
export function isBlankValue(val: any): boolean {
  return val === null || val === undefined || val === "";
}

/**
 * The grid's "did this cell value change?" rule: SameValueZero (the semantics `Map`, `Set`, and
 * `Array.includes` use — `NaN` equals `NaN`, `+0` equals `-0`), plus `Date`s compared by instant
 * (two invalid dates are the same). Everything else compares by reference — structural equality
 * for objects belongs to the application. Used to suppress no-op cell writes; exported so
 * applications can apply the same rule in `onCellValueChanged`.
 */
export function valuesAreSame(a: unknown, b: unknown): boolean {
  if (a === b) return true;              // covers +0/-0 as equal
  if (a !== a && b !== b) return true;   // both NaN
  if (a instanceof Date && b instanceof Date) {
    const av = a.valueOf(), bv = b.valueOf();
    return av === bv || (av !== av && bv !== bv);  // equal instants, or both invalid
  }
  return false;
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
