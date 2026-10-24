import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {AccountSyncPanel} from './AccountSyncPanel.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
const Modal=({children,close})=><div>{children(close)}</div>;
const account=extra=>({state:'synced',pendingCount:0,linked:true,email:'owner@example.test',providerName:'Google',emailVerified:true,
  canAddPassword:true,addPassword:vi.fn(async()=>({status:'password-added'})),confirmPasswordAccount:vi.fn(async()=>({status:'confirmed'})),...extra});
function render(sync){host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<AccountSyncPanel sync={sync} Modal={Modal}/>));}
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===text||node.querySelector('strong')?.textContent===text);
const click=text=>act(async()=>button(text).click());
function edit(label,value){const field=document.getElementById([...host.querySelectorAll('label')].find(node=>node.textContent===label).htmlFor);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));return field;}
const fill=()=>act(()=>{edit('New password','Synthetic ROOK password 8');edit('Confirm password','Synthetic ROOK password 8');});
const submit=()=>act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
afterEach(()=>{if(root)act(()=>root.unmount());host?.remove();root=null;host=null;vi.restoreAllMocks();});

it('shows a fixed account email and adds a password without asking for a different identity',async()=>{
  const sync=account();render(sync);await click('Add password');
  const email=host.querySelector('input[type=email]');expect(email.value).toBe(sync.email);expect(email.readOnly).toBe(true);
  expect(host.querySelector('input[autocomplete=new-password]')).toBe(document.activeElement);
  await fill();await submit();expect(sync.addPassword).toHaveBeenCalledWith({password:'Synthetic ROOK password 8'});
  expect(host.textContent).toContain('You can now sign in with Google or email.');expect(host.querySelector('form')).toBeNull();
});
it('does not show password enrollment to accounts that cannot safely add it',()=>{
  render(account({canAddPassword:false,hasPassword:true,providerName:'Google & Email'}));expect(button('Add password')).toBeUndefined();
});
it('requires matching new passwords and supports password managers and visibility',async()=>{
  const sync=account();render(sync);await click('Add password');await fill();await act(()=>edit('Confirm password','different'));
  await submit();expect(sync.addPassword).not.toHaveBeenCalled();expect(host.textContent).toContain('passwords do not match');
  expect(host.querySelectorAll('input[autocomplete=new-password]')).toHaveLength(2);
  await click('Show password');expect(host.querySelector('input[autocomplete=new-password]').type).toBe('text');
  await click('Hide password');expect(host.querySelector('input[autocomplete=new-password]').type).toBe('password');
});
it('clears password drafts when canceled and reopened',async()=>{
  const sync=account();render(sync);await click('Add password');await fill();await click('CANCEL');await click('Add password');
  expect([...host.querySelectorAll('input[autocomplete=new-password]')].every(field=>field.value==='')).toBe(true);expect(sync.addPassword).not.toHaveBeenCalled();
});
it('serializes submits, clears secret inputs while pending and keeps navigation disabled',async()=>{
  let resolve;const sync=account({addPassword:vi.fn(()=>new Promise(done=>{resolve=done;}))});render(sync);await click('Add password');await fill();await submit();await submit();
  expect(sync.addPassword).toHaveBeenCalledOnce();expect(button('CANCEL').disabled).toBe(true);expect([...host.querySelectorAll('input[autocomplete=new-password]')].every(field=>field.value==='')).toBe(true);
  await act(async()=>resolve({status:'password-added'}));expect(host.querySelector('form')).toBeNull();
});
it('requests Google confirmation only after recent-login rejection and requires a fresh explicit password submit',async()=>{
  const sync=account({addPassword:vi.fn().mockRejectedValueOnce({code:'auth/requires-recent-login'}).mockResolvedValue({status:'password-added'})});
  render(sync);await click('Add password');await fill();await submit();
  expect(button('CONFIRM WITH GOOGLE')).toBeTruthy();expect(sync.confirmPasswordAccount).not.toHaveBeenCalled();
  await click('CONFIRM WITH GOOGLE');expect(sync.confirmPasswordAccount).toHaveBeenCalledOnce();expect(sync.addPassword).toHaveBeenCalledOnce();
  expect(host.textContent).toContain('Google account confirmed');await fill();await submit();expect(sync.addPassword).toHaveBeenCalledTimes(2);
});
it('keeps canceled Google confirmation retryable without exposing provider messages',async()=>{
  const sync=account({addPassword:vi.fn().mockRejectedValue({code:'auth/requires-recent-login'}),confirmPasswordAccount:vi.fn().mockRejectedValue({code:'auth/popup-closed-by-user',message:'secret provider response'})});
  render(sync);await click('Add password');await fill();await submit();await click('CONFIRM WITH GOOGLE');
  expect(host.textContent).toContain('Confirmation canceled');expect(host.textContent).not.toContain('secret provider');expect(button('CONFIRM WITH GOOGLE').disabled).toBe(false);
});
