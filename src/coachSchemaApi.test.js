// @vitest-environment node
import { createServer, request as httpRequest } from 'node:http';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

let server, base;
beforeAll(async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-secret');
  const { rookRequestHandler } = await import('../server.mjs');
  server = createServer(rookRequestHandler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => { await new Promise(resolve => server.close(resolve)); vi.unstubAllEnvs(); });

const post = (operation, payload) => new Promise((resolve, reject) => {
  const request = httpRequest(`${base}/api/ai`, { method:'POST', headers:{'content-type':'application/json'} }, response => {
    let body = '';
    response.on('data', part => { body += part; });
    response.on('end', () => resolve({status:response.statusCode, body:JSON.parse(body)}));
  });
  request.on('error', reject);
  request.end(JSON.stringify({operation, payload}));
});
const provider = reply => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({output_text:JSON.stringify(reply)}), {status:200})));

// Validate the actual request sent by the server, including ALL action branches.
// A missing type in even an unused action makes the provider reject normal chat.
function expectTypedStrictSchema(node, path = 'schema') {
  if (node.anyOf) node.anyOf.forEach((child, index) => expectTypedStrictSchema(child, `${path}.anyOf[${index}]`));
  else expect(node.type, `${path} must declare a type`).toBeDefined();
  if (node.type === 'object') {
    expect(node.additionalProperties, path).toBe(false);
    expect([...node.required].sort(), path).toEqual(Object.keys(node.properties).sort());
    for (const [key, child] of Object.entries(node.properties)) expectTypedStrictSchema(child, `${path}.${key}`);
  }
  if (node.type === 'array') expectTypedStrictSchema(node.items, `${path}.items`);
}

it('normal Coach chat sends a valid typed schema for every possible action', async () => {
  const reply = {text:'OK',action:null};
  provider(reply);
  const result = await post('coach', {message:'Diagnostic check. No action.',context:{}});
  expect(result).toEqual({status:200,body:{data:reply}});
  const [url, options] = fetch.mock.calls[0], body = JSON.parse(options.body);
  expect(url).toBe('https://api.openai.com/v1/responses');
  expect(body.store).toBe(false);
  expect(body.text.format).toMatchObject({name:'coach_reply',strict:true});
  expectTypedStrictSchema(body.text.format.schema);
  const combined = body.text.format.schema.properties.action.anyOf.find(branch => branch.properties?.type?.const === 'combine-workouts');
  expect(combined.properties.type).toEqual({type:'string',const:'combine-workouts'});
  expect(combined.properties.sourceSessionIds).toEqual({type:'array',items:{type:'string'},minItems:2,maxItems:2});
  expect(combined.properties.minutes.type).toEqual(['number','null']);
  const revision=body.text.format.schema.properties.action.anyOf.find(branch=>branch.properties?.type?.const==='revise-combined-workout');
  expect(revision.required).toEqual(['type','targetWorkoutId','timeMode','minutes']);
  expect(revision.properties.timeMode.enum).toEqual(['total','delta','no-limit','unknown']);
});

it.each([null,45])('combined-workout proposals still return source identities and minutes=%s without changing context', async minutes => {
  const reply = {text:'Prepared for review.',action:{type:'combine-workouts',sourceSessionIds:['session-a','session-b'],minutes}};
  provider(reply);
  const payload = {message:'Combine these two workouts.',context:{combineSessions:[{id:'session-a',status:'planned'},{id:'session-b',status:'planned'}]}};
  const before = JSON.stringify(payload);
  expect((await post('coach',payload)).body.data).toEqual(reply);
  expect(JSON.stringify(payload)).toBe(before);
  expect(fetch).toHaveBeenCalledOnce();
});

it('the separate combine intent contract remains typed with nullable time', async () => {
  const reply = {sourceIds:['session-a','session-b'],minutes:null,unambiguous:true};
  provider(reply);
  expect((await post('combine-intent',{message:'Combine A and B.'})).body.data).toEqual(reply);
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.text.format.name).toBe('combined_workout_intent');
  expectTypedStrictSchema(body.text.format.schema);
});
