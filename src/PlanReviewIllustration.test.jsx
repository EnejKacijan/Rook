import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PlanReviewIllustration, canonicalPlanReviewArt } from './PlanReviewIllustration.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const catalog={press:{artId:'press'}};
const resolveArt=vi.fn(()=>'/local-press.svg');
let root,host;
afterEach(()=>{if(root)act(()=>root.unmount());host?.remove();root=null;vi.clearAllMocks();});
function render(props={}){host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<PlanReviewIllustration exercise={{exerciseId:'press'}} catalog={catalog} resolveArt={resolveArt} name="Press" {...props}/>));}
it('is opt-in and respects disabled images',()=>{render();expect(host.querySelector('img')).toBeNull();expect(resolveArt).not.toHaveBeenCalled();});
it('uses only a canonical ID and lazy decorative thumbnail',()=>{render({enabled:true});expect(resolveArt).toHaveBeenCalledWith({exerciseId:'press'});expect(host.querySelector('img').getAttribute('loading')).toBe('lazy');expect(host.querySelector('img').alt).toBe('');expect(host.querySelector('img').width).toBe(48);});
it('shows a labelled 120px image in expanded content',()=>{render({enabled:true,expanded:true});expect(host.querySelector('img').width).toBe(120);expect(host.querySelector('img').alt).toBe('Press illustration');});
it('omits broken assets without empty image chrome',()=>{render({enabled:true});act(()=>host.querySelector('img').dispatchEvent(new Event('error')));expect(host.innerHTML).toBe('');});
it.each([{exerciseId:'missing',importedName:'Press'},{exerciseId:'press',exerciseSource:'custom'},{exerciseId:'press',matchStatus:'unresolved'},{exerciseId:'press',matchStatus:'needs-name-review'}])('never guesses artwork for %j',exercise=>{expect(canonicalPlanReviewArt(exercise,catalog,resolveArt)).toBeNull();expect(resolveArt).not.toHaveBeenCalled();});
