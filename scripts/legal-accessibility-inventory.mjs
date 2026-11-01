import ts from 'typescript';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const images=[],customClickTargets=[];
for(const file of readdirSync('src').filter(name=>name.endsWith('.jsx')&&!name.includes('.test.'))) {
 const source=ts.createSourceFile(file,readFileSync(`src/${file}`,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 const visit=node=>{
  if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) {
   const tag=node.tagName.getText(source),attributes=node.attributes.properties;
   const has=name=>attributes.some(attribute=>ts.isJsxAttribute(attribute)&&attribute.name.getText(source)===name);
   const line=source.getLineAndCharacterOfPosition(node.getStart()).line+1;
   if(['img','ExerciseIllustration'].includes(tag))images.push({file:`src/${file}`,line,tag,hasAlt:has('alt'),forwarded:attributes.some(ts.isJsxSpreadAttribute),alt:attributes.find(attribute=>ts.isJsxAttribute(attribute)&&attribute.name.getText(source)==='alt')?.initializer?.getText(source)||null});
   if(has('onClick')&&!['button','a','input','label','select','option','summary'].includes(tag))customClickTargets.push({file:`src/${file}`,line,tag,keyboardHandler:has('onKeyDown')||has('onKeyUp'),role:attributes.find(attribute=>ts.isJsxAttribute(attribute)&&attribute.name.getText(source)==='role')?.initializer?.getText(source)||null});
  }
  ts.forEachChild(node,visit);
 };
 visit(source);
}
const missing=images.filter(item=>!item.hasAlt&&!item.forwarded);
mkdirSync('artifacts/legal-privacy-audit',{recursive:true});writeFileSync('artifacts/legal-privacy-audit/accessibility-source-inventory.json',JSON.stringify({scope:'Top-level application JSX source inspection, not a screen-reader or full WCAG audit',images,missingExplicitAlt:missing,customClickTargets},null,2));
console.log(JSON.stringify({imageUsages:images.length,missingExplicitAlt:missing,customClickTargetsToConsider:customClickTargets.length},null,2));
