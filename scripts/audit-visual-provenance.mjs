// Offline integrity check. Changing an image requires reviewing its evidence;
// this script never guesses provenance or overwrites the manifest.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {visualAssetMatches} from './visual-asset-integrity.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/visual-provenance.json'), 'utf8'));
const walk = dir => fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry => entry.isDirectory()?walk(`${dir}/${entry.name}`):[`${dir}/${entry.name}`]);
const physicalFiles = ['src','public','assets'].flatMap(walk).filter(file=>/\.(svg|png|jpe?g|gif|webp|avif|ico)$/i.test(file)).sort();
const physicalRecords = manifest.assets.filter(asset=>asset.sha256);
if(JSON.stringify(physicalRecords.map(asset=>asset.path).sort())!==JSON.stringify(physicalFiles))throw new Error('Visual file inventory changed. Audit every new/removed path.');
const ids = new Set();
for(const asset of manifest.assets){
  if(ids.has(asset.assetId))throw new Error(`Duplicate asset ID: ${asset.assetId}`);
  ids.add(asset.assetId);
  if(asset.sha256&&!visualAssetMatches(fs.readFileSync(path.join(root,asset.path)),asset))throw new Error(`Changed visual needs evidence review: ${asset.path}`);
  if(asset.attributionRequired&&!asset.publicCredit)throw new Error(`Required attribution missing: ${asset.path}`);
  if(!asset.evidence?.length)throw new Error(`Evidence missing: ${asset.path}`);
}
const inline = [];
for(const file of walk('src').filter(file=>file.endsWith('.jsx')&&!file.includes('.test.'))){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const visit=node=>{
    if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='svg')inline.push({path:file,codeSha256:hash(source.slice(node.getStart(ast),node.end))});
    if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==='svg')inline.push({path:file,codeSha256:hash(source.slice(node.getStart(ast),node.end))});
    ts.forEachChild(node,visit);
  };
  visit(ast);
}
const key=asset=>`${asset.path}:${asset.codeSha256}`;
if(JSON.stringify(inline.map(key).sort())!==JSON.stringify(manifest.assets.filter(asset=>asset.codeSha256).map(key).sort()))throw new Error('Inline SVG inventory changed; review the renderer source.');
for(const [type,count] of Object.entries(manifest.counts))if(manifest.assets.filter(asset=>asset.provenanceType===type).length!==count)throw new Error(`Stale count: ${type}`);
console.log(`Verified ${physicalFiles.length} visual files and ${inline.length} inline SVG renderer blocks (${manifest.assets.length} records). No visual content changed; SVG checkout line endings are allowed.`);
