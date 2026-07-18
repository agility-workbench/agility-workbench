/**
 * XML + value helpers for the hand-rolled .xlsx writer.
 */

/** Escape a string for use in XML text content or a double-quoted attribute value. */
export function escapeXml(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    switch (ch) {
      case "&":
        out += "&amp;";
        break;
      case "<":
        out += "&lt;";
        break;
      case ">":
        out += "&gt;";
        break;
      case '"':
        out += "&quot;";
        break;
      case "'":
        out += "&apos;";
        break;
      default: {
        // Strip control chars that are illegal in XML 1.0 (except tab, LF, CR).
        const code = value.charCodeAt(i);
        if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
          break;
        }
        out += ch;
      }
    }
  }
  return out;
}

/**
 * Convert a column index (1-based) to an Excel column name: 1 -> A, 27 -> AA.
 */
export function columnName(index: number): string {
  let n = index;
  let name = "";
  while (n > 0) {
    n--;
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26);
  }
  return name || "A";
}

/** A1-style cell reference from 1-based column and row indices. */
export function cellRef(col: number, row: number): string {
  return `${columnName(col)}${row}`;
}

/**
 * Convert a JS Date to an Excel serial date number (days since 1899-12-30).
 *
 * Excel's epoch is nominally 1900-01-01 = 1, but it incorrectly treats 1900 as a leap year, so the
 * conventional base used to line the arithmetic up is 1899-12-30. Time-of-day becomes the
 * fractional part. Uses UTC components so the serial is independent of the host timezone.
 */
export function dateToSerial(date: Date): number {
  const utcMs = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
  const epoch = Date.UTC(1899, 11, 30); // 1899-12-30
  const dayMs = 24 * 60 * 60 * 1000;
  return (utcMs - epoch) / dayMs;
}
