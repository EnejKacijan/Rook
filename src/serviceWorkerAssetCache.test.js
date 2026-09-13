// @vitest-environment node
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it,vi} from 'vitest';
const script=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function harness(caches,fetch,path='/assets/wg-archer-push-up-reviewed.svg',mode='cors'){
 const listeners={};
 vm.runInNewContext(script,{URL,caches,fetch,self:{location:{origin:'https://rook.test'},addEventListener:(type,fn)=>{listeners[type]=fn;}}});
 const request={url:`https://rook.test${path}`,method:'GET',mode};
 const event={request,pending:[],respondWith(value){this.response=value;},waitUntil(value){this.pending.push(value);}};
 listeners.fetch(event);return event;
}
it.each([
 ['/assets/wg-archer-push-up-reviewed.svg','cors'],
 ['/','navigate'],
 ['/icon.svg','cors'],
])('caches %s even when its consumer reads the body before CacheStorage opens',async(path,mode)=>{
 let releaseCache;const opened=new Promise(resolve=>{releaseCache=resolve;});
 const put=vi.fn(async(_request,response)=>{expect(await response.text()).toBe('<svg>reviewed</svg>');});
 const event=harness({match:vi.fn(async()=>undefined),open:()=>opened},async()=>new Response('<svg>reviewed</svg>'),path,mode);
 const response=await event.response;
 expect(await response.text()).toBe('<svg>reviewed</svg>');
 expect(response.bodyUsed).toBe(true);
 releaseCache({put});await Promise.all(event.pending);
 expect(put).toHaveBeenCalledTimes(1);
});
it('reuses the exact fingerprinted cached SVG without a network request',async()=>{
 const cached=new Response('<svg>reviewed</svg>'),fetch=vi.fn();
 const event=harness({match:vi.fn(async()=>cached)},fetch);
 expect(await event.response).toBe(cached);
 expect(fetch).not.toHaveBeenCalled();expect(event.pending).toEqual([]);
});
