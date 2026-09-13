import {afterEach,expect,it,vi} from 'vitest';
import {createHistoryImportClient} from './historyImportClient.js';
afterEach(()=>vi.unstubAllGlobals());
function setup(){const instances=[];vi.stubGlobal('Worker',class{constructor(){instances.push(this);}postMessage=vi.fn();terminate=vi.fn();});return instances;}
it('progress is nonterminal, cancelled jobs reject, late results cannot reach the next worker',async()=>{
 const workers=setup(),first=createHistoryImportClient(),progress=vi.fn();
 const pending=first.request('parse',{},progress),rejected=expect(pending).rejects.toThrow('Import closed');
 workers[0].onmessage({data:{id:1,progress:{stage:'hashes'}}});expect(progress).toHaveBeenCalledOnce();
 first.close();await rejected;expect(workers[0].terminate).toHaveBeenCalledOnce();
 const next=createHistoryImportClient(),resolved=next.request('parse',{});
 workers[0].onmessage({data:{id:1,result:{old:true}}});
 workers[1].onmessage({data:{id:1,result:{current:true}}});await expect(resolved).resolves.toEqual({current:true});next.close();
});
it('worker failure ends all requests and rejects subsequent work instead of leaving a spinner',async()=>{
 const workers=setup(),client=createHistoryImportClient();
 const request=client.request('parse',{}),failure=expect(request).rejects.toThrow('Nothing has been saved');workers[0].onerror();await failure;
 await expect(client.request('parse',{})).rejects.toThrow('Import closed');expect(workers[0].terminate).toHaveBeenCalledOnce();
});
it('a synchronous structured-clone failure is terminal for that request',async()=>{
 const workers=setup(),client=createHistoryImportClient();workers[0].postMessage.mockImplementationOnce(()=>{throw new DOMException('Invalid payload','DataCloneError');});
 await expect(client.request('parse',{})).rejects.toThrow('Invalid payload');
 const next=client.request('parse',{});workers[0].onmessage({data:{id:2,result:'ok'}});await expect(next).resolves.toBe('ok');client.close();
});
