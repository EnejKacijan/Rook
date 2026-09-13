import readXlsxFile from 'read-excel-file/universal';
import { unzipSync, strFromU8 } from 'fflate';
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
      let total=0;
      // Check advertised uncompressed sizes before allocating XML. No formulas,
      // macros, external links or executable content are evaluated by this reader.
      const xml=unzipSync(new Uint8Array(buffer),{filter:entry=>{
        total+=entry.originalSize;
        if(total>HISTORY_FILE_LIMITS.expanded)throw new Error('Expanded workbook exceeds the 64 MB safety limit.');
        return /^xl\/worksheets\/.*\.xml$/.test(entry.name);
      }});
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
