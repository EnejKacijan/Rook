// One isolated worker per open import flow. Closing it cancels pending work;
// the worker has no storage/network authority and can never commit an import.
export function createHistoryImportClient() {
  const worker=new Worker(new URL('./historyImport.worker.js',import.meta.url),{type:'module'});
  let sequence=0,closed=false;
  const pending=new Map();
  worker.onmessage=({data})=>{
    const request=pending.get(data.id);if(!request)return;
    if(data.progress){request.onProgress?.(data.progress);return;}
    pending.delete(data.id);data.error?request.reject(new Error(data.error)):request.resolve(data.result);
  };
  worker.onerror=()=>{closed=true;worker.terminate();for(const request of pending.values())request.reject(new Error('Local import processing failed. Nothing has been saved.'));pending.clear();};
  return {
    request(type,payload,onProgress){if(closed)return Promise.reject(new Error('Import closed.'));return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject,onProgress});try{worker.postMessage({id,type,payload});}catch(error){pending.delete(id);reject(error);}});},
    close(){closed=true;worker.terminate();for(const request of pending.values())request.reject(new Error('Import closed.'));pending.clear();},
  };
}
