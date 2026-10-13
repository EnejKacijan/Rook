import {afterEach,expect,it,vi} from 'vitest';
const authorization=vi.hoisted(()=>({get:vi.fn(async()=>({authorization:'Bearer synthetic'}))}));
vi.mock('./aiAuthorization.js',()=>({aiAuthorizationHeaders:()=>authorization.get()}));
import {AIService,preparePhysiquePhoto} from './aiService.js';
import {blankState} from './domain.js';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();authorization.get.mockReset().mockResolvedValue({authorization:'Bearer synthetic'});});
const imageFile=()=>new Blob(['synthetic'],{type:'image/jpeg'});
const unstructuredNotes='A totally unstructured prescription needing interpretation';
const imageUrls=()=>{const created=vi.fn(()=> 'blob:synthetic-photo'),revoked=vi.fn();vi.stubGlobal('URL',{createObjectURL:created,revokeObjectURL:revoked});return {created,revoked};};

it('a pre-cancelled import makes no status, authorization or API request',async()=>{
 const controller=new AbortController();controller.abort();
 const status=vi.spyOn(AIService,'status');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await expect(AIService.importTrainingPlan(blankState().profile,unstructuredNotes,{signal:controller.signal})).rejects.toThrow('Import cancelled. Your notes are still here.');
 expect(status).not.toHaveBeenCalled();expect(authorization.get).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it('cancellation during awaited preflight prevents authorization and late API submission',async()=>{
 const controller=new AbortController();let ready;
 vi.spyOn(AIService,'status').mockImplementation(()=>new Promise(resolve=>{ready=resolve;}));
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const pending=AIService.importTrainingPlan(blankState().profile,unstructuredNotes,{signal:controller.signal});
 const rejected=expect(pending).rejects.toThrow('Import cancelled. Your notes are still here.');
 controller.abort();ready({available:true});await rejected;
 expect(authorization.get).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it('cancellation while authorization is pending cannot submit after authorization resolves',async()=>{
 const controller=new AbortController();let tokenReady;
 vi.spyOn(AIService,'status').mockResolvedValue({available:true});
 authorization.get.mockImplementation(()=>new Promise(resolve=>{tokenReady=resolve;}));
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const pending=AIService.importTrainingPlan(blankState().profile,unstructuredNotes,{signal:controller.signal});
 const rejected=expect(pending).rejects.toThrow('Import cancelled. Your notes are still here.');
 while(!tokenReady)await Promise.resolve();controller.abort();await rejected;
 tokenReady({authorization:'Bearer synthetic'});await Promise.resolve();await Promise.resolve();
 expect(fetch).not.toHaveBeenCalled();
});
it('fallback decode failure releases its URL and retains the readable-format error',async()=>{
 vi.stubGlobal('createImageBitmap',undefined);const urls=imageUrls();
 vi.stubGlobal('Image',class{set src(value){queueMicrotask(()=>this.onerror());}});
 await expect(preparePhysiquePhoto(imageFile())).rejects.toThrow('That image format could not be read.');
 expect(urls.created).toHaveBeenCalledOnce();expect(urls.revoked).toHaveBeenCalledExactlyOnceWith('blob:synthetic-photo');
});
it('fallback drawing failure releases its URL',async()=>{
 vi.stubGlobal('createImageBitmap',undefined);const urls=imageUrls();
 vi.stubGlobal('Image',class{width=400;height=300;set src(value){queueMicrotask(()=>this.onload());}});
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage(){throw new Error('Synthetic drawing failure');}});
 await expect(preparePhysiquePhoto(imageFile())).rejects.toThrow('Synthetic drawing failure');
 expect(urls.revoked).toHaveBeenCalledExactlyOnceWith('blob:synthetic-photo');
});
it.each(['drawing','encoding'])('bitmap is closed if %s fails',async phase=>{
 const bitmap={width:400,height:300,close:vi.fn()};vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue(bitmap));
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage(){if(phase==='drawing')throw new Error('Synthetic drawing failure');}});
 vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockImplementation(()=>{throw new Error('Synthetic encoding failure');});
 await expect(preparePhysiquePhoto(imageFile())).rejects.toThrow(`Synthetic ${phase} failure`);
 expect(bitmap.close).toHaveBeenCalledOnce();
});
it.each(['bitmap','fallback'])('successful %s preparation preserves resize/output and releases resources once',async mode=>{
 const close=vi.fn(),urls=imageUrls();
 if(mode==='bitmap')vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({width:2560,height:1280,close}));
 else {vi.stubGlobal('createImageBitmap',undefined);vi.stubGlobal('Image',class{width=2560;height=1280;set src(value){queueMicrotask(()=>this.onload());}});}
 const draw=vi.fn();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:draw});
 const encoded=vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/jpeg;base64,synthetic');
 expect(await preparePhysiquePhoto(imageFile())).toBe('data:image/jpeg;base64,synthetic');
 expect(draw).toHaveBeenCalledWith(expect.anything(),0,0,1280,640);expect(encoded).toHaveBeenCalledExactlyOnceWith('image/jpeg',0.78);
 if(mode==='bitmap'){expect(close).toHaveBeenCalledOnce();expect(urls.created).not.toHaveBeenCalled();expect(urls.revoked).not.toHaveBeenCalled();}
 else {expect(urls.revoked).toHaveBeenCalledExactlyOnceWith('blob:synthetic-photo');expect(close).not.toHaveBeenCalled();}
});
