// @vitest-environment node
import {createServer,request as httpRequest} from 'node:http';
import {afterAll,afterEach,beforeAll,expect,it,vi} from 'vitest';

let server,base;
beforeAll(async()=>{
  vi.stubEnv('OPENAI_API_KEY','test-only-not-a-secret');
  const {rookRequestHandler}=await import('../server.mjs');
  server=createServer(rookRequestHandler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
});
afterEach(()=>vi.unstubAllGlobals());
afterAll(async()=>{await new Promise(resolve=>server.close(resolve));vi.unstubAllEnvs();});
const fragment={id:'f',text:'Please perform Cable Row for three sets of ten reps.',executable:true};
const interpretation={fragments:[{id:'f',kind:'exercise',nameQuote:'Cable Row',facts:[{kind:'sets',evidence:'three sets',value:'3'},{kind:'reps',evidence:'ten reps',value:'10'}]}]};
const post=payload=>new Promise((resolve,reject)=>{
  const req=httpRequest(`${base}/api/ai`,{method:'POST',headers:{'content-type':'application/json'}},res=>{
    let body='';res.on('data',part=>body+=part);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));
  });req.on('error',reject);req.end(JSON.stringify({operation:'interpret-import',payload}));
});
const provider=result=>vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({output_text:JSON.stringify(result)}),{status:200})));

it('uses the existing server-only Responses path and whitelists source fragments',async()=>{
  provider(interpretation);
  const r=await post({consent:true,fragments:[fragment],profile:{private:'not sent'},workouts:['not sent'],extra:'not sent'});
  expect(r.status).toBe(200);expect(r.body.data).toEqual(interpretation);
  const [url,options]=fetch.mock.calls[0],body=JSON.parse(options.body);
  expect(url).toBe('https://api.openai.com/v1/responses');expect(body.store).toBe(false);
  expect(body.text.format.strict).toBe(true);expect(JSON.parse(body.input)).toEqual({fragments:[fragment]});
});
it.each([{}, {consent:false,fragments:[fragment]}, {consent:true,fragments:Array(81).fill(fragment)}, {consent:true,fragments:[{...fragment,text:'x'.repeat(12001)}]}])('rejects missing consent/unbounded input without provider invocation %#',async payload=>{
  provider(interpretation);expect((await post(payload)).status).not.toBe(200);expect(fetch).not.toHaveBeenCalled();
});
it.each([
  {...interpretation.fragments[0],facts:[{kind:'load',evidence:'three sets',value:'20 kg'}]},
  {id:'f',kind:'exercise',nameQuote:'Squat',facts:[]},
  {id:'f',kind:'note',nameQuote:'',facts:[]},
])('rejects ungrounded AI results at the server boundary %#',async item=>{
  provider({fragments:[item]});const r=await post({consent:true,fragments:[fragment]});expect(r.status).not.toBe(200);expect(r.body.error).toMatch(/local draft remains available/);
});
it('returns a recoverable provider failure without a candidate plan',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>{const error=new Error('timed out');error.name='TimeoutError';throw error;}));
  const r=await post({consent:true,fragments:[fragment]});expect(r.status).not.toBe(200);expect(r.body.data).toBeUndefined();expect(r.body.error).toMatch(/too long/);
});
