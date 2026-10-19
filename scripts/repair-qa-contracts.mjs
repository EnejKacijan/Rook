// One-time mechanical migration of obsolete QA navigation; never touches src.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
const changed=[];await mkdir('artifacts/release-regression',{recursive:true});
for(const name of await readdir('scripts')){
 if(!name.endsWith('.mjs')||['repair-qa-contracts.mjs','qa-current-navigation.mjs'].includes(name))continue;
 const path=`scripts/${name}`,original=await readFile(path,'utf8');let s=original,notes=[];
 const auto=/(await (?:\w+\.)?\w+\.getByRole\(['"]button['"],\s*\{\s*name:\s*(?:['"](?:Build muscle|Get stronger|Lose fat|General fitness|Athletic performance)['"]|\/\^(?:Beginner|Intermediate|Advanced)[^\n]*?\/)(?:,\s*exact:\s*true)?\s*\}\)\.click\(\);)\s*await (?:next\(\)|[\w.]+\.getByRole\(['"]button['"],\s*\{\s*name:\s*['"]CONTINUE['"](?:,\s*exact:\s*true)?\s*\}\)\.click\(\));/g;
 s=s.replace(auto,'$1');if(s!==original)notes.push('Remove redundant Continue after Goal/Experience auto-advance');
 let profile=false,week=false;
 s=s.replace(/await ([\w.]+)\.getByRole\((?:(?!\.getByRole\()[\s\S])*?\)\.(?:click|waitFor)\([^;]*;/g,whole=>{
  const m=whole.match(/^await ([\w.]+)\.getByRole/),page=m[1];
  if(/name\s*:\s*['"]ADJUST WEEK['"]/.test(whole)){week=true;return `await openAdjustWeek(${page});`;}
  let area=/name\s*:\s*(?:\/\^?|['"])(?:Training block|Edit plan|Plan history|Export workout plan|Replace plan)/.test(whole)?'program':/name\s*:\s*(?:\/\^?|['"])(?:Gym profiles|Custom exercises|Training restrictions|Training priorities|Availability)/.test(whole)?'training':/name\s*:\s*(?:\/\^?|['"])(?:Logging|Appearance|Notifications)/.test(whole)?'preferences':/name\s*:\s*(?:\/\^?|['"])(?:Import workout history|Export workout history|Back up ROOK|Restore backup|Delete local data)/.test(whole)?'data':null;
  if(!area)return whole;profile=true;return `await openProfileArea(${page}, '${area}'); ${whole}`;
 });
 if(profile||week){s=`import { ${[profile?'openProfileArea':null,week?'openAdjustWeek':null].filter(Boolean).join(', ')} } from './qa-current-navigation.mjs';\n`+s;notes.push('Navigate current Profile category / Today overflow before existing destination');}
 if(s!==original){await writeFile(path,s);changed.push({file:path,corrections:notes});}
}
await writeFile('artifacts/release-regression/automation-migration.json',JSON.stringify(changed,null,2));console.log(changed);
