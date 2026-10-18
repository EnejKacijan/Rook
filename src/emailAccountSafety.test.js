import {afterEach,expect,it,vi} from 'vitest';
import {blankState,hydrateStoredState,saveState} from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';
import {PRIMARY_KEY,RECOVERY_KEY,checkpointCurrentLocalState} from './localStateStorage.js';
import {ensureAccountSyncLedger,readAccountSyncLedger} from './accountSyncOutbox.js';
import {openProtectedAccount} from './accountProfileAccess.js';
import {signInFirstRunAccount} from './firstRunAccountSignIn.js';
import {authenticateEmailAccount} from './emailAccountAuth.js';
import {readFirstRunAccountClaim} from './firstRunAccountClaim.js';
import {accountRestoreActions} from './accountStartup.js';
const details={email:'synthetic@example.test',password:'synthetic-password-8',intent:'sign-in'};
const clientFor=(uid='email-owner')=>{
 const auth={currentUser:null};const login=async()=>({user:auth.currentUser={uid,isAnonymous:false,email:details.email,providerData:[{providerId:'password'}]}});
 return {auth,authApi:{signInWithEmailAndPassword:vi.fn(login),createUserWithEmailAndPassword:vi.fn(login),signOut:vi.fn(async()=>{auth.currentUser=null;})}};
};
const authenticate=(client,isCurrent)=>authenticateEmailAccount(client,details,{isCurrent});
afterEach(()=>vi.unstubAllEnvs());
it('claims a positively empty email account without copying credentials into local state',async()=>{
 const state=blankState(),client=clientFor(),save=vi.fn();
 expect(await signInFirstRunAccount({client,storage:localStorage,getState:()=>state,authenticate,readLocal:()=>({status:'empty'}),readCloud:async()=>({profileId:null,accountSchemaVersion:null,entities:new Map()}),save})).toMatchObject({status:'new-account',uid:'email-owner'});
 expect(readFirstRunAccountClaim(localStorage)).toMatchObject({uid:'email-owner',profileId:state.profile.id});expect(save).not.toHaveBeenCalled();
 expect(JSON.stringify(Object.entries(localStorage))).not.toContain(details.password);
});
it('restores the existing email account lineage and history via the canonical first-run transaction',async()=>{
 const state=blankState(),client=clientFor(),save=vi.fn(()=>true),bind=vi.fn(),restored={...state,profile:{...state.profile,id:'saved-email-profile'},workouts:[{id:'historical-workout'}]};
 const result=await signInFirstRunAccount({client,storage:localStorage,getState:()=>state,authenticate,readLocal:()=>({status:'empty'}),readCloud:async()=>({profileId:restored.profile.id,accountSchemaVersion:1,entities:new Map()}),materialize:()=>restored,save,bind});
 expect(result.restored.workouts[0].id).toBe('historical-workout');expect(bind).toHaveBeenCalledWith(localStorage,restored.profile.id,{accountUid:'email-owner'});
});
it.each(['email-owner','different-owner'])('checks owner UID rather than matching email when reopening a protected profile: %s',async uid=>{
 const state=createReturningUserFixture(1);expect(saveState(state,{storage:localStorage,reason:'test-owner'})).toBe(true);checkpointCurrentLocalState(localStorage,hydrateStoredState);ensureAccountSyncLedger(localStorage,state.profile.id,{accountUid:'email-owner'});localStorage.setItem('rook-account-signed-out-v1','true');
 const raw=localStorage.getItem(PRIMARY_KEY),backup=localStorage.getItem(RECOVERY_KEY),client=clientFor(uid),readCloud=vi.fn();
 const operation=openProtectedAccount({client,storage:localStorage,profileId:state.profile.id,authenticate,readCloud});
 if(uid==='email-owner')expect(await operation).toMatchObject({status:'unlocked'});else{await expect(operation).rejects.toThrow('not the account that owns');expect(localStorage.getItem('rook-account-signed-out-v1')).toBe('true');}
 expect(localStorage.getItem(PRIMARY_KEY)).toBe(raw);expect(localStorage.getItem(RECOVERY_KEY)).toBe(backup);expect(readAccountSyncLedger(localStorage,state.profile.id).accountUid).toBe('email-owner');expect(readCloud).not.toHaveBeenCalled();
});
it('offers sign-in and reset in startup recovery without any popup or provider detection by email',async()=>{
 vi.stubEnv('VITE_ROOK_EMAIL_PASSWORD_ROLLOUT','true');const client=clientFor();client.authApi.sendPasswordResetEmail=vi.fn(async()=>{});const actions=accountRestoreActions(client);
 expect(actions.accountProviders).toContain('password');await actions.restoreWithEmail({...details,intent:'register'});expect(client.authApi.signInWithEmailAndPassword).toHaveBeenCalledOnce();expect(client.authApi.createUserWithEmailAndPassword).not.toHaveBeenCalled();await actions.resetPasswordWithEmail(details.email);expect(client.authApi.sendPasswordResetEmail).toHaveBeenCalledOnce();
});
