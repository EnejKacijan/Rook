import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {AnimatedDetails} from './AnimatedDetails.jsx';
import {ReviewDetails} from './ReviewDetails.jsx';
import {revealDisclosure} from './Disclosure.jsx';

let root,host,frames,bodyBox,summaryBox,footerBox,reduced,originalAnimate;
const rect=(top,height)=>({top,bottom:top+height,height,left:0,right:390,width:390});
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;frames=[];reduced=false;
  vi.stubGlobal('innerHeight',800);
  bodyBox=rect(580,200);summaryBox=rect(530,50);footerBox=rect(650,130);
  vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',callback=>{frames.push(callback);return frames.length;});
  originalAnimate=Element.prototype.animate;Element.prototype.animate=undefined;
  vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(){
    if(this.matches('summary'))return summaryBox;
    if(this.classList.contains('sheet-action-footer'))return footerBox;
    if(this.classList.contains('detail-header'))return rect(20,90);
    if(this.classList.contains('rook-disclosure-content'))return bodyBox;
    if(this.classList.contains('rook-disclosure'))return this.classList.contains('is-open')?bodyBox:rect(bodyBox.top,0);
    return rect(0,0);
  });
  host=document.createElement('div');host.style.overflowY='auto';host.getBoundingClientRect=()=>rect(20,760);host.scrollBy=vi.fn();document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();Element.prototype.animate=originalAnimate;vi.restoreAllMocks();vi.unstubAllGlobals();});
const render=(props={},review=false)=>act(()=>root.render(<><header className="detail-header"/>{review?<ReviewDetails title="Why this change?" {...props}><p>Evidence for the next block.</p></ReviewDetails>:<AnimatedDetails {...props}><summary>Current program</summary><p>Plan targets</p></AnimatedDetails>}<footer className="sheet-action-footer"/></>));
const click=()=>act(()=>host.querySelector('summary').click());
const flush=()=>act(()=>{while(frames.length)frames.shift()();});

it.each([false,true])('reveals an opened program or supporting explanation above the footer (review=%s)',review=>{
  render({},review);const summary=host.querySelector('summary');summary.focus();click();flush();
  expect(host.scrollBy).toHaveBeenCalledWith({top:142,behavior:'smooth'});expect(document.activeElement).toBe(summary);
  expect(summary.getAttribute('aria-expanded')).toBe('true');
});
it('keeps the summary and first lines visible for a long program instead of scrolling to its end',()=>{
  bodyBox=rect(580,1800);render();click();flush();expect(host.scrollBy).toHaveBeenCalledWith({top:408,behavior:'smooth'});
});
it('leaves an already visible dropdown in place',()=>{
  summaryBox=rect(180,50);bodyBox=rect(230,180);render();click();flush();expect(host.scrollBy).not.toHaveBeenCalled();
});
it('does not scroll on initial/default expansion, content refresh or closing',()=>{
  render({defaultOpen:true});flush();expect(host.scrollBy).not.toHaveBeenCalled();
  render({defaultOpen:true});flush();expect(host.scrollBy).not.toHaveBeenCalled();
  click();flush();expect(host.scrollBy).not.toHaveBeenCalled();
});
it('cancels a pending reveal when quickly closed',()=>{
  render();click();click();flush();expect(host.scrollBy).not.toHaveBeenCalled();expect(host.querySelector('summary').getAttribute('aria-expanded')).toBe('false');
});
it('uses immediate scrolling with reduced motion and supports an explicit reveal opt-out',()=>{
  reduced=true;render();click();flush();expect(host.scrollBy).toHaveBeenCalledWith({top:142,behavior:'auto'});
  click();host.scrollBy.mockClear();render({revealOnOpen:false});click();flush();expect(host.scrollBy).not.toHaveBeenCalled();
});
it('ignores a footer outside the visible viewport',()=>{
  footerBox=rect(900,130);render();click();flush();expect(host.scrollBy).toHaveBeenCalledWith({top:12,behavior:'smooth'});
});
it('honors a shifted visual viewport instead of treating its height as the bottom edge',()=>{
  vi.stubGlobal('visualViewport',{offsetTop:80,height:600});footerBox=rect(900,130);
  render();click();flush();expect(host.scrollBy).toHaveBeenCalledWith({top:112,behavior:'smooth'});
});
it('does not pan a covered or zero-height viewport',()=>{
  footerBox=rect(100,650);render({defaultOpen:true});revealDisclosure(host.querySelector('.rook-disclosure'));
  expect(host.scrollBy).not.toHaveBeenCalled();
});
