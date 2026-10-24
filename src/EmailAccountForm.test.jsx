import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {EmailAccountForm} from './EmailAccountForm.jsx';
import {FirstRunSignIn} from './App.jsx';
import {AccountSyncLock,AccountSyncPanel} from './AccountSyncPanel.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;const render=element=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(element));};
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const click=async text=>{expect(button(text)).toBeTruthy();await act(async()=>button(text).click());};
const edit=(label,value)=>{const l=[...host.querySelectorAll('label')].find(l=>l.textContent===label),input=[...host.querySelectorAll('input')].find(input=>input.id===l.htmlFor);act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});return input;};
const submit=async()=>act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
const fill=()=>{edit('Email','synthetic@example.test');edit('Password','synthetic-password-8');};
const Modal=({children,close})=><div>{children(close)}</div>;
afterEach(()=>{if(root)act(()=>root.unmount());host?.remove();root=null;});
it('routes email sign-in from first run without invoking Google/Apple',async()=>{
 const signInWithEmail=vi.fn(async()=>({status:'new-account'})),onSignedIn=vi.fn(),social=vi.fn();
 render(<FirstRunSignIn providerReady providers={['google.com','password']} signInWithProvider={social} signInWithEmail={signInWithEmail} onSignedIn={onSignedIn}/>);
 await click('CONTINUE WITH EMAIL');fill();await submit();expect(signInWithEmail).toHaveBeenCalledWith({email:'synthetic@example.test',password:'synthetic-password-8',intent:'sign-in'});expect(onSignedIn).toHaveBeenCalledWith({status:'new-account'});expect(social).not.toHaveBeenCalled();expect(host.querySelector('input[autocomplete="current-password"]').value).toBe('');
});
it('creates an account only from explicit registration and rejects mismatched confirmation',async()=>{
 const onSubmit=vi.fn();render(<EmailAccountForm onSubmit={onSubmit} onBack={()=>{}}/>);await click('New to ROOK? Create an account');fill();edit('Confirm password','different-password');await submit();expect(onSubmit).not.toHaveBeenCalled();expect(host.textContent).toContain('passwords do not match');edit('Confirm password','synthetic-password-8');await submit();expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({intent:'register'}));
});
it('supports password managers and show/hide without changing values',async()=>{
 render(<EmailAccountForm onSubmit={()=>{}} onBack={()=>{}}/>);const field=edit('Password','synthetic-password-8');expect(field.type).toBe('password');expect(field.autocomplete).toBe('current-password');await click('Show password');expect(field.type).toBe('text');expect(field.value).toBe('synthetic-password-8');await click('Hide password');expect(field.type).toBe('password');
});
it('serializes duplicate submits, disables navigation while pending, and reports safe authentication errors',async()=>{
 let reject;const onSubmit=vi.fn(()=>new Promise((_,fail)=>{reject=fail;}));render(<EmailAccountForm onSubmit={onSubmit} onBack={()=>{}}/>);fill();await submit();await submit();expect(onSubmit).toHaveBeenCalledOnce();expect(button('Back to sign-in methods').disabled).toBe(true);await act(async()=>reject({code:'auth/wrong-password',message:'do not expose this'}));expect(host.textContent).toContain('Could not sign in with those details');expect(host.textContent).not.toContain('do not expose');
});
it('offers reset without a password and gives a non-enumerating acknowledgement',async()=>{
 const onReset=vi.fn(async()=>{});render(<EmailAccountForm onSubmit={()=>{}} onReset={onReset} onBack={()=>{}}/>);await click('Forgot password?');edit('Email','synthetic@example.test');expect(host.querySelector('input[type="password"]')).toBeNull();await submit();expect(onReset).toHaveBeenCalledWith('synthetic@example.test');expect(host.textContent).toContain('If a password account uses this email');
});
it('offers only sign-in and reset for a protected existing profile',async()=>{
 const login=vi.fn(async()=>{});render(<AccountSyncLock Modal={Modal} sync={{providers:['google.com','password'],signInToThisDeviceWithEmail:login,resetPasswordWithEmail:vi.fn()}}/>);await click('CONTINUE WITH EMAIL');expect(host.textContent).not.toContain('New to ROOK?');fill();await submit();expect(login).toHaveBeenCalledOnce();
});
it('registers a local anonymous profile through the linking callback and preserves the photo-locality copy',async()=>{
 const registerWithEmail=vi.fn(async()=>({status:'linked'}));render(<AccountSyncPanel Modal={Modal} sync={{state:'synced',pendingCount:0,linked:false,canSecure:true,providers:['google.com','password'],registerWithEmail}}/>);await click('CONTINUE WITH EMAIL');expect(host.textContent).toContain('Create an email account');expect(host.textContent).not.toContain('New to ROOK?');fill();edit('Confirm password','synthetic-password-8');await submit();expect(registerWithEmail).toHaveBeenCalledWith(expect.objectContaining({intent:'register'}));await act(async()=>host.querySelector('[aria-label="Sync information"]').click());expect(document.querySelector('.account-sync-information').textContent).toContain('Workout photos stay on this device');
});
it('shows verification actions for email accounts and preserves normal sign-out',async()=>{
 const verifyEmail=vi.fn(async()=>{}),refreshEmailVerification=vi.fn(async()=>({verified:false}));render(<AccountSyncPanel Modal={Modal} sync={{state:'synced',pendingCount:0,linked:true,providerName:'Email',emailVerified:false,verifyEmail,refreshEmailVerification}}/>);await click('SEND VERIFICATION EMAIL');expect(verifyEmail).toHaveBeenCalledOnce();expect(host.textContent).toContain('Verification email sent');await click('I’VE VERIFIED MY EMAIL');expect(refreshEmailVerification).toHaveBeenCalledOnce();expect(host.textContent).toContain('Email is not verified yet');expect(host.textContent).toContain('Sign out');
});
it('returns to provider methods from email entry and clears the password draft',async()=>{
 render(<FirstRunSignIn providerReady providers={['google.com','password']} signInWithEmail={async()=>{}}/>);await click('CONTINUE WITH EMAIL');fill();expect(host.querySelectorAll('h1')).toHaveLength(1);
 await act(async()=>host.querySelector('button[aria-label="Back to sign-in methods"]').click());expect(button('CONTINUE WITH GOOGLE')).toBeTruthy();await click('CONTINUE WITH EMAIL');expect(host.querySelector('input[autocomplete="current-password"]').value).toBe('');
});
