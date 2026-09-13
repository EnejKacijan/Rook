// Synthetic schema fixtures, never anonymized/claimed real-user exports.
import {zipSync,strToU8} from 'fflate';
export const csvCell=value=>value==null?'':/[",\r\n;\t]/.test(String(value))?'"'+String(value).replaceAll('"','""')+'"':String(value);
export const csv=(headers,rows,delimiter=',',bom=false)=>(bom?'\uFEFF':'')+[headers,...rows].map(row=>row.map(csvCell).join(delimiter)).join('\r\n');
export const hevyHeaders=unit=>['title','start_time','end_time','description','exercise_title','superset_id','exercise_notes','set_index','set_type',unit==='lb'?'weight_lbs':'weight_kg','reps',unit==='lb'?'distance_miles':'distance_km','duration_seconds','rpe'];
export const hevyRow=(overrides={})=>Object.assign({title:'Upper 💪',start_time:'28 Mar 2025, 17:29',end_time:'28 Mar 2025, 18:45',description:'Lep trening, "počasi".\nDruga vrstica.',exercise_title:'Bench Press',superset_id:'',exercise_notes:'Pavza spodaj; ne zaklepaj.',set_index:0,set_type:'normal',weight_kg:60,weight_lbs:185,reps:8,distance_km:'',distance_miles:'',duration_seconds:'',rpe:8},overrides);
export const hevyCsv=(rows=[hevyRow()],unit='kg',headers=hevyHeaders(unit))=>csv(headers,rows.map(row=>headers.map(h=>row[h])));
export const strongHeaders=['Date','Workout Name','Duration','Exercise Name','Set Order','Weight','Reps','Distance','Seconds','Notes','Workout Notes','RPE'];
export const strongCsv=()=>csv(strongHeaders,[['2025-03-28 17:29:00','Upper','1h 16m','Bench Press',1,80,8,'','','Paused','Good session',8],['2025-03-29 09:00:00','Easy','20m','Push Up',1,0,12,'','','Bodyweight','',''],['2025-03-29 09:00:00','Easy','20m','Plank',1,'','','',30,'','',''],['2025-03-29 09:00:00','Easy','20m','Walking',1,'','',2,1200,'','','']]);
export const genericHeaders=['workout_date','workout_name','exercise_name','set_order','weight','weight_unit','reps','duration_seconds','notes','workout_notes','set_type','distance','distance_unit','rir','load_kind'];
export const genericRow=(overrides={})=>Object.assign({workout_date:'2025-03-28T17:00:00',workout_name:'Upper',exercise_name:'Bench Press',set_order:1,weight:60,weight_unit:'kg',reps:8,set_type:'normal'},overrides);
export const genericCsv=(rows=[genericRow()],headers=genericHeaders,delimiter=',',bom=false)=>csv(headers,rows.map(r=>headers.map(h=>r[h])),delimiter,bom);
export const largeCsv=(workouts,sets=3,invalidIndex=-1)=>{
 const rows=[];
 for(let i=0;i<workouts;i++)for(let j=0;j<sets;j++)rows.push(genericRow({workout_date:new Date(Date.UTC(2010,0,i+1,18)).toISOString(),workout_name:`Session ${i+1}`,set_order:j+1,weight:rows.length===invalidIndex?-50:50+(i%12)}));
 return genericCsv(rows);
};
const xmlText=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function xlsxFixture(sheets, {formula=false}={}) {
 const files={
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>',
  '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xmlText(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`,
  'xl/_rels/workbook.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`,
 };
 sheets.forEach((s,i)=>{files[`xl/worksheets/sheet${i+1}.xml`]=`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${s.rows.map((r,ri)=>`<row r="${ri+1}">${r.map((v,ci)=>{const col=ci<26?String.fromCharCode(65+ci):'A'+String.fromCharCode(65+ci-26);const ref=`${col}${ri+1}`;return typeof v==='number'?`<c r="${ref}">${formula&&ri===1?'<f>1+1</f>':''}<v>${v}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlText(v)}</t></is></c>`;}).join('')}</row>`).join('')}</sheetData></worksheet>`;});
 return zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])));
}
