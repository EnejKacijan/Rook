import { rookPlatform } from './platform.js';

export const GOOGLE_ACCOUNT_PROVIDER = 'google.com';
export const accountProviderName = id => id==='password'?'Email':'Google';
export function emailPasswordAvailable({platform=rookPlatform,env=import.meta.env||{}}={}){
  return env.VITE_ROOK_EMAIL_PASSWORD_ROLLOUT==='true'&&(!platform.isNative||env.VITE_ROOK_NATIVE_ACCOUNT_SYNC_ROLLOUT==='true');
}

export function createAccountProvider(authApi, id = GOOGLE_ACCOUNT_PROVIDER) {
  if (id === GOOGLE_ACCOUNT_PROVIDER) {
    const provider = new authApi.GoogleAuthProvider();
    provider.setCustomParameters?.({ prompt: 'select_account' });
    return provider;
  }
  throw new Error('This sign-in method is not supported.');
}

export function availableAccountProviders({ platform = rookPlatform, env = import.meta.env || {} } = {}) {
  const providers = [];
  if (!platform.isNative) providers.push(GOOGLE_ACCOUNT_PROVIDER);
  if (emailPasswordAvailable({platform,env})) providers.push('password');
  return providers;
}
