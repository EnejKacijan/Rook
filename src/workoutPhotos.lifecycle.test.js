import {afterEach,expect,it,vi} from 'vitest';
import {getWorkoutPhoto} from './workoutPhotos.js';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function storage(){const requests=[];vi.stubGlobal('indexedDB',{open:vi.fn(()=>{const request={};requests.push(request);return request;})});return requests;}
function database(record={id:'synthetic-photo',blob:new Blob(['synthetic'],{type:'image/jpeg'})}){
 const get={},tx={objectStore:vi.fn(()=>({get:vi.fn(()=>get)})),abort:vi.fn()};
 const db={close:vi.fn(),transaction:vi.fn(()=>tx)};
 return {db,tx,get,record};
}
async function complete(request,store){
 request.result=store.db;request.onsuccess();await Promise.resolve();
 store.get.result=store.record;store.get.onsuccess();store.tx.oncomplete();
}
it('closes only the eventual unowned connection from a blocked open',async()=>{
 const requests=storage(),late=database();
 const pending=getWorkoutPhoto('synthetic-photo');requests[0].onblocked();
 await expect(pending).rejects.toThrow('Photo storage is busy. Close other ROOK tabs and try again.');
 requests[0].result=late.db;requests[0].onsuccess();
 expect(late.db.close).toHaveBeenCalledOnce();expect(late.db.transaction).not.toHaveBeenCalled();
});
it('a retry retains its active connection when the older blocked request finishes',async()=>{
 const requests=storage(),late=database(),active=database();
 const first=getWorkoutPhoto('synthetic-photo');requests[0].onblocked();await expect(first).rejects.toThrow('Photo storage is busy');
 const retry=getWorkoutPhoto('synthetic-photo');requests[1].result=active.db;requests[1].onsuccess();await Promise.resolve();
 requests[0].result=late.db;requests[0].onsuccess();
 expect(late.db.close).toHaveBeenCalledOnce();expect(active.db.close).not.toHaveBeenCalled();
 active.get.result=active.record;active.get.onsuccess();active.tx.oncomplete();
 expect(await retry).toBe(active.record);expect(active.db.close).toHaveBeenCalledOnce();
});
it('normal photo read closes the owned connection after its transaction completes',async()=>{
 const requests=storage(),active=database();const pending=getWorkoutPhoto('synthetic-photo');
 await complete(requests[0],active);
 expect(await pending).toBe(active.record);expect(active.db.close).toHaveBeenCalledOnce();
 expect(active.db.transaction).toHaveBeenCalledWith('photos','readonly');expect(active.tx.abort).not.toHaveBeenCalled();
});
it('a failed open preserves its error and releases a late unowned connection',async()=>{
 const requests=storage(),late=database(),error=new Error('Synthetic storage open failure');
 const pending=getWorkoutPhoto('synthetic-photo');requests[0].error=error;requests[0].onerror();
 await expect(pending).rejects.toBe(error);requests[0].result=late.db;requests[0].onsuccess();
 expect(late.db.close).toHaveBeenCalledOnce();expect(late.db.transaction).not.toHaveBeenCalled();
});
it('a failed read aborts and closes its normal owned connection',async()=>{
 const requests=storage(),active=database(),error=new Error('Synthetic read failure');const pending=getWorkoutPhoto('synthetic-photo');
 requests[0].result=active.db;requests[0].onsuccess();await Promise.resolve();
 active.get.error=error;active.get.onerror();await Promise.resolve();active.tx.onabort();
 await expect(pending).rejects.toBe(error);expect(active.tx.abort).toHaveBeenCalledOnce();expect(active.db.close).toHaveBeenCalledOnce();
});
