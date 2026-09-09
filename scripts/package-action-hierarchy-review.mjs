import {mkdir,readdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
const root='artifacts/action-hierarchy-review';
const matrix=/^(?:390-(?:standard|premium)-(?:light|dark)|320-standard-dark|430-premium-light)-/;
const groups=[
 ['01-core','artifacts/action-hierarchy',n=>matrix.test(n)&&n.endsWith('.png')],
 ['02-conflicts','artifacts/edit-plan-opening',n=>matrix.test(n)&&n.endsWith('-today.png')],
 ['03-adjust','artifacts/adjust-today',n=>/^12-review-.*\.png$/.test(n)],
 ['04-week','artifacts/flexible-week',n=>matrix.test(n)&&/-0[25]-(menu|review)\.png$/.test(n)],
 ['05-next-block','artifacts/block-review',n=>matrix.test(n)&&n.endsWith('-04-next-review.png')],
];
for(const [group,source,keep]of groups){const dest=path.join(root,group);await mkdir(dest,{recursive:true});let n=0;for(const file of await readdir(source))if(keep(file)){await copyFile(path.join(source,file),path.join(dest,file));n++;}console.log(group,n);}
