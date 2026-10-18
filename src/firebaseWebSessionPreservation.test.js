import {afterEach,expect,it,vi} from 'vitest';
const sdk=vi.hoisted(()=>({app:{name:'rook-sync',options:{projectId:'rook-1d2c8',appId:'existing-web-app'}},
  user:{uid:'existing-linked-uid',isAnonymous:false},initialize:vi.fn(),signOut:vi.fn(),native:vi.fn()}));
vi.mock('firebase/app',()=>({getApps:()=>[sdk.app],initializeApp:(...args)=>sdk.initialize(...args)}));
vi.mock('firebase/auth',()=>({getAuth:()=>({currentUser:sdk.user}),signOut:(...args)=>sdk.signOut(...args)}));
vi.mock('firebase/firestore',()=>({getFirestore:()=>({})}));
vi.mock('./platform.js',()=>({rookPlatform:{isNative:false,isIOSNative:false,hasPlugin:()=>false}}));
import {getFirebaseSyncClient} from './firebaseSyncClient.js';
afterEach(()=>vi.unstubAllEnvs());
it('reuses the existing signed-in web app, namespace and user without reinitializing or signing out',async()=>{
  for(const [key,value] of Object.entries({VITE_ROOK_ACCOUNT_SYNC_ROLLOUT:'true',VITE_ROOK_FIREBASE_API_KEY:'synthetic-public-key',
    VITE_ROOK_FIREBASE_AUTH_DOMAIN:'synthetic.firebaseapp.com',VITE_ROOK_FIREBASE_PROJECT_ID:'rook-1d2c8',VITE_ROOK_FIREBASE_APP_ID:'existing-web-app',
    VITE_ROOK_NATIVE_ACCOUNT_SYNC_ROLLOUT:'true'}))vi.stubEnv(key,value);
  const first=await getFirebaseSyncClient();
  expect(first.auth.currentUser).toBe(sdk.user);expect(await getFirebaseSyncClient()).toBe(first);
  expect(sdk.initialize).not.toHaveBeenCalled();expect(sdk.signOut).not.toHaveBeenCalled();
  expect(first.authApi).toBe(await import('firebase/auth'));
});
