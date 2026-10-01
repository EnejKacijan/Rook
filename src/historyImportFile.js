import readXlsxFile from 'read-excel-file/universal';
import { strFromU8 } from 'fflate';
import { readBoundedArchive } from './boundedZip.js';
import { readHistoryCsv } from './historyImportTable.js';

export const HISTORY_FILE_LIMITS = { bytes:25*1024*1024, expanded:64*1024*1024, rows:150000, columns:250 };
export async function readHistoricalFile(name, buffer) {
  if(buffer.byteLength>HISTORY_FILE_LIMITS.bytes)throw new Error('This file exceeds the 25 MB local import limit. Export a smaller date range.');
  let sheets;
  if(/\.(csv|tsv|txt)$/i.test(name)) {
    let text;
    try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer);}
    catch{throw new Error('This text file is not valid UTF-8. Export it as UTF-8 CSV without changing its data.');}
    const table=readHistoryCsv(text);sheets=[{name:'CSV',...table}];
  } else if(/\.xlsx$/i.test(name)) {
    try {
      // Validate actual expansion before the workbook library can unzip the
      // input again. The shared worker also rejects forged ZIP size metadata.
      const entries=await readBoundedArchive(new Uint8Array(buffer),{limits:{compressed:HISTORY_FILE_LIMITS.bytes,expanded:HISTORY_FILE_LIMITS.expanded,entry:HISTORY_FILE_LIMITS.expanded,entries:2048}});
      const xml=Object.fromEntries(Object.entries(entries).filter(([name])=>/^xl\/worksheets\/.*\.xml$/.test(name)));
      if(Object.values(xml).some(bytes=>/<(?:\w+:)?f(?:\s|\/?>)/.test(strFromU8(bytes))))throw new Error('Formula cells are not imported as factual results. Export a values-only CSV/XLSX first.');
      const workbook=await readXlsxFile(buffer);
      sheets=workbook.map(sheet=>({name:sheet.sheet,rows:sheet.data,format:'xlsx',encoding:'XLSX cell values',delimiter:null}));
    }catch(error){throw new Error(`Could not read XLSX: ${error.message || 'invalid, encrypted or unsupported workbook'}`);}
  } else throw new Error('Choose a CSV, TSV or XLSX workout-history file. Legacy XLS and PDF are not supported.');
  for(const sheet of sheets) {
    if(sheet.rows.length>HISTORY_FILE_LIMITS.rows||sheet.rows.some(row=>row.length>HISTORY_FILE_LIMITS.columns))throw new Error('The worksheet exceeds the local row/column safety limit. Export a smaller date range.');
  }
  if(!sheets.length)throw new Error('Workbook contains no worksheets.');
  return sheets;
}
