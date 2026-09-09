// Curated masters replace the former stick-figure and wrong-machine adaptations.
// Regeneration must be deterministic and must never recreate those placeholders.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const artDir=path.resolve(import.meta.dirname,'../src/assets/exercise-art');
const masterDir=path.join(artDir,'corrected-masters');
const files=(await readdir(masterDir)).filter(file=>/^wg-.*\.svg$/.test(file)).sort();
if(files.length!==26)throw new Error(`Expected 26 reviewed correction masters, found ${files.length}`);
for(const file of files){
 const source=await readFile(path.join(masterDir,file),'utf8');
 const target=path.join(artDir,file);
 if(await readFile(target,'utf8').catch(()=>null)!==source)await writeFile(target,source);
 console.log(`${file} <- reviewed correction master`);
}
// Other existing illustrations are intentionally preserved, not regenerated
// from a merely similar movement or apparatus.
