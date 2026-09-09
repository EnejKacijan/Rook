import {mkdir,readdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
const root='artifacts/sheet-footer-review';
const groups=[
 ['01-edit-plan','artifacts/sheet-action-footer',/\.png$/],
 ['02-history','artifacts/history-correction',/^(320|390|430)-(standard|premium)-(light|dark)-0[2345]-.*\.png$/],
 ['03-next-block','artifacts/block-review',/^(320|390|430)-(standard|premium)-(light|dark)-(04-next-review|07-long-review-bottom)\.png$/],
 ['04-adjust-today','artifacts/adjust-today',/^(12-review-|08-review|08-simple-review|14-persistence|17-stale).*\.png$/],
 ['05-flexible-week','artifacts/flexible-week',/^(320|390|430)-(standard|premium)-(light|dark)-05-review\.png$/],
 ['05-flexible-week-long','artifacts/flexible-availability-results',/^(320|390|430)-(standard|premium)-(light|dark)-0[78]-.*\.png$/],
 ['05-gym-editors','artifacts/gym-profiles',/^(04-create|05-edit|theme-.*-editor)\.png$/],
];
for(const [group,source,pattern]of groups){const dest=path.join(root,group);await mkdir(dest,{recursive:true});let n=0;for(const name of await readdir(source)){if(pattern.test(name)){await copyFile(path.join(source,name),path.join(dest,name));n++;}}console.log(group,n);}
