import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PersonalThemeStudio } from './PersonalThemeStudio.jsx';
import { THEME_PRESETS, normalizePersonalTheme, personalThemeShades, updatePersonalTheme } from './personalThemes.js';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove();root=null;});
const Header=({onClose,closeLabel})=><button onClick={onClose}>{closeLabel}</button>;
const button=(text,scope=host)=>[...scope.querySelectorAll('button')].find(b=>b.textContent.replace(/✓/g,'').trim()===text||b.getAttribute('aria-label')===text);
const click=async(text,scope)=>act(async()=>button(text,scope).click());
async function render(props={}){host=document.createElement('div');document.body.append(host);root=createRoot(host);const apply=vi.fn(),close=vi.fn(),preview=vi.fn();await act(async()=>root.render(<PersonalThemeStudio Header={Header} close={close} apply={apply} preview={preview} initial={{basePalette:'forest',appearance:'dark'}} {...props}/>));return {apply,close,preview};}
it.each(THEME_PRESETS)('$name exposes only its own five accent shades',async preset=>{
  await render({initial:{basePalette:preset.id,appearance:'dark'}});
  expect([...host.querySelectorAll('.pro-theme-accents button')].map(b=>b.getAttribute('aria-label'))).toEqual(personalThemeShades(preset.id).map(s=>s.name));
  expect(host.querySelector('summary').textContent).toBe(`Fine-tune ${preset.name}`);
  expect(host.querySelector('.pro-theme-presets [aria-pressed="true"]').getAttribute('aria-label')).toBe(preset.name);
});
it('Ocean cannot expose Gold, Plum or Terracotta accent options',async()=>{
  await render({initial:{basePalette:'ocean'}});const accents=host.querySelector('.pro-theme-accents');
  for(const name of ['Gold','ROOK Gold','Plum','Terracotta'])expect(button(name,accents)).toBeUndefined();
});
it('previews the draft until Apply, then commits all families exactly once',async()=>{
  const {apply,close,preview}=await render();await click('Ocean',host.querySelector('.pro-theme-presets'));await click('Teal',host.querySelector('.pro-theme-accents'));await click('Warm');
  expect(apply).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(preview).toHaveBeenLastCalledWith(normalizePersonalTheme({basePalette:'ocean',accent:'ocean-teal',base:'warm',appearance:'dark'}));
  expect(host.querySelector('.pro-theme-sample')).toBeNull();await act(async()=>{button('Apply theme').click();button('Apply theme').click();});expect(apply).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
});
it('restores customized Ocean after editing Plum and scopes Reset Ocean to Ocean',async()=>{
  const {preview,apply}=await render({initial:{basePalette:'ocean',appearance:'dark'}});const editor=host.querySelector('details');editor.open=true;
  await click('Teal',host.querySelector('.pro-theme-accents'));await click('Warm');await click('Plum',host.querySelector('.pro-theme-presets'));await click('Mauve',host.querySelector('.pro-theme-accents'));await click('Cool');await click('Ocean',host.querySelector('.pro-theme-presets'));
  expect(button('Teal',host.querySelector('.pro-theme-accents')).getAttribute('aria-pressed')).toBe('true');expect(button('Warm').getAttribute('aria-pressed')).toBe('true');expect(host.querySelector('[role="status"]').textContent).toBe('Ocean · Customized · Warm · Dark');
  expect(button('Ocean',host.querySelector('.pro-theme-presets')).getAttribute('aria-pressed')).toBe('true');await click('Reset Ocean');
  expect(button('Cool').getAttribute('aria-pressed')).toBe('true');expect(button('Reset Ocean').disabled).toBe(true);expect(button('Apply theme').disabled).toBe(false);
  await click('Plum',host.querySelector('.pro-theme-presets'));expect(button('Mauve',host.querySelector('.pro-theme-accents')).getAttribute('aria-pressed')).toBe('true');expect(button('Cool').getAttribute('aria-pressed')).toBe('true');expect(editor.open).toBe(true);
  expect(preview.mock.calls.at(-1)[0].paletteCustomizations.ocean).toEqual({accent:'ocean',base:'cool'});expect(apply).not.toHaveBeenCalled();
});
it.each(['Cancel','Close personal themes'])('%s never applies the draft',async action=>{const {apply,close}=await render();await click('Plum',host.querySelector('.pro-theme-presets'));await click(action);expect(apply).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();});
it('appearance changes preserve all family shades and returning to baseline disables Apply',async()=>{
  const initial=updatePersonalTheme({basePalette:'ocean',appearance:'system'},{accent:'ocean-teal'});const {preview}=await render({initial});expect(button('Apply theme').disabled).toBe(true);
  for(const appearance of ['Light','Dark','System']){await click(appearance);expect(preview.mock.calls.at(-1)[0].paletteCustomizations).toEqual(initial.paletteCustomizations);}
  expect(button('Apply theme').disabled).toBe(true);
});
it('legacy Ocean + Gold opens safely as Ocean with its default Ocean shade',async()=>{
  await render({initial:{basePalette:'ocean',accent:'champagne',base:'warm',appearance:'dark'}});
  expect(button('Ocean',host.querySelector('.pro-theme-presets')).getAttribute('aria-pressed')).toBe('true');expect(button('Ocean',host.querySelector('.pro-theme-accents')).getAttribute('aria-pressed')).toBe('true');expect(host.querySelector('[role="status"]').textContent).toBe('Ocean · Customized · Warm · Dark');
});
it('failed Apply retains the draft for retry',async()=>{
  const apply=vi.fn().mockImplementationOnce(()=>{throw Error('full');});await render({apply});await click('Ocean',host.querySelector('.pro-theme-presets'));await click('Apply theme');expect(host.querySelector('[role="alert"]').textContent).toContain('Couldn’t save');await click('Apply theme');expect(apply).toHaveBeenCalledTimes(2);
});
