import { HistoryImportBatch } from './historyImportBatch.js';
import { serializeState } from './domain.js';
let requestId=null;
const batch=new HistoryImportBatch(progress=>self.postMessage({id:requestId,progress}));
async function handle({data:{id,type,payload}}){
  requestId=id;
  try {
    let result;
    if(type==='file') {
      result=await batch.read(payload.files,payload.options);
    } else if(type==='inspect') result=batch.inspect(payload.fileIndex,payload.sheetIndex,payload.options);
    else if(type==='parse') {
      result=await batch.parse(payload.settings,payload.state);
    } else if(type==='matches') result=batch.reviewMatches(payload.state);
    else if(type==='resolve') result=batch.resolve(payload.state,payload.sourceName,payload.resolution);
    else if(type==='apply') {
      if(payload.persisted!==serializeState(payload.state))throw new Error('ROOK data changed in another tab. Reopen the import to review the current history; nothing was overwritten.');
      const transaction=batch.apply(payload.state,payload.options);
      result={...transaction,serialized:serializeState(transaction.state)};
    } else throw new Error('Unknown history import operation.');
    self.postMessage({id,result});
  } catch(error) {self.postMessage({id,error:error.message || 'Could not process this file. Existing history is unchanged.'});}
};
// Inspect/read/parse operations share a draft and must never interleave.
let queue=Promise.resolve();
self.onmessage=event=>{queue=queue.then(()=>handle(event));};
