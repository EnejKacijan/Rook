// Fetch only text notices for exact installed package revisions, never code.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const inventory=JSON.parse(readFileSync('artifacts/legal-privacy-audit/software-inventory.json','utf8'));
const missing=[...new Map(inventory.missingNotices.map(item=>[`${item.name}@${item.version}`,item])).values()];
const records=await Promise.all(missing.map(async item=>{
  try {
    const metadataResponse=await fetch(`https://registry.npmjs.org/${encodeURIComponent(item.name)}/${item.version}`);
    if(!metadataResponse.ok)throw Error(`Registry ${metadataResponse.status}`);
    const metadata=await metadataResponse.json();
    if(!/^[a-f0-9]{40}$/i.test(metadata.gitHead||''))throw Error('No exact source revision in registry metadata');
    let repository=typeof metadata.repository==='string'?metadata.repository:metadata.repository?.url;
    repository=repository?.replace(/^git\+/,'').replace(/^git:\/\//,'https://').replace(/\.git$/,'');
    const parsed=new URL(repository),parts=parsed.pathname.split('/').filter(Boolean);
    const url=parsed.hostname==='github.com'&&parts.length===2?`https://raw.githubusercontent.com/${parts.join('/')}/${metadata.gitHead}/LICENSE`:
      parsed.hostname==='gitlab.com'&&parts.length===2?`https://gitlab.com/${parts.join('/')}/-/raw/${metadata.gitHead}/LICENSE`:null;
    if(!url)throw Error('Repository requires manual review');
    const response=await fetch(url);if(!response.ok)throw Error(`Source notice ${response.status}`);
    const text=await response.text();if(!/permission is hereby granted/i.test(text)||!/[Cc]opyright/.test(text)||/<html/i.test(text))throw Error('Response is not an expected MIT notice');
    const directory=`docs/licenses/packages/${item.name.replace(/[^a-z0-9._-]/gi,'_')}/${item.version}`;
    mkdirSync(directory,{recursive:true});writeFileSync(`${directory}/LICENSE`,text);
    const record={...item,path:`${directory}/LICENSE`,source:url,revision:metadata.gitHead,sha256:createHash('sha256').update(text).digest('hex')};
    writeFileSync(`${directory}/source.json`,JSON.stringify(record,null,2));return record;
  }catch(error){return {...item,error:error.message};}
}));
mkdirSync('docs/licenses/packages',{recursive:true});writeFileSync('docs/licenses/packages/manifest.json',JSON.stringify(records,null,2));console.log(JSON.stringify(records,null,2));
