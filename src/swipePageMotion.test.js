import {afterEach,expect,it,vi} from 'vitest';
import {pageBackMotion} from './swipePageMotion.js';
afterEach(()=>{document.body.innerHTML='';vi.unstubAllGlobals();});
function fixture(reduced=false){
 vi.stubGlobal('matchMedia',()=>({matches:reduced}));
 document.body.innerHTML='<main><div class="coach-content-surface" style="padding:17px"><textarea>Draft</textarea></div><section class="coach-history-surface coach-history-parent" inert aria-hidden="true"><div class="coach-history-scroll">History</div></section></main><nav>Tabs</nav>';
 for(const e of document.querySelectorAll('*'))e.getAnimations=()=>[];
 const child=document.querySelector('.coach-content-surface');child.getBoundingClientRect=()=>({width:390});return child;
}
it('uses the live Coach parent without cloning, remounting or changing its state',()=>{
 const child=fixture(),parent=document.querySelector('section'),scroll=parent.firstElementChild,nav=document.querySelector('nav');scroll.scrollTop=220;
 const original=child.getAttribute('style'),motion=pageBackMotion(child);motion.render(195,180);
 expect(child.style.transform).toBe('translate3d(195px,0,0)');expect(parent.style.visibility).toBe('visible');expect(parent.hasAttribute('inert')).toBe(true);
 expect(document.querySelectorAll('.coach-history-surface')).toHaveLength(1);expect(nav.getAttribute('style')).toBeNull();
 motion.clear();expect(child.getAttribute('style')).toBe(original);expect(parent.getAttribute('style')).toBeNull();expect(scroll.scrollTop).toBe(220);expect(child.querySelector('textarea').value).toBe('Draft');
});
it('preserves the history overlay position and removes only transient drag styles',()=>{
 fixture();const history=document.querySelector('section');history.classList.remove('coach-history-parent');history.removeAttribute('inert');history.removeAttribute('aria-hidden');history.getBoundingClientRect=()=>({width:390});
 const motion=pageBackMotion(history);motion.render(100,100);expect(history.style.position).toBe('');motion.clear();expect(history.getAttribute('style')).toBeNull();
});
it('does not animate under reduced motion',()=>{expect(pageBackMotion(fixture(true))).toBeNull();});

function questionnaire(reduced=false) {
 fixture(reduced);
 document.body.innerHTML='<main class="onboarding"><header>ROOK</header><div data-swipe-back-content style="padding:12px"><textarea>Raw answer</textarea></div><footer><button aria-label="Back">Back</button></footer></main>';
 const main=document.querySelector('main'),content=main.querySelector('[data-swipe-back-content]');
 content.getBoundingClientRect=()=>({width:342});content.getAnimations=()=>[];
 return {main,content};
}
it('uses the same live renderer for opted-in questionnaire content without moving the shell or remounting answers',()=>{
 const {main,content}=questionnaire(),input=content.firstElementChild,original=content.getAttribute('style');
 content.scrollTop=165;const motion=pageBackMotion(main);motion.render(170,100);
 expect(content.style.transform).toBe('translate3d(170px,0,0)');expect(main.style.transform).toBe('');
 expect(main.querySelector('header').getAttribute('style')).toBeNull();expect(main.querySelector('footer').getAttribute('style')).toBeNull();
 motion.render(0,100);motion.clear();
 expect(content.getAttribute('style')).toBe(original);expect(content.firstElementChild).toBe(input);
 expect(input.value).toBe('Raw answer');expect(content.scrollTop).toBe(165);expect(document.querySelector('[data-swipe-parent]')).toBeNull();
});
it('cancels the existing entrance without toggling animation CSS and replaying it after cancellation',()=>{
 const {main,content}=questionnaire(),cancel=vi.fn();content.getAnimations=()=>[{cancel}];
 const motion=pageBackMotion(main);motion.render(70,100);expect(cancel).toHaveBeenCalledOnce();
 expect(content.style.animation).toBe('');motion.clear();expect(content.style.animation).toBe('');
});
it('does not opt other onboarding surfaces into motion or animate questionnaire content under reduced motion',()=>{
 const {main,content}=questionnaire();content.removeAttribute('data-swipe-back-content');expect(pageBackMotion(main)).toBeNull();
 expect(pageBackMotion(questionnaire(true).main)).toBeNull();
});
