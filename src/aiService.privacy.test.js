import {afterEach,it,expect,vi} from 'vitest';
const authorization=vi.hoisted(()=>({get:vi.fn(async()=>({authorization:'Bearer synthetic'}))}));
vi.mock('./aiAuthorization.js',()=>({aiAuthorizationHeaders:()=>authorization.get()}));
import {AIService} from './aiService.js';
import {savePrivacyPreference,bindAiConsentPresenter} from './privacyPreferences.js';
import {createReturningUserFixture} from './demoFixture.js';
let release;
afterEach(()=>{release?.();release=null;authorization.get.mockReset().mockResolvedValue({authorization:'Bearer synthetic'});vi.restoreAllMocks();vi.unstubAllGlobals();});
it('sends no restriction text, authorization or API request before explicit AI consent',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await expect(AIService.analyzeTrainingSafety('Synthetic private restriction')).rejects.toMatchObject({code:'ai-consent-required'});
 expect(fetch).not.toHaveBeenCalled();expect(authorization.get).not.toHaveBeenCalled();
});
it('a declined consent prompt leaves health text entirely on the device',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);release=bindAiConsentPresenter(async()=>false);
 await expect(AIService.analyzeTrainingSafety('Synthetic restriction')).rejects.toMatchObject({code:'ai-consent-required'});expect(fetch).not.toHaveBeenCalled();
});
it('declining plan-generation consent is respected once rather than reopening the prompt for retries',async()=>{
 const fetch=vi.fn(),present=vi.fn(async()=>false);vi.stubGlobal('fetch',fetch);vi.spyOn(AIService,'status').mockResolvedValue({available:true});release=bindAiConsentPresenter(present);
 await expect(AIService.generateTrainingPlan(createReturningUserFixture(0).profile)).rejects.toMatchObject({code:'ai-consent-required'});expect(present).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();
});
it('withdrawal during token refresh prevents the late payload submission',async()=>{
 savePrivacyPreference('ai',true);let ready;authorization.get.mockImplementation(()=>new Promise(resolve=>{ready=resolve;}));const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const pending=AIService.analyzeTrainingSafety('Synthetic restriction'),rejected=expect(pending).rejects.toMatchObject({code:'ai-consent-required'});
 for(let i=0;i<10&&!ready;i++)await Promise.resolve();expect(ready).toBeTypeOf('function');savePrivacyPreference('ai',false);ready({authorization:'Bearer synthetic'});await rejected;expect(fetch).not.toHaveBeenCalled();
});
it('a consented real Coach request excludes structured name/contact data while retaining workout identifiers',async()=>{
 savePrivacyPreference('ai',true);const state=createReturningUserFixture(0);state.profile.name='PRIVATE NAME';state.profile.email='private@example.test';
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{text:'Here is your recent training.',action:null}})});vi.stubGlobal('fetch',fetch);
 await AIService.coach(state,'Please suggest a useful recovery routine.',{requireRemoteSuccess:true});
 expect(fetch).toHaveBeenCalledOnce();const payload=JSON.parse(fetch.mock.calls[0][1].body).payload;
 expect(payload.context.profile.name).toBeUndefined();expect(payload.context.profile.email).toBeUndefined();expect(payload.context.profile.equipment).toEqual(state.profile.equipment);expect(JSON.stringify(payload)).not.toContain('PRIVATE NAME');
});
