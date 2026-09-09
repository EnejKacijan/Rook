import {afterEach,expect,it,vi} from 'vitest';
import {semanticBackSurface} from './useSemanticSwipeBack.js';
afterEach(()=>{document.body.innerHTML='';vi.restoreAllMocks();});
function surface(html){document.body.innerHTML=html;for(const b of document.querySelectorAll('button'))b.getClientRects=()=>[{}];return document.querySelector('[data-touch]');}
for(const cls of ['screen','workout-screen','profile-screen','onboarding','coach-history-surface'])it(`finds the existing ${cls} Back without a second navigation callback`,()=>{
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
