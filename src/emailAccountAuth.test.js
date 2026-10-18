import {afterEach,expect,it,vi} from 'vitest';
import {authenticateEmailAccount,emailAccountDetails,emailAccountError,linkEmailAnonymousAccount,resetEmailAccountPassword} from './emailAccountAuth.js';
import {emailPasswordAvailable,availableAccountProviders} from './accountProviders.js';
const details={email:' example@example.test ',password:' Synthetic password 8 ',intent:'register'};
function setup(user=null){
 const auth={currentUser:user};
 const enter=async()=>({user:auth.currentUser={uid:'email-owner',isAnonymous:false,email:'example@example.test',providerData:[{providerId:'password'}],emailVerified:false}});
 return {auth,authApi:{createUserWithEmailAndPassword:vi.fn(enter),signInWithEmailAndPassword:vi.fn(enter),validatePassword:vi.fn(async()=>({isValid:true})),EmailAuthProvider:{credential:(email,password)=>({providerId:'password',email,password})},
 linkWithCredential:vi.fn(async before=>({user:auth.currentUser={...before,isAnonymous:false,providerData:[{providerId:'password'}]}})),sendPasswordResetEmail:vi.fn(async()=>{})}};
}
afterEach(()=>vi.unstubAllEnvs());
it('trims only the email and preserves the actual password',()=>{expect(emailAccountDetails(details)).toEqual({...details,email:'example@example.test'});});
it.each([{email:'invalid',password:'synthetic-password'},{email:'x@example.test',password:''},{email:'x@example.test',password:'short',intent:'register'},{...details,intent:'unknown'}])('rejects invalid input before any Firebase operation: %j',async value=>{
 const client=setup();await expect(authenticateEmailAccount(client,value)).rejects.toBeTruthy();expect(client.authApi.createUserWithEmailAndPassword).not.toHaveBeenCalled();expect(client.authApi.signInWithEmailAndPassword).not.toHaveBeenCalled();
});
it('uses explicit create versus sign-in operations and permits old shorter passwords only for sign-in',async()=>{
 const client=setup();await authenticateEmailAccount(client,details);expect(client.authApi.createUserWithEmailAndPassword).toHaveBeenCalledWith(client.auth,'example@example.test',details.password);
 await authenticateEmailAccount(client,{...details,password:'old',intent:'sign-in'});expect(client.authApi.signInWithEmailAndPassword).toHaveBeenCalledWith(client.auth,'example@example.test','old');
});
it('retains the anonymous UID when registering without creating a second user or signing into a different account',async()=>{
 const before={uid:'local-anonymous',isAnonymous:true},client=setup(before);
 expect(await linkEmailAnonymousAccount(client,details)).toMatchObject({status:'linked',uid:before.uid});
 expect(client.authApi.linkWithCredential).toHaveBeenCalledWith(before,{providerId:'password',email:'example@example.test',password:details.password});
 expect(client.authApi.createUserWithEmailAndPassword).not.toHaveBeenCalled();expect(client.authApi.signInWithEmailAndPassword).not.toHaveBeenCalled();
});
it.each(['auth/email-already-in-use','auth/credential-already-in-use'])('keeps local ownership and does not fall back to sign-in on collision: %s',async code=>{
 const before={uid:'local-anonymous',isAnonymous:true},client=setup(before);client.authApi.linkWithCredential.mockRejectedValueOnce({code});
 expect(await linkEmailAnonymousAccount(client,details)).toEqual({status:'existing-account-conflict',uid:before.uid});expect(client.auth.currentUser).toBe(before);expect(client.authApi.signInWithEmailAndPassword).not.toHaveBeenCalled();
});
it('honors configured Firebase password requirements before creating/linking a user',async()=>{
 const client=setup({uid:'anonymous',isAnonymous:true});client.authApi.validatePassword.mockResolvedValue({isValid:false,containsUppercaseLetter:false,meetsMinPasswordLength:false,passwordPolicy:{customStrengthOptions:{minPasswordLength:12}}});
 await expect(authenticateEmailAccount(client,details)).rejects.toThrow('Use at least 12 characters, an uppercase letter.');
 await expect(linkEmailAnonymousAccount(client,details)).rejects.toThrow('Use at least 12 characters');expect(client.authApi.linkWithCredential).not.toHaveBeenCalled();expect(client.authApi.createUserWithEmailAndPassword).not.toHaveBeenCalled();
});
it('drops a delayed policy response after the account or profile changes',async()=>{
 const client=setup({uid:'anonymous',isAnonymous:true});let current=true;
 client.authApi.validatePassword.mockImplementation(async()=>{current=false;return {isValid:true};});
 await expect(authenticateEmailAccount(client,details,{isCurrent:()=>current})).rejects.toThrow('changed');expect(client.authApi.createUserWithEmailAndPassword).not.toHaveBeenCalled();
 current=true;await expect(linkEmailAnonymousAccount(client,details,{isCurrent:()=>current})).rejects.toThrow('changed');expect(client.authApi.linkWithCredential).not.toHaveBeenCalled();
});
it('does not link an already registered provider account as if it were anonymous',async()=>{
 const client=setup({uid:'google-owner',isAnonymous:false});await expect(linkEmailAnonymousAccount(client,details)).rejects.toThrow('No anonymous');expect(client.authApi.linkWithCredential).not.toHaveBeenCalled();
});
it('returns the same reset acknowledgement for existing and unknown email addresses',async()=>{
 const client=setup();expect(await resetEmailAccountPassword(client,' example@example.test ')).toEqual({status:'reset-requested'});
 client.authApi.sendPasswordResetEmail.mockRejectedValueOnce({code:'auth/user-not-found'});expect(await resetEmailAccountPassword(client,'missing@example.test')).toEqual({status:'reset-requested'});
 expect(client.authApi.signInWithEmailAndPassword).not.toHaveBeenCalled();expect(client.auth.currentUser).toBeNull();
});
it('keeps invalid-credential errors generic and never copies arbitrary server messages',()=>{
 for(const code of ['auth/user-not-found','auth/wrong-password','auth/invalid-credential'])expect(emailAccountError({code,message:'sensitive server details'})).toBe(emailAccountError({code:'auth/invalid-credential'}));
 expect(emailAccountError({code:'unknown',message:'sensitive server details'})).not.toContain('sensitive');
});
it('offers email only after its explicit rollout, with the same native account gate',()=>{
 const env={VITE_ROOK_EMAIL_PASSWORD_ROLLOUT:'true'},web={isNative:false,isIOSNative:false};
 expect(emailPasswordAvailable({platform:web,env})).toBe(true);expect(availableAccountProviders({platform:web,env})).toEqual(['google.com','password']);
 expect(emailPasswordAvailable({platform:{isNative:true},env})).toBe(false);expect(emailPasswordAvailable({platform:{isNative:true},env:{...env,VITE_ROOK_NATIVE_ACCOUNT_SYNC_ROLLOUT:'true'}})).toBe(true);
 expect(availableAccountProviders({platform:web,env:{}})).not.toContain('password');
});
