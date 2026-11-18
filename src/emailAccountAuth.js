import { createAccountProvider } from './accountProviders.js';

const fail = (code,message) => Object.assign(new Error(message),{code});
const minimumEmailPasswordLength = 8;
const pendingPasswordValidations = new WeakMap();
const signInRejectionCodes = new Set([
  'auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/user-disabled',
]);
export function isEmailSignInRejection(error) {
  return signInRejectionCodes.has(error?.code);
}

export function isEmailPasswordPolicyRejection(error) {
  return error?.code === 'auth/weak-password' || error?.code === 'auth/password-does-not-meet-requirements';
}

export function emailAccountDetails({email,password,intent='sign-in'} = {}) {
  const address=typeof email==='string'?email.trim():'';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||address.length>254)
    throw fail('auth/invalid-email','Enter a valid email address.');
  if(!['sign-in','register'].includes(intent))throw fail('auth/invalid-argument','Choose sign in or create account.');
  if(typeof password!=='string'||!password.length)throw fail('auth/missing-password','Enter your password.');
  if(intent==='register'&&password.length<minimumEmailPasswordLength)
    throw fail('auth/weak-password',`Use at least ${minimumEmailPasswordLength} characters for your password.`);
  return {email:address,password,intent};
}
export function emailAccountError(error) {
  if(isEmailSignInRejection(error))
    return 'Could not sign in with those details. Check your email and password, or reset your password.';
  if(isEmailPasswordPolicyRejection(error))
    return error.message?.startsWith('Use ')?error.message:'Use a stronger password. Follow the password requirements and try again.';
  switch(error?.code){
    case 'auth/invalid-email':return 'Enter a valid email address.';
    case 'auth/missing-password':return 'Enter your password.';
    case 'auth/email-already-in-use':case 'auth/account-exists-with-different-credential':case 'auth/credential-already-in-use':
      return 'Could not create this account. Try signing in, resetting your password, or using your original sign-in method.';
    case 'auth/too-many-requests':return 'Too many attempts. Wait a little before trying again.';
    case 'auth/network-request-failed':return 'Could not connect. Check your connection and try again.';
    case 'auth/operation-not-allowed':return 'Email sign-in is not available for ROOK yet. Choose another sign-in method.';
    case 'auth/requires-recent-login':return 'Confirm your Google account, then enter your new password again.';
    case 'auth/user-mismatch':return 'Choose the Google account already connected to this ROOK profile.';
    case 'auth/provider-already-linked':return 'Email sign-in is already enabled. Use your existing ROOK password or reset it from the sign-in screen.';
    case 'password-link-conflict':return 'Could not add a password to this account. Continue with Google; your training is unchanged.';
    default:return 'The account action could not finish. Your saved profile has not been replaced. Try again.';
  }
}
export function canAddGoogleAccountPassword(user) {
  return Boolean(user && !user.isAnonymous && user.emailVerified === true && user.email &&
    user.providerData?.some(provider => provider.providerId === 'google.com') &&
    !user.providerData?.some(provider => provider.providerId === 'password'));
}

function googlePasswordOwner(client, isCurrent) {
  const user = client?.auth.currentUser;
  if (!canAddGoogleAccountPassword(user)) throw fail('auth-failed','Open your verified Google account before adding a password.');
  const email = user.email;
  const assertCurrent = () => {
    if (!isCurrent() || client.auth.currentUser?.uid !== user.uid || client.auth.currentUser?.email !== email)
      throw fail('auth-failed','Your account changed. Reopen password settings.');
  };
  assertCurrent();
  return { user, email, assertCurrent };
}

// Link to the signed-in UID. Never sign in, create an account, change email,
// merge profiles, or store credentials in training data during this operation.
export async function addGoogleAccountPassword(client, { password }, { isCurrent = () => true } = {}) {
  const { user, email, assertCurrent } = googlePasswordOwner(client, isCurrent);
  emailAccountDetails({ email, password, intent:'register' });
  await checkPasswordPolicy(client, password);
  assertCurrent();
  if (!canAddGoogleAccountPassword(client.auth.currentUser)) throw fail('auth/provider-already-linked','Email sign-in is already enabled.');
  try {
    const result = await client.authApi.linkWithCredential(user, client.authApi.EmailAuthProvider.credential(email, password));
    assertCurrent();
    if (result.user?.uid !== user.uid || result.user?.email !== email) throw fail('auth-failed','Account identity changed during linking.');
    return { status:'password-added', uid:user.uid, user:result.user };
  } catch (error) {
    assertCurrent();
    if (['auth/credential-already-in-use','auth/email-already-in-use','auth/account-exists-with-different-credential'].includes(error.code))
      throw fail('password-link-conflict','Could not add a password to this account.');
    throw error;
  }
}

