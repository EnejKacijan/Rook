import { expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { decodeBoundedZip, readBoundedArchive } from './boundedZip.js';
const limits = { compressed: 200000, expanded: 4096, entry: 2048, entries: 4 };
it('checks compressed source size before reading the entire file', async () => {
  const source = { size: limits.compressed + 1, arrayBuffer: vi.fn() };
  await expect(readBoundedArchive(source, { limits })).rejects.toMatchObject({ code: 'archive-limit' });
  expect(source.arrayBuffer).not.toHaveBeenCalled();
});
it('rejects ZIP bombs, aggregate expansion and excessive entry counts before inflation', () => {
  expect(() => decodeBoundedZip(zipSync({ 'bomb': new Uint8Array(16 * 1024 * 1024) }), limits)).toThrow(/safety|safe/);
  expect(() => decodeBoundedZip(zipSync({ a: new Uint8Array(2000), b: new Uint8Array(2000), c: new Uint8Array(2000) }), limits)).toThrow();
  expect(() => decodeBoundedZip(zipSync(Object.fromEntries(Array.from({ length: 5 }, (_, i) => [String(i), new Uint8Array(1)]))), limits)).toThrow();
});
it('rejects forged original-size metadata using actual streamed output', () => {
  const bytes = zipSync({ 'bomb': new Uint8Array(1000000) });
  const view = new DataView(bytes.buffer);
  for (let at = 0; at + 46 <= bytes.length; at++) {
    if (view.getUint32(at, true) === 0x04034b50) view.setUint32(at + 22, 1, true);
    if (view.getUint32(at, true) === 0x02014b50) view.setUint32(at + 24, 1, true);
  }
  expect(() => decodeBoundedZip(bytes, limits)).toThrow();
});
it.each(['../escape', '/absolute', 'photos/../escape', 'bad\\path'])('rejects unsafe paths %s', path => {
  expect(() => decodeBoundedZip(zipSync({ [path]: strToU8('x') }), limits)).toThrow();
});
it('rejects CRC mismatch and safely handles prototype-like entry names', () => {
  const bytes = zipSync({ good: strToU8('hello') }, { level: 0 });
  bytes[34] ^= 1; expect(() => decodeBoundedZip(bytes, limits)).toThrow();
  const prototypeZip = zipSync({ 'safe-name': strToU8('safe') });
  for (let at = 0; at + 9 <= prototypeZip.length; at++) {
    if (new TextDecoder().decode(prototypeZip.subarray(at, at + 9)) === 'safe-name') prototypeZip.set(strToU8('__proto__'), at);
  }
  const safe = decodeBoundedZip(prototypeZip, limits);
  expect(Object.getPrototypeOf(safe)).toBeNull(); expect(Array.from(safe['__proto__'])).toEqual(Array.from(strToU8('safe')));
});
it('terminates the worker on success or validation failure', async () => {
  const make = error => ({ terminate: vi.fn(), postMessage() { queueMicrotask(() => this.onmessage({ data: error ? { error: { code:'archive-limit', message:'Limit' } } : { entries: { good: strToU8('hello') } } })); } });
  const good = make(false);
  expect((await readBoundedArchive(new Uint8Array(1), { limits, workerFactory: () => good })).good).toEqual(strToU8('hello'));
  expect(good.terminate).toHaveBeenCalledOnce();
  const bad = make(true); await expect(readBoundedArchive(new Uint8Array(1), { limits, workerFactory: () => bad })).rejects.toMatchObject({ code:'archive-limit' });
  expect(bad.terminate).toHaveBeenCalledOnce();
});
