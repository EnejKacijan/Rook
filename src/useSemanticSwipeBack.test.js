import {afterEach,expect,it,vi} from 'vitest';
import {semanticBackSurface} from './useSemanticSwipeBack.js';
afterEach(()=>{document.body.innerHTML='';vi.restoreAllMocks();});
function surface(html){document.body.innerHTML=html;for(const b of document.querySelectorAll('button'))b.getClientRects=()=>[{}];return document.querySelector('[data-touch]');}
for(const cls of ['screen','workout-screen','profile-screen','onboarding','coach-history-surface','coach-content-surface','combine-review-surface'])it(`finds the existing ${cls} Back without a second navigation callback`,()=>{
 const target=surface(`<main class="${cls}"><button aria-label="Back to parent"></button><p data-touch></p></main>`);
 expect(semanticBackSurface(target).button).toBe(document.querySelector('button'));
});
for(const cls of ['import-plan-screen','import-resolution'])it(`leaves ${cls} unchanged`,()=>{
 expect(semanticBackSurface(surface(`<main class="screen ${cls}"><button aria-label="Back"></button><p data-touch></p></main>`))).toBeNull();
});
it('does not borrow a Back from an underlying or nested screen',()=>{
 expect(semanticBackSurface(surface('<main class="screen"><p data-touch></p><main class="screen"><button aria-label="Back"></button></main></main>'))).toBeNull();
 expect(semanticBackSurface(surface('<main class="screen"><button aria-label="Back"></button><section role="dialog"><p data-touch></p></section></main>'))).toBeNull();
});
for(const flag of ['inert','aria-hidden="true"'])it(`excludes ${flag} parents`,()=>{
 expect(semanticBackSurface(surface(`<div ${flag}><main class="screen"><button aria-label="Back"></button><p data-touch></p></main></div>`))).toBeNull();
});
it('excludes close-only and disabled Back surfaces',()=>{
 expect(semanticBackSurface(surface('<main class="screen"><button aria-label="Close"></button><p data-touch></p></main>'))).toBeNull();
 expect(semanticBackSurface(surface('<main class="screen"><button disabled aria-label="Back"></button><p data-touch></p></main>'))).toBeNull();
});
it('gives drag handles explicit priority',()=>{
 expect(semanticBackSurface(surface('<main class="screen"><button aria-label="Back"></button><div data-no-edge-back data-touch></div></main>'))).toBeNull();
});
it('delegates the full import screen edge to the live decision Back, including Step 1',()=>{
 const target=surface('<main class="screen import-plan-screen initial-import-screen"><button aria-label="Back to start"></button><section class="import-resolution" data-import-step-back="true"><button aria-label="Back"></button><p data-touch></p></section></main>');
 expect(semanticBackSurface(target).button).toBe(document.querySelector('.import-resolution button'));
 const screen=document.querySelector('.import-plan-screen');
 expect(semanticBackSurface(screen)).toEqual(semanticBackSurface(target));
 expect(semanticBackSurface(target).edgeSurface).toBe(screen);
 expect(semanticBackSurface(target).surface).toBe(document.querySelector('.import-resolution'));
 document.querySelector('.import-resolution').removeAttribute('data-import-step-back');
 expect(semanticBackSurface(target)).toBeNull();
});
it('uses the decision Back inside an import sheet, not the sheet Close',()=>{
 const target=surface('<div class="modal-layer"><main class="screen import-plan-screen"><button aria-label="Close"></button><section class="import-resolution" data-import-step-back="true"><button aria-label="Back"></button><p data-touch></p></section></main></div>');
 expect(semanticBackSurface(target).button).toBe(document.querySelector('.import-resolution button'));
 expect(semanticBackSurface(document.querySelector('main')).edgeSurface).toBe(document.querySelector('main'));
});
it('does not borrow import Back through a child overlay or an inactive decision',()=>{
 expect(semanticBackSurface(surface('<main class="screen import-plan-screen"><section class="import-resolution" data-import-step-back="true"><button aria-label="Back"></button><div role="dialog"><p data-touch></p></div></section></main>'))).toBeNull();
 expect(semanticBackSurface(surface('<main class="screen import-plan-screen" data-touch><section inert class="import-resolution" data-import-step-back="true"><button aria-label="Back"></button></section></main>'))).toBeNull();
 expect(semanticBackSurface(surface('<main class="screen import-plan-screen" data-touch><section class="import-resolution"><button aria-label="Back"></button></section></main>'))).toBeNull();
});
