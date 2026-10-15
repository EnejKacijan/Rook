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
  if(actual.length!==expected.length)return false;
  // Evidence may have been captured on either platform. Match only exact
  // newline variants, consuming one record per renderer to retain multiplicity.
  const remaining=new Map();
  for(const asset of expected){const key=`${asset.path}:${asset.codeSha256}`;remaining.set(key,(remaining.get(key)||0)+1);}
  for(const asset of actual){
    const key=[...new Set([asset.codeSha256,asset.lfCodeSha256,asset.crlfCodeSha256].filter(Boolean))]
      .map(hash=>`${asset.path}:${hash}`).find(key=>remaining.get(key)>0);
    if(!key)return false;
    remaining.set(key,remaining.get(key)-1);
  }
  return true;
}
