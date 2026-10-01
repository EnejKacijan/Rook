import { Inflate } from 'fflate';

export const BACKUP_ARCHIVE_LIMITS = Object.freeze({ compressed: 100 * 1024 * 1024, expanded: 256 * 1024 * 1024, entry: 64 * 1024 * 1024, entries: 2048 });
export class ArchiveError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const invalid = () => { throw new ArchiveError('wrong-file-type', 'This file is not a valid supported ZIP archive.'); };
const limit = () => { throw new ArchiveError('archive-limit', 'This archive exceeds the safe local import size or file-count limit. Your current data was not changed.'); };
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

// Read all central-directory limits before any decompression. Then measure the
// actual streamed output too: advertised originalSize alone is not a budget.
export function decodeBoundedZip(bytes, limits = BACKUP_ARCHIVE_LIMITS) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > limits.compressed) limit();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = offset => offset >= 0 && offset + 2 <= bytes.length ? view.getUint16(offset, true) : invalid();
  const u32 = offset => offset >= 0 && offset + 4 <= bytes.length ? view.getUint32(offset, true) : invalid();
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557) && u32(end) !== 0x06054b50; end--);
  if (end < 0 || u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length || u16(end + 4) || u16(end + 6)) invalid();
  const count = u16(end + 10), centralSize = u32(end + 12), centralOffset = u32(end + 16);
  if (count !== u16(end + 8) || count === 65535 || centralSize === 0xffffffff || centralOffset === 0xffffffff) invalid();
  if (count > limits.entries) limit();
  if (centralOffset + centralSize !== end) invalid();
  const rows = [], names = new Set(), ranges = []; let offset = centralOffset, advertised = 0;
  for (let i = 0; i < count; i++) {
    if (u32(offset) !== 0x02014b50) invalid();
    const flags = u16(offset + 8), method = u16(offset + 10), crc = u32(offset + 16), size = u32(offset + 20), original = u32(offset + 24);
    const nameSize = u16(offset + 28), extraSize = u16(offset + 30), commentSize = u16(offset + 32), start = u32(offset + 42);
    const next = offset + 46 + nameSize + extraSize + commentSize;
    if (next > end || nameSize > 512 || !nameSize || u16(offset + 34) || flags & 1 || ![0, 8].includes(method) || [size, original, start].includes(0xffffffff)) invalid();
    let name;
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + nameSize)); } catch { invalid(); }
    if (name.includes('\\') || name.includes('\0') || name.startsWith('/') || name.includes(':') || name.split('/').some(part => part === '..' || part === '.') || names.has(name)) invalid();
    names.add(name); advertised += original;
    if (original > limits.entry || advertised > limits.expanded || size > limits.compressed) limit();
    if (start >= centralOffset || u32(start) !== 0x04034b50 || u16(start + 6) !== flags || u16(start + 8) !== method) invalid();
    const localNameSize = u16(start + 26), begin = start + 30 + localNameSize + u16(start + 28);
    if (begin + size > centralOffset || localNameSize !== nameSize || !bytes.subarray(start + 30, start + 30 + nameSize).every((value, n) => value === bytes[offset + 46 + n])) invalid();
    if (!(flags & 8) && (u32(start + 14) !== crc || u32(start + 18) !== size || u32(start + 22) !== original)) invalid();
    ranges.push([start, begin + size]); rows.push({ name, method, crc, original, begin, size }); offset = next;
  }
  if (offset !== end) invalid();
  ranges.sort((a, b) => a[0] - b[0]);
  if (ranges.some((range, i) => i && range[0] < ranges[i - 1][1])) invalid();
  let total = 0; const entries = Object.create(null);
  for (const row of rows) {
    const chunks = []; let actual = 0, crc = 0xffffffff;
    const accept = chunk => {
      actual += chunk.length; total += chunk.length;
      if (actual > limits.entry || total > limits.expanded) limit();
      if (actual > row.original) invalid();
      for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
      chunks.push(chunk);
    };
    const compressed = bytes.subarray(row.begin, row.begin + row.size);
    if (row.method === 0) accept(compressed);
    else {
      const inflate = new Inflate(accept);
      // Small compressed chunks bound the transient inflate buffer even if the
      // archive lies about the output size. Runs inside a dedicated Worker.
      if (!compressed.length) invalid();
      for (let at = 0; at < compressed.length; at += 512) inflate.push(compressed.subarray(at, at + 512), at + 512 >= compressed.length);
    }
    if (actual !== row.original || ((crc ^ 0xffffffff) >>> 0) !== row.crc) invalid();
    const output = new Uint8Array(actual); let written = 0;
    for (const chunk of chunks) { output.set(chunk, written); written += chunk.length; }
    entries[row.name] = output;
  }
  return entries;
}

export async function readBoundedArchive(source, { limits = BACKUP_ARCHIVE_LIMITS, workerFactory = null } = {}) {
  const sourceSize = source instanceof Uint8Array ? source.byteLength : source?.size;
  if (Number.isFinite(sourceSize) && sourceSize > limits.compressed) limit();
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(await source.arrayBuffer());
  if (bytes.byteLength > limits.compressed) limit();
  const factory = workerFactory || (typeof Worker === 'function' ? () => new Worker(new URL('./backupArchive.worker.js', import.meta.url), { type: 'module' }) : null);
  // XLSX imports already execute inside the historical-import worker.
  if (!workerFactory && typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) return decodeBoundedZip(bytes, limits);
  // Node-only fallback for tools/tests, with identical streaming budgets.
  if (!factory && typeof process !== 'undefined' && process.versions?.node) return decodeBoundedZip(bytes, limits);
  if (!factory) throw new ArchiveError('unsupported-browser', 'This browser cannot safely read backup archives. Use an updated browser.');
  return new Promise((resolve, reject) => {
    let worker;
    const finish = (error, entries) => { clearTimeout(timer); worker?.terminate(); error ? reject(error) : resolve(entries); };
    const timer = setTimeout(() => finish(new ArchiveError('archive-limit', 'Archive reading exceeded the safety time limit. Your current data was not changed.')), 30000);
    try {
      worker = factory();
      worker.onmessage = ({ data }) => data.error ? finish(new ArchiveError(data.error.code, data.error.message)) : finish(null, data.entries);
      worker.onerror = () => finish(new ArchiveError('wrong-file-type', 'This archive could not be read safely.'));
      const copy = bytes.slice(); worker.postMessage({ bytes: copy, limits }, [copy.buffer]);
    } catch (error) { finish(error); }
  });
}
