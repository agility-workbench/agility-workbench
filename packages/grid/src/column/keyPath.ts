/**
 * Dot-path column keys. A `key` such as `"address.city"` reads and writes the nested value
 * `data.address.city` when the row has no literal `"address.city"` property; a literal property of
 * that exact name always wins, so a key that happens to contain a dot keeps working as before.
 */

function isLiteral(data: any, key: string): boolean {
  return data != null && typeof data === "object" && key in data;
}

/** Read `key` from a row's data: the literal property when present, else the dot path. */
export function readKeyPath(data: any, key: string): any {
  if (data == null) return undefined;
  if (!key.includes(".") || isLiteral(data, key)) return data[key];
  let cur: any = data;
  for (const part of key.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Write `value` at `key` in a row's data: the literal property when present (or when the key has no
 * dot), else the dot path, creating missing (null/undefined) intermediate objects along the way.
 * Returns false, writing nothing, when an intermediate step holds a primitive that cannot carry the
 * nested value.
 */
export function writeKeyPath(data: any, key: string, value: unknown): boolean {
  if (data == null) return false;
  if (!key.includes(".") || isLiteral(data, key)) {
    data[key] = value;
    return true;
  }
  const parts = key.split(".");
  let cur: any = data;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    else if (typeof cur[parts[i]] !== "object") return false;
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return true;
}
