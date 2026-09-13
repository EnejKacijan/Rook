// Opt-in synthetic live integration only. Frontend requests traverse the actual
// production Netlify event adapter + server implementation + real provider.
// This is not a mocked AI response and never changes local server configuration.
import {chromium} from 'playwright-core';
process.env.NODE_ENV='production';
const {handler}=await import('../netlify/functions/api.mjs');
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
 const browser=await launch(...args),create=browser.newContext.bind(browser);
 browser.newContext=async(...options)=>{
  const context=await create(...options);
  await context.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url());
   const result=await handler({path:`/.netlify/functions/api${url.pathname.slice(4)}`,httpMethod:request.method(),headers:request.headers(),body:request.postData()});
   await route.fulfill({status:result.statusCode,headers:result.headers,body:result.body});
  });return context;
 };return browser;
};
