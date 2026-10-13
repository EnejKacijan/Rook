// @vitest-environment node
import {it,expect} from 'vitest';
import {visualAssetHash,inlineVisualInventoryMatches} from '../scripts/visual-asset-integrity.mjs';
const code='<svg>\n<path d="M0 0L10 10" stroke="currentColor" />\n</svg>';
const record={path:'src/Icon.jsx',codeSha256:visualAssetHash(code)};
const actual=source=>({path:record.path,codeSha256:visualAssetHash(source),lfCodeSha256:visualAssetHash(source.replaceAll('\r\n','\n'))});
it('accepts only the exact inline evidence or Git CRLF checkout translation',()=>{
 expect(inlineVisualInventoryMatches([actual(code)],[record])).toBe(true);
 expect(inlineVisualInventoryMatches([actual(code.replaceAll('\n','\r\n'))],[record])).toBe(true);
});
it.each([code.replace('L10 10','L20 20'),code.replace('currentColor','red'),code.replace('<path','<path ')])('changed geometry/color/other whitespace still needs evidence review',changed=>{
 expect(inlineVisualInventoryMatches([actual(changed)],[record])).toBe(false);
});
it('missing/new paths and duplicated inline renderers cannot pass inventory checks',()=>{
 expect(inlineVisualInventoryMatches([],[record])).toBe(false);
 expect(inlineVisualInventoryMatches([{...actual(code),path:'src/New.jsx'}],[record])).toBe(false);
 expect(inlineVisualInventoryMatches([actual(code),actual(code)],[record])).toBe(false);
});
