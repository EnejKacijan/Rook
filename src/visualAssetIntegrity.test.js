// @vitest-environment node
import {it, expect} from 'vitest';
import {visualAssetHash, canonicalSvgHash, visualAssetMatches} from '../scripts/visual-asset-integrity.mjs';

it('accepts an evidenced SVG with either Git checkout line ending', () => {
  const source = Buffer.from('<svg>\r\n<path d="M1 2L3 4"/>\r\n</svg>\r\n');
  const linux = Buffer.from(source.toString().replaceAll('\r\n', '\n'));
  const record = {path:'illustration.svg', sha256:visualAssetHash(source), canonicalSha256:canonicalSvgHash(source)};
  expect(visualAssetMatches(source, record)).toBe(true);
  expect(visualAssetMatches(linux, record)).toBe(true);
});
it('still rejects changed SVG geometry, color and other whitespace', () => {
  const source = Buffer.from('<svg>\r\n<path fill="green" d="M1 2L3 4"/>\r\n</svg>\r\n');
  const record = {path:'illustration.svg', sha256:visualAssetHash(source), canonicalSha256:canonicalSvgHash(source)};
  for (const [before, after] of [['L3 4','L3 5'],['green','blue'],['<path','  <path']])
    expect(visualAssetMatches(Buffer.from(source.toString().replace(before, after)), record)).toBe(false);
});
it('keeps raster asset verification byte-exact', () => {
  const bytes=Buffer.from([137,80,78,71,13,10,26,10]);
  const record={path:'icon.png',sha256:visualAssetHash(bytes),canonicalSha256:canonicalSvgHash(bytes)};
  expect(visualAssetMatches(bytes,record)).toBe(true);
  expect(visualAssetMatches(Buffer.from(bytes.toString().replaceAll('\r\n','\n')),record)).toBe(false);
});
