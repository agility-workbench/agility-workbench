/**
 * Minimal ZIP writer for the .xlsx container.
 *
 * An .xlsx file is a ZIP archive of XML parts (OOXML / SpreadsheetML). This writer emits a valid
 * ZIP, deflating each entry via the platform `CompressionStream('deflate-raw')` (method 8) when it
 * shrinks the data, and falling back to STORE (method 0) otherwise — so an entry is never stored
 * larger than its raw bytes, and the writer works even where CompressionStream is unavailable.
 *
 * References: PKWARE APPNOTE (ZIP format), ECMA-376 (OOXML packaging).
 */

// Precomputed CRC-32 table (IEEE 802.3 polynomial, reversed: 0xEDB88320).
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const textEncoder = new TextEncoder();

export interface ZipEntry {
  /** Path within the archive, forward-slash separated (e.g. "xl/worksheets/sheet1.xml"). */
  path: string;
  /** File contents. Strings are UTF-8 encoded. */
  data: string | Uint8Array;
}

interface PreparedEntry {
  nameBytes: Uint8Array;
  /** Bytes actually written to the archive (deflated or raw). */
  stored: Uint8Array;
  /** Original uncompressed length. */
  rawSize: number;
  /** Compression method: 0 = STORE, 8 = DEFLATE. */
  method: number;
  crc: number;
  offset: number;
}

/**
 * Raw-DEFLATE `bytes` using the platform CompressionStream. Returns null if compression is
 * unavailable or doesn't shrink the data, signalling the caller to fall back to STORE.
 */
async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  const CS = (globalThis as any).CompressionStream;
  if (typeof CS !== "function") return null;
  try {
    const stream = new CS("deflate-raw");
    const writer = stream.writable.getWriter();
    // Copy into a plain ArrayBuffer-backed view so we never hand a SharedArrayBuffer to the stream.
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    void writer.write(copy);
    void writer.close();
    const compressed = new Uint8Array(await new Response(stream.readable).arrayBuffer());
    if (compressed.length >= bytes.length) return null; // no gain — prefer STORE
    return compressed;
  } catch {
    return null;
  }
}

/** DOS date/time for zip headers. A fixed timestamp keeps output deterministic (testable). */
const DOS_TIME = 0; // 00:00:00
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1; // 2020-01-01

function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}

function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/**
 * Build a ZIP archive from the given entries and return the bytes. Each entry is DEFLATE-compressed
 * when that shrinks it, else STORE'd. Async because platform DEFLATE is stream-based.
 */
export async function createZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const prepared: PreparedEntry[] = await Promise.all(
    entries.map(async entry => {
      const data = typeof entry.data === "string" ? textEncoder.encode(entry.data) : entry.data;
      const deflated = await deflateRaw(data);
      return {
        nameBytes: textEncoder.encode(entry.path),
        stored: deflated ?? data,
        rawSize: data.length,
        method: deflated ? 8 : 0,
        crc: crc32(data), // CRC is always over the uncompressed data
        offset: 0,
      };
    }),
  );

  const LOCAL_HEADER = 30;
  const CENTRAL_HEADER = 46;
  const END_RECORD = 22;

  let localSize = 0;
  let centralSize = 0;
  for (const e of prepared) {
    localSize += LOCAL_HEADER + e.nameBytes.length + e.stored.length;
    centralSize += CENTRAL_HEADER + e.nameBytes.length;
  }

  const total = localSize + centralSize + END_RECORD;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let pos = 0;

  // Local file headers + file data.
  for (const e of prepared) {
    e.offset = pos;
    u32(view, pos, 0x04034b50); // local file header signature
    u16(view, pos + 4, 20); // version needed to extract (2.0)
    u16(view, pos + 6, 0); // general purpose bit flag
    u16(view, pos + 8, e.method); // compression method: 0 = STORE, 8 = DEFLATE
    u16(view, pos + 10, DOS_TIME);
    u16(view, pos + 12, DOS_DATE);
    u32(view, pos + 14, e.crc);
    u32(view, pos + 18, e.stored.length); // compressed size
    u32(view, pos + 22, e.rawSize); // uncompressed size
    u16(view, pos + 26, e.nameBytes.length);
    u16(view, pos + 28, 0); // extra field length
    pos += LOCAL_HEADER;
    out.set(e.nameBytes, pos);
    pos += e.nameBytes.length;
    out.set(e.stored, pos);
    pos += e.stored.length;
  }

  // Central directory.
  const centralStart = pos;
  for (const e of prepared) {
    u32(view, pos, 0x02014b50); // central directory header signature
    u16(view, pos + 4, 20); // version made by
    u16(view, pos + 6, 20); // version needed to extract
    u16(view, pos + 8, 0); // general purpose bit flag
    u16(view, pos + 10, e.method); // compression method
    u16(view, pos + 12, DOS_TIME);
    u16(view, pos + 14, DOS_DATE);
    u32(view, pos + 16, e.crc);
    u32(view, pos + 20, e.stored.length); // compressed size
    u32(view, pos + 24, e.rawSize); // uncompressed size
    u16(view, pos + 28, e.nameBytes.length);
    u16(view, pos + 30, 0); // extra field length
    u16(view, pos + 32, 0); // file comment length
    u16(view, pos + 34, 0); // disk number start
    u16(view, pos + 36, 0); // internal file attributes
    u32(view, pos + 38, 0); // external file attributes
    u32(view, pos + 42, e.offset); // relative offset of local header
    pos += CENTRAL_HEADER;
    out.set(e.nameBytes, pos);
    pos += e.nameBytes.length;
  }

  // End of central directory record.
  u32(view, pos, 0x06054b50); // end of central dir signature
  u16(view, pos + 4, 0); // number of this disk
  u16(view, pos + 6, 0); // disk where central directory starts
  u16(view, pos + 8, prepared.length); // number of central dir records on this disk
  u16(view, pos + 10, prepared.length); // total number of central dir records
  u32(view, pos + 12, centralSize); // size of central directory
  u32(view, pos + 16, centralStart); // offset of start of central directory
  u16(view, pos + 20, 0); // comment length

  return out;
}
