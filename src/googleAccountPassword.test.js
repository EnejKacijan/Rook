import { expect, it, vi } from 'vitest';
import {addGoogleAccountPassword,confirmGooglePasswordAccount,canAddGoogleAccountPassword,authenticateEmailAccount,emailAccountError} from './emailAccountAuth.js';

const password='Synthetic new ROOK password 8';
function fixture() {
  const original={uid:'google-owner',isAnonymous:false,email:'owner@example.test',emailVerified:true,providerData:[{providerId:'google.com'}]};
  const auth={currentUser:original};
  const authApi={validatePassword:vi.fn(async()=>({isValid:true})),EmailAuthProvider:{credential:vi.fn((email,password)=>({providerId:'password',email,password}))},
    linkWithCredential:vi.fn(async user=>({user:auth.currentUser={...user,providerData:[...user.providerData,{providerId:'password'}]}})),
    createUserWithEmailAndPassword:vi.fn(),signInWithEmailAndPassword:vi.fn(async()=>({user:auth.currentUser})),
    GoogleAuthProvider:class {setCustomParameters(value){this.parameters=value;}},reauthenticateWithPopup:vi.fn(async()=>({user:auth.currentUser}))};
  return {auth,authApi,original};
}
it('adds email/password to the signed-in Google UID and can sign in with email under that same UID',async()=>{
  const client=fixture();
  expect(await addGoogleAccountPassword(client,{password,email:'ignored-other@example.test'})).toMatchObject({status:'password-added',uid:'google-owner'});
  expect(client.authApi.linkWithCredential).toHaveBeenCalledWith(client.original,{providerId:'password',email:'owner@example.test',password});
  expect(client.authApi.createUserWithEmailAndPassword).not.toHaveBeenCalled();
  expect(client.authApi.signInWithEmailAndPassword).not.toHaveBeenCalled();
  expect(client.auth.currentUser.providerData.map(p=>p.providerId)).toEqual(['google.com','password']);
  expect((await authenticateEmailAccount(client,{email:'owner@example.test',password})).user.uid).toBe('google-owner');
});
it.each([null,{isAnonymous:true},{uid:'email',isAnonymous:false,email:'owner@example.test',emailVerified:true,providerData:[{providerId:'password'}]},
  {uid:'google',isAnonymous:false,email:'owner@example.test',emailVerified:false,providerData:[{providerId:'google.com'}]}])('rejects ineligible identities before touching credentials: %j',async user=>{
  const client=fixture();client.auth.currentUser=user;expect(canAddGoogleAccountPassword(user)).toBe(false);
  await expect(addGoogleAccountPassword(client,{password})).rejects.toMatchObject({code:'auth-failed'});
  expect(client.authApi.linkWithCredential).not.toHaveBeenCalled();
});
it('does not replace a password that already exists',async()=>{
  const client=fixture();client.auth.currentUser.providerData.push({providerId:'password'});
  await expect(addGoogleAccountPassword(client,{password})).rejects.toBeTruthy();expect(client.authApi.linkWithCredential).not.toHaveBeenCalled();
});
it('checks server password rules before linking',async()=>{
  const client=fixture();client.authApi.validatePassword.mockResolvedValue({isValid:false,meetsMinPasswordLength:false,passwordPolicy:{customStrengthOptions:{minPasswordLength:12}}});
  await expect(addGoogleAccountPassword(client,{password})).rejects.toMatchObject({code:'auth/weak-password',message:'Use at least 12 characters.'});
  expect(client.authApi.linkWithCredential).not.toHaveBeenCalled();
});
it.each(['policy','link'])('refuses stale account/profile results during %s',async stage=>{
  const client=fixture();let current=true;
  const change=async()=>{current=false;return stage==='policy'?{isValid:true}:{user:client.original};};
  client.authApi[stage==='policy'?'validatePassword':'linkWithCredential'].mockImplementation(change);
  await expect(addGoogleAccountPassword(client,{password},{isCurrent:()=>current})).rejects.toMatchObject({code:'auth-failed'});
  if(stage==='policy')expect(client.authApi.linkWithCredential).not.toHaveBeenCalled();
});
it('rejects an account switch while checking password policy',async()=>{
  const client=fixture();client.authApi.validatePassword.mockImplementation(async()=>{client.auth.currentUser={...client.original,uid:'different-owner'};return {isValid:true};});
  await expect(addGoogleAccountPassword(client,{password})).rejects.toMatchObject({code:'auth-failed'});expect(client.authApi.linkWithCredential).not.toHaveBeenCalled();
});
it.each(['auth/credential-already-in-use','auth/email-already-in-use','auth/account-exists-with-different-credential'])('keeps collisions separate with no create or sign-in fallback: %s',async code=>{
  const client=fixture();client.authApi.linkWithCredential.mockRejectedValue({code,message:'private provider details'});
  await expect(addGoogleAccountPassword(client,{password})).rejects.toMatchObject({code:'password-link-conflict'});
  expect(client.auth.currentUser).toBe(client.original);expect(client.authApi.createUserWithEmailAndPassword).not.toHaveBeenCalled();expect(client.authApi.signInWithEmailAndPassword).not.toHaveBeenCalled();
});
it('requires a fresh Google confirmation when the SDK requests it, then retries only after a new explicit submit',async()=>{
  const client=fixture();client.authApi.linkWithCredential.mockRejectedValueOnce({code:'auth/requires-recent-login'});
  await expect(addGoogleAccountPassword(client,{password})).rejects.toMatchObject({code:'auth/requires-recent-login'});
  expect(client.authApi.reauthenticateWithPopup).not.toHaveBeenCalled();
  expect(await confirmGooglePasswordAccount(client)).toEqual({status:'confirmed',uid:'google-owner'});
  expect(client.authApi.reauthenticateWithPopup.mock.calls[0][0]).toBe(client.original);
  expect(client.authApi.reauthenticateWithPopup.mock.calls[0][1].parameters).toEqual({prompt:'select_account'});
  await addGoogleAccountPassword(client,{password});expect(client.authApi.linkWithCredential).toHaveBeenCalledTimes(2);
});
it('rejects a different Google account confirmation and exposes no provider details',async()=>{
  const client=fixture();client.authApi.reauthenticateWithPopup.mockResolvedValue({user:{uid:'different-owner'}});
  await expect(confirmGooglePasswordAccount(client)).rejects.toMatchObject({code:'auth/user-mismatch'});
  expect(client.authApi.linkWithCredential).not.toHaveBeenCalled();
  expect(emailAccountError({code:'unknown',message:password})).not.toContain(password);
});
