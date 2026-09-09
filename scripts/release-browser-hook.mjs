import {chromium} from 'playwright-core';
// Explicit local target; script-level mocks override this offline API fallback.
const launch=chromium.launch.bind(chromium),seen=new WeakSet();
// Offline reload and CPU-throttled performance use the built app, not Vite HMR
// or React development overhead. Source-injection tests retain the dev target.
const builtApp=/(workout-photo-timeline-qa|add-exercise-opening-qa)\.mjs$/.test(process.argv[1]||'');
const simulatedAiAvailable=/visual-qa\.mjs$/.test(process.argv[1]||'');
const baseUrl=builtApp?(process.env.ROOK_QA_PREVIEW_URL||'http://127.0.0.1:4175'):(process.env.ROOK_QA_URL||'http://127.0.0.1:4190');
function patch(page){if(seen.has(page))return page;seen.add(page);const goto=page.goto.bind(page);page.goto=(url,options)=>goto(String(url).replace(/http:\/\/(localhost|127\.0\.0\.1):\d+/,baseUrl),options);page.setDefaultTimeout(10000);return page;}
chromium.launch=async(...args)=>{const browser=await launch(...args),newContext=browser.newContext.bind(browser);browser.newContext=async(...args)=>{const c=await newContext(...args),newPage=c.newPage.bind(c);await c.route('**/api/**',r=>r.fulfill(r.request().url().includes('/status')?{json:{available:simulatedAiAvailable,provider:simulatedAiAvailable?'visual-qa':null}}:{status:503,json:{error:'Release QA: live AI disabled'}}));c.newPage=async(...args)=>patch(await newPage(...args));return c;};const newPage=browser.newPage.bind(browser);browser.newPage=async(...args)=>patch(await newPage(...args));return browser;};