export async function confirmGooglePasswordAccount(client, { isCurrent = () => true } = {}) {
  const { user, assertCurrent } = googlePasswordOwner(client, isCurrent);
  const result = await client.authApi.reauthenticateWithPopup(user, createAccountProvider(client.authApi, 'google.com'));
  assertCurrent();
  if (result.user?.uid !== user.uid) throw fail('auth/user-mismatch','Choose the connected Google account.');
  return { status:'confirmed', uid:user.uid };
}
export function emailPasswordRequirements(password, status) {
  const options = status?.passwordPolicy?.customStrengthOptions;
  const minimum = Math.max(minimumEmailPasswordLength, options?.minPasswordLength ?? 0);
  const rules=[];
  if(password.length < minimum || status?.meetsMinPasswordLength === false) rules.push(`at least ${minimum} characters`);
  if(status?.meetsMaxPasswordLength === false) rules.push(`at most ${options?.maxPasswordLength ?? 4096} characters`);
  for(const [key,text] of [['containsLowercaseLetter','a lowercase letter'],['containsUppercaseLetter','an uppercase letter'],['containsNumericCharacter','a number'],['containsNonAlphanumericCharacter','a symbol']]) {
    if(status?.[key] === false) rules.push(text);
  }
  return rules;
}

async function validateFirebasePassword(client, password) {
  if (!client?.authApi.validatePassword) return;
  // Firebase caches the rules once loaded. Concurrent edits share the initial fetch.
  const pending = pendingPasswordValidations.get(client);
  if (pending) {
    await pending;
    return client.authApi.validatePassword(client.auth, password);
  }
  const validation = client.authApi.validatePassword(client.auth, password);
  pendingPasswordValidations.set(client, validation);
  try { return await validation; }
  finally { pendingPasswordValidations.delete(client); }
}

export async function getEmailPasswordRequirements(client, password) {
  return emailPasswordRequirements(password, await validateFirebasePassword(client, password));
}

async function checkPasswordPolicy(client,password){
  const status = await validateFirebasePassword(client, password);
  if (!status || status.isValid) return;
  const rules = emailPasswordRequirements(password, status);
  throw fail('auth/weak-password',rules.length?`Use ${rules.join(', ')}.`:'Use a stronger password.');
}
// Credentials exist only for this explicit operation. The canonical callers
// still own profile/UID guards, cloud reads, recovery and namespace switching.
export async function authenticateEmailAccount(client,details,{isCurrent=()=>true}={}){
  if(!client)throw fail('auth/operation-not-allowed','Email sign-in is unavailable.');
  const {email,password,intent}=emailAccountDetails(details);
  const before=client.auth.currentUser;
  if(intent==='register')await checkPasswordPolicy(client,password);
  if(!isCurrent()||client.auth.currentUser!==before)throw fail('auth-failed','The account or profile changed before sign-in.');
  const result=await (intent==='register'?client.authApi.createUserWithEmailAndPassword(client.auth,email,password)
    :client.authApi.signInWithEmailAndPassword(client.auth,email,password));
  if(!isCurrent()||client.auth.currentUser?.uid!==result.user?.uid)throw fail('auth-failed','The account or profile changed during sign-in.');
  return result;
}
export async function linkEmailAnonymousAccount(client,details,{isCurrent=()=>true}={}){
  const before=client?.auth.currentUser;
  if(!before?.isAnonymous)throw fail('auth-failed','No anonymous ROOK account to link.');
  const {email,password}=emailAccountDetails({...details,intent:'register'});
  await checkPasswordPolicy(client,password);
  if(!isCurrent()||client.auth.currentUser!==before)throw fail('auth-failed','The account changed before linking.');
  try{
    const result=await client.authApi.linkWithCredential(before,client.authApi.EmailAuthProvider.credential(email,password));
    if(result.user.uid!==before.uid||client.auth.currentUser?.uid!==before.uid)throw fail('auth-failed','Account identity changed during linking.');
    return {status:'linked',uid:before.uid,user:result.user};
  }catch(error){
    if(client.auth.currentUser?.uid!==before.uid)throw fail('auth-failed','Account identity changed during linking.');
    if(['auth/credential-already-in-use','auth/email-already-in-use','auth/account-exists-with-different-credential'].includes(error.code))return {status:'existing-account-conflict',uid:before.uid};
    throw error;
  }
}
export async function resetEmailAccountPassword(client,email){
  const address=typeof email==='string'?email.trim():'';
  emailAccountDetails({email:address,password:'validation-only'});
  if(!client)throw fail('auth/operation-not-allowed','Email sign-in is unavailable.');
  try{await client.authApi.sendPasswordResetEmail(client.auth,address);}
  catch(error){if(error?.code!=='auth/user-not-found')throw error;}
  // Same response whether an address exists; do not query sign-in methods.
  return {status:'reset-requested'};
}
