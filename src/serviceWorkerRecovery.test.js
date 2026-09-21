// @vitest-environment node
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it,vi} from 'vitest';
const script=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker({fetch=vi.fn(),cache={}}={}) {
  const listeners={},caches={open:vi.fn(async()=>cache),keys:vi.fn(async()=>['rook-v11','rook-v12','unrelated-app','rook-recovery']),delete:vi.fn(async()=>true),match:vi.fn(async()=>new Response('previous offline shell'))};
  const self={location:{origin:'https://rook.test'},clients:{claim:vi.fn()},skipWaiting:vi.fn(),addEventListener:(name,fn)=>listeners[name]=fn};
  vm.runInNewContext(script,{self,caches,fetch,URL});return {listeners,caches,self};
}
it('activation deletes only owned obsolete shell caches and has no application-storage API',async()=>{
  const {listeners,caches}=worker();let work;listeners.activate({waitUntil:p=>work=p});await work;expect(caches.delete.mock.calls).toEqual([['rook-v11']]);expect(script).not.toMatch(/localStorage|indexedDB|deleteDatabase/);
});
it('failed install asset fetch preserves the previously cached shell',async()=>{
  const cache={addAll:vi.fn(async()=>{throw Error('asset unavailable');}),put:vi.fn()},w=worker({cache,fetch:async()=>new Response('<script src="/assets/new.js"></script>')});let work;
  w.listeners.install({waitUntil:p=>work=p});await expect(work).rejects.toThrow('asset unavailable');expect(cache.put).not.toHaveBeenCalled();expect(w.self.skipWaiting).not.toHaveBeenCalled();
});
it('completed install caches entry assets before replacing the shell',async()=>{
  const order=[],cache={addAll:vi.fn(async()=>order.push('assets')),put:vi.fn(async key=>order.push(key))},w=worker({cache,fetch:async()=>new Response('<script src="/assets/new.js"></script>')});let work;
  w.listeners.install({waitUntil:p=>work=p});await work;expect(order).toEqual(['assets','/index.html','/']);expect(w.self.skipWaiting).toHaveBeenCalledOnce();
});
it.each(['offline','failed-assets','online'])('navigation %s cannot replace the offline shell with an incomplete build',async mode=>{
  const cache={addAll:vi.fn(async()=>{if(mode==='failed-assets')throw Error('missing asset');}),put:vi.fn()},w=worker({cache,fetch:async()=>{if(mode==='offline')throw Error('offline');return new Response('<script src="/assets/new.js"></script>');}});
  const pending=[];let response;w.listeners.fetch({request:{method:'GET',url:'https://rook.test/',mode:'navigate'},respondWith:p=>response=p,waitUntil:p=>pending.push(p)});
  const body=await (await response).text();await Promise.all(pending);expect(body).toContain(mode==='offline'?'previous offline shell':'/assets/new.js');expect(cache.put).toHaveBeenCalledTimes(mode==='online'?1:0);
});
