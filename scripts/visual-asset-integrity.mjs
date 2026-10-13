import crypto from 'node:crypto';

export const visualAssetHash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const canonicalSvgHash = bytes => visualAssetHash(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n')));

// Retain original evidence hashes. Git's text checkout may translate CRLF/LF;
// only that exact SVG-text equivalence is accepted, never other whitespace,
// geometry, colors or metadata changes. Raster assets remain byte-exact.
export function visualAssetMatches(bytes, record) {
  return visualAssetHash(bytes) === record.sha256 ||
    /\.svg$/i.test(record.path) && Boolean(record.canonicalSha256) && canonicalSvgHash(bytes) === record.canonicalSha256;
}

export function inlineVisualInventoryMatches(actual, expected) {
  const key=asset=>`${asset.path}:${asset.codeSha256}`;
  const expectedKeys=expected.map(key).sort();
  const actualKeys=actual.map(asset=>expectedKeys.includes(key(asset))
    ? key(asset) : `${asset.path}:${asset.lfCodeSha256}`).sort();
  return JSON.stringify(actualKeys)===JSON.stringify(expectedKeys);
}
