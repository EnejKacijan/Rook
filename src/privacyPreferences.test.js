import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {privacyPreferences,savePrivacyPreference,initializePrivacyDefaults,requireAiConsent,bindAiConsentPresenter,PRIVACY_KEY} from './privacyPreferences.js';
import {trackFunnelEvent,trackFunnelEventOnce,readFunnelEvents,ANALYTICS_STORAGE_KEY} from './analytics.js';
import {minimizeAiPayload} from './aiDataMinimization.js';
import {ACTIVE_PROFILE_SLOT_KEY} from './profileSlotKeys.js';
import {deleteLocalState} from './localStateStorage.js';
let release;
beforeEach(()=>{localStorage.clear();sessionStorage.clear();});
afterEach(()=>{release?.();release=null;vi.restoreAllMocks();});
it('records no analytics, milestones or adapter events before a deliberate opt-in',()=>{
 const listener=vi.fn();addEventListener('lift:analytics',listener);
 expect(privacyPreferences()).toEqual({analytics:false,ai:false});
 expect(trackFunnelEvent('app_open')).toBe(false);expect(trackFunnelEventOnce('first_plan_viewed')).toBe(false);
 expect(localStorage.getItem(ANALYTICS_STORAGE_KEY)).toBeNull();expect(localStorage.getItem('lift-funnel-once-v1')).toBeNull();expect(listener).not.toHaveBeenCalled();removeEventListener('lift:analytics',listener);
});
it('withdrawal clears event history and both deduplication stores without touching training',()=>{
 localStorage.setItem('lift-v2-state','preserved training');savePrivacyPreference('analytics',true);
 expect(trackFunnelEventOnce('app_open',{},'session')).toBe(true);expect(readFunnelEvents()).toHaveLength(1);
 savePrivacyPreference('analytics',false);
 expect(readFunnelEvents()).toEqual([]);expect(sessionStorage.getItem('lift-funnel-session-once-v1')).toBeNull();expect(localStorage.getItem('lift-v2-state')).toBe('preserved training');
});
it('removes legacy diagnostics on startup when no consent exists and never creates an opt-in',()=>{
 localStorage.setItem(ANALYTICS_STORAGE_KEY,'[{"name":"app_open"}]');initializePrivacyDefaults();
 expect(localStorage.getItem(ANALYTICS_STORAGE_KEY)).toBeNull();expect(localStorage.getItem(PRIVACY_KEY)).toBeNull();
});
it('fails closed on malformed or stale consent and a missing presenter',async()=>{
 localStorage.setItem(PRIVACY_KEY,JSON.stringify({ai:true,aiVersion:'old'}));
 await expect(requireAiConsent()).rejects.toMatchObject({code:'ai-consent-required'});
 localStorage.setItem(PRIVACY_KEY,'bad json');expect(privacyPreferences().ai).toBe(false);
});
it('requires a persisted explicit AI choice, supports withdrawal and rejects a presenter pretending to grant consent',async()=>{
 release=bindAiConsentPresenter(async()=>true);await expect(requireAiConsent()).rejects.toMatchObject({code:'ai-consent-required'});release();
 release=bindAiConsentPresenter(async()=>{savePrivacyPreference('ai',true);return true;});await requireAiConsent();expect(privacyPreferences().ai).toBe(true);
 savePrivacyPreference('ai',false);release();await expect(requireAiConsent()).rejects.toMatchObject({code:'ai-consent-required'});
});
it('an already aborted request never opens a consent prompt',async()=>{
 const presenter=vi.fn(),controller=new AbortController();release=bindAiConsentPresenter(presenter);controller.abort();
 await expect(requireAiConsent({signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});expect(presenter).not.toHaveBeenCalled();
});
it('one local profile cannot inherit another profile’s optional AI or diagnostics permission',()=>{
 savePrivacyPreference('ai',true);savePrivacyPreference('analytics',true);
 localStorage.setItem(ACTIVE_PROFILE_SLOT_KEY,JSON.stringify({version:1,profileId:'different-profile',authAppName:'different-auth'}));
 expect(privacyPreferences()).toEqual({ai:false,analytics:false});savePrivacyPreference('ai',true);
 localStorage.removeItem(ACTIVE_PROFILE_SLOT_KEY);expect(privacyPreferences()).toEqual({ai:true,analytics:true});
});
it('explicit local deletion also removes privacy permissions so a new user starts opted out',async()=>{
 savePrivacyPreference('ai',true);localStorage.setItem(`${PRIVACY_KEY}:archived-profile`,JSON.stringify({ai:true}));
 await deleteLocalState();expect(privacyPreferences()).toEqual({ai:false,analytics:false});expect(localStorage.getItem(`${PRIVACY_KEY}:archived-profile`)).toBeNull();
});
it('strips structured identifiers and display settings while retaining real training constraints and free text',()=>{
 const payload={message:'My own request',profile:{name:'Private Name',id:'profile-private',email:'private@example.test',goal:'Build muscle',avoid:'My chosen restriction',compiledTrainingSafety:{status:'ready'},appearancePreference:'dark'},context:{profile:{name:'Private Name',equipment:['dumbbells'],confirmedPhysiquePriorities:['Back']},workoutId:'required-id'}};
 const safe=minimizeAiPayload(payload);expect(safe.profile).toEqual({goal:'Build muscle',avoid:'My chosen restriction',compiledTrainingSafety:{status:'ready'}});expect(safe.context).toEqual({profile:{equipment:['dumbbells'],confirmedPhysiquePriorities:['Back']},workoutId:'required-id'});
 expect(payload.profile.name).toBe('Private Name');expect(safe.message).toBe(payload.message);
});
