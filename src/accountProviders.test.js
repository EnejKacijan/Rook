import { expect,it } from 'vitest';
import { availableAccountProviders,createAccountProvider } from './accountProviders.js';
it('uses Google alone by default and cannot enable an unfinished provider through environment flags',()=>{
  const web={isNative:false};
  expect(availableAccountProviders({platform:web,env:{}})).toEqual(['google.com']);
  expect(availableAccountProviders({platform:web,env:{VITE_ROOK_WEB_APPLE_SIGN_IN_ROLLOUT:'true'}})).toEqual(['google.com']);
  expect(availableAccountProviders({platform:web,env:{VITE_ROOK_WEB_APPLE_SIGN_IN_ROLLOUT:'true',VITE_ROOK_APPLE_TEAM_ID:'ABC123DE45',VITE_ROOK_APPLE_SERVICE_ID:'com.example.rook.web'}})).toEqual(['google.com']);
});
it('retains the existing Google selector and rejects unsupported providers',()=>{
  class GoogleAuthProvider {setCustomParameters(value){this.parameters=value;}}
  class OAuthProvider {constructor(id){this.providerId=id;this.scopes=[];}addScope(value){this.scopes.push(value);}}
  const api={GoogleAuthProvider,OAuthProvider};
  expect(createAccountProvider(api).parameters).toEqual({prompt:'select_account'});
  expect(()=>createAccountProvider(api,'apple.com')).toThrow(/not supported/);
  expect(()=>createAccountProvider(api,'unrelated')).toThrow(/not supported/);
});
