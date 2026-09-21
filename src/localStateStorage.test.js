import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { blankState, serializeState, hydrateStoredState, readStartupState, saveState } from './domain.js';
import { dataReliabilityFixture } from './dataReliability.fixture.js';
import { PRIMARY_KEY as P, INSTALL_META_KEY as M, RECOVERY_KEY as B, JOURNAL_KEY as J, MAX_RECOVERY_CHARS, persistLocalState, readLocalState, readRecovery, restoreLocalCheckpoint, deleteLocalState, storageDiagnostics, inspectStorageProtection, forgetStorageSession, withStorageTransaction } from './localStateStorage.js';
import { commitPreparedRestore } from './backup.js';
import { beginRestoreTransaction, recoverInterruptedRestore } from './restoreTransaction.js';

class MemoryStorage {
  constructor(entries=[]) {this.values=new Map(entries);this.ops=[];}
  getItem(key) {this.ops.push(['get',key]);return this.values.get(key)??null;}
  setItem(key,value) {this.ops.push(['set',key]);this.values.set(key,String(value));}
  removeItem(key) {this.ops.push(['remove',key]);this.values.delete(key);}
}
let fixture, raw;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-18T12:00:00Z'));fixture=dataReliabilityFixture();raw=serializeState(fixture);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
const writes=storage=>storage.ops.filter(([op])=>op!=='get');
const save=(storage,state=fixture,options={})=>persistLocalState(serializeState(state),{storage,hydrate:hydrateStoredState,...options});
function seeded() {const storage=new MemoryStorage([[P,raw]]);expect(readStartupState(storage).status).toBe('ready');const next=structuredClone(fixture);next.activeWorkout.exercises[0].sets[1].reps=10;expect(save(storage,next)).toBe(true);return storage;}

it('recovers the complete prior valid state, with bounded compressed metadata and safe ordering',()=>{
  const storage=seeded();expect(writes(storage).map(([,key])=>key)).toEqual([M,B,P,M]);
  const backup=readRecovery(storage,hydrateStoredState);expect(backup.raw).toBe(raw);expect(backup.state).toEqual(fixture);
  expect(storage.getItem(B).length).toBeLessThan(MAX_RECOVERY_CHARS);
  expect(JSON.parse(storage.getItem(B))).toMatchObject({version:1,generation:0,encoding:'gzip-base64'});
  expect(storage.getItem(M)).not.toContain('Synthetic');
});
it.each(['{broken','', 'null', JSON.stringify({schemaVersion:999}), JSON.stringify({schemaVersion:3,profile:{},workouts:'bad'})])('preserves unreadable primary and valid backup across repeated reloads (%s)',bad=>{
  const storage=seeded();const backup=storage.getItem(B);storage.values.set(P,bad);storage.ops=[];
  for(let i=0;i<3;i++){const result=readStartupState(storage);expect(result.status).toBe('error');expect(result.recovery).toBeTruthy();}
  expect(storage.getItem(P)).toBe(bad);expect(storage.getItem(B)).toBe(backup);expect(writes(storage)).toEqual([]);
  expect(save(storage)).toBe(false);expect(storage.getItem(P)).toBe(bad);expect(storage.getItem(B)).toBe(backup);
});
it('missing primary with backup requires explicit restore; backup survives restoration',()=>{
  const storage=seeded(),backup=storage.getItem(B);storage.values.delete(P);storage.ops=[];
  expect(readStartupState(storage)).toMatchObject({status:'error',code:'primary-missing',recovery:{generation:0}});expect(writes(storage)).toEqual([]);
  restoreLocalCheckpoint(storage,hydrateStoredState);expect(storage.getItem(P)).toBe(raw);expect(storage.getItem(B)).toBe(backup);expect(readStartupState(storage).state).toEqual(fixture);
});
it('marker alone prevents first-run; complete origin loss is indistinguishable from first install',()=>{
  const storage=seeded();storage.values.delete(P);storage.values.delete(B);expect(readStartupState(storage)).toMatchObject({status:'error',code:'primary-missing'});
  expect(readStartupState(new MemoryStorage())).toEqual({status:'empty'});
});
it('recognizes pre-marker production usage evidence but permits untouched first-run visits',()=>{
  const storage=new MemoryStorage([['lift-funnel-events-v1',JSON.stringify([{name:'app_open',properties:{path:'new'}}])]]);
  expect(readStartupState(storage)).toEqual({status:'empty'});
  storage.values.set('lift-funnel-once-v1',JSON.stringify(['first_workout_completed']));
  expect(readStartupState(storage)).toMatchObject({status:'error',code:'primary-missing'});expect(writes(storage)).toEqual([]);
});
it('malformed collections and migrations that would drop logged data fail closed',()=>{
  const broken=structuredClone(fixture);broken.conversations=[null];expect(readStartupState(new MemoryStorage([[P,serializeState(broken)]]))).toMatchObject({status:'error',code:'validation-error'});
  const duplicate=structuredClone(fixture);duplicate.activeWorkout.exercises.push({...structuredClone(duplicate.activeWorkout.exercises[0]),id:'duplicate-instance'});
  const storage=new MemoryStorage([[P,serializeState(duplicate)]]);expect(readStartupState(storage)).toMatchObject({status:'error',code:'migration-error'});expect(writes(storage)).toEqual([]);
});
it.each(['{bad','{}','null'])('malformed backup is never offered or silently erased (%s)',bad=>{
  const storage=seeded();storage.values.delete(P);storage.values.set(B,bad);storage.ops=[];const result=readStartupState(storage);
  expect(result.status).toBe('error');expect(result.recovery).toBeUndefined();expect(storage.getItem(B)).toBe(bad);expect(writes(storage)).toEqual([]);
});
it('rejects tampered compressed checkpoint before accepting its contents',()=>{
  const storage=seeded(),e=JSON.parse(storage.getItem(B));e.checksum='0'.repeat(64);storage.values.set(B,JSON.stringify(e));expect(()=>readRecovery(storage,hydrateStoredState)).toThrow('recovery-invalid');
  e.bytes=Number.MAX_SAFE_INTEGER;storage.values.set(B,JSON.stringify(e));expect(()=>readRecovery(storage,hydrateStoredState)).toThrow('recovery-invalid');
});
it.each(['SecurityError','Error'])('getItem throws (%s): never writes, retry returns exact data',name=>{
  const storage=new MemoryStorage([[P,raw]]),get=storage.getItem.bind(storage);storage.getItem=()=>{throw Object.assign(new Error('blocked'),{name});};
  expect(readStartupState(storage).status).toBe('error');expect(writes(storage)).toEqual([]);storage.getItem=get;expect(readStartupState(storage).state).toEqual(fixture);
});
it('migration failure is distinct and original bytes survive',()=>{
  const storage=new MemoryStorage([[P,raw]]);expect(readLocalState(storage,()=>{throw new Error('migration failed');})).toMatchObject({status:'error',code:'migration-error'});expect(storage.getItem(P)).toBe(raw);expect(writes(storage)).toEqual([]);
});
it.each([2,3])('schema %i migration is idempotent and old bytes remain the recovery source',schema=>{
  fixture.schemaVersion=schema;const old=serializeState(fixture),storage=new MemoryStorage([[P,old]]),first=readStartupState(storage);
  expect(first.status).toBe('ready');expect(hydrateStoredState(first.state)).toEqual(first.state);expect(storage.getItem(P)).toBe(old);
  first.state.profile.name+=' edited';expect(save(storage,first.state)).toBe(true);expect(readRecovery(storage,hydrateStoredState).raw).toBe(old);
});
it.each([M,B,P])('quota failure at %s keeps the prior primary and never reports saved',key=>{
  const storage=new MemoryStorage([[P,raw]]);readStartupState(storage);const set=storage.setItem.bind(storage);storage.setItem=(k,v)=>{if(k===key)throw new DOMException('full','QuotaExceededError');set(k,v);};
  fixture.profile.name+=' changed';expect(save(storage)).toBe(false);expect(storage.getItem(P)).toBe(raw);expect(storageDiagnostics(storage).outcome).toBe('quota-error');
});
it('final metadata failure is not a false data failure after verified primary commit',()=>{
  const storage=new MemoryStorage([[P,raw]]);readStartupState(storage);const set=storage.setItem.bind(storage);let calls=0;storage.setItem=(k,v)=>{if(k===M&&++calls===2)throw new Error('metadata full');set(k,v);};
  fixture.profile.name+=' changed';expect(save(storage)).toBe(true);expect(storage.getItem(P)).toBe(serializeState(fixture));expect(JSON.parse(storage.getItem(M)).writePending).toBe(true);expect(storageDiagnostics(storage).outcome).toBe('saved-metadata-pending');
});
it('failed write verification does not claim durable success',()=>{
  const storage=new MemoryStorage([[P,raw]]);readStartupState(storage);const set=storage.setItem.bind(storage);storage.setItem=(k,v)=>{if(k!==P)set(k,v);};fixture.profile.name+=' changed';expect(save(storage)).toBe(false);expect(storage.getItem(P)).toBe(raw);
});
it('invalid next schema, structure, plan, or migration cannot touch the prior primary',()=>{
  for(const change of [s=>s.schemaVersion=999,s=>s.workouts={},s=>s.program.days=[],s=>s.profile=null]){const storage=seeded(),prior=storage.getItem(P),backup=storage.getItem(B),next=structuredClone(fixture);change(next);storage.ops=[];expect(save(storage,next)).toBe(false);expect(storage.getItem(P)).toBe(prior);expect(storage.getItem(B)).toBe(backup);expect(writes(storage)).toEqual([]);}
});
it('does not rotate checkpoint or rerun migrations for rapid logger writes',()=>{
  const storage=seeded(),backup=storage.getItem(B),hydrate=vi.fn(hydrateStoredState);
  for(let i=0;i<20;i++){fixture.activeWorkout.exercises[0].sets[1].reps=20+i;expect(persistLocalState(serializeState(fixture),{storage,hydrate})).toBe(true);}
  expect(hydrate).not.toHaveBeenCalled();expect(storage.getItem(B)).toBe(backup);expect(JSON.parse(storage.getItem(P)).activeWorkout.exercises[0].sets[1].reps).toBe(39);
  vi.advanceTimersByTime(60001);fixture.activeWorkout.exercises[0].sets[1].reps=40;expect(save(storage)).toBe(true);expect(readRecovery(storage,hydrateStoredState).state.activeWorkout.exercises[0].sets[1].reps).toBe(39);
});
it('blocks missing/cross-tab sources and blank default overwrite',()=>{
  const storage=seeded(),prior=storage.getItem(P);expect(save(storage,blankState())).toBe(false);expect(storage.getItem(P)).toBe(prior);
  storage.values.set(P,raw);expect(save(storage)).toBe(false);expect(storage.getItem(P)).toBe(raw);storage.values.delete(P);expect(save(storage)).toBe(false);expect(storage.getItem(P)).toBeNull();
});
it('pristine default write requires a confirmed first-run reason',()=>{
  localStorage.clear();forgetStorageSession(localStorage);expect(saveState(blankState())).toBe(false);expect(localStorage.getItem(P)).toBeNull();expect(saveState(blankState(),{reason:'first-run:user-confirmed'})).toBe(true);localStorage.clear();forgetStorageSession(localStorage);
});
it.each([P,B,J])('removeItem failure at %s leaves a provable pending deletion and recovery startup',async key=>{
  const storage=seeded(),remove=storage.removeItem.bind(storage),photos=vi.fn(async()=>{});storage.removeItem=k=>{if(k===key)throw new Error('blocked');remove(k);};
  await expect(deleteLocalState({storage,clearPhotos:photos})).rejects.toThrow('blocked');expect(JSON.parse(storage.getItem(M))).toMatchObject({deletePending:true,everInitialized:true,lastWriteReason:'delete-local-data:user-confirmed'});
  expect(readStartupState(storage)).toMatchObject({status:'error',code:'delete-incomplete'});expect(photos).toHaveBeenCalledOnce();
  storage.removeItem=remove;await deleteLocalState({storage,clearPhotos:photos});expect(readStartupState(storage)).toEqual({status:'empty'});expect(JSON.parse(storage.getItem(M))).toMatchObject({deletePending:false,everInitialized:false,explicitDeleteAt:expect.any(String)});
});
it('cannot delete photos if recording confirmed deletion fails',async()=>{
  const storage=seeded(),photos=vi.fn();storage.setItem=()=>{throw new Error('blocked');};await expect(deleteLocalState({storage,clearPhotos:photos})).rejects.toThrow();expect(photos).not.toHaveBeenCalled();expect(storage.getItem(P)).not.toBeNull();
});
it('does not replay an interrupted restore beneath a pending explicit deletion',async()=>{
  const storage=seeded();beginRestoreTransaction(fixture,storage);const meta=JSON.parse(storage.getItem(M));meta.deletePending=true;storage.values.set(M,JSON.stringify(meta));const rollbackPhotos=vi.fn();expect(await recoverInterruptedRestore({storage,rollbackPhotos})).toBe('delete-incomplete');expect(rollbackPhotos).not.toHaveBeenCalled();
});
it('normal saves cannot interfere with a pending cross-store restore',()=>{
  const storage=seeded(),before=storage.getItem(P);beginRestoreTransaction(fixture,storage);fixture.profile.name+=' changed';expect(save(storage)).toBe(false);expect(storage.getItem(P)).toBe(before);expect(storageDiagnostics(storage).outcome).toBe('restore-in-progress');
});
it('shared exclusive lock serializes cross-store work and releases after failure',async()=>{
  let queue=Promise.resolve();const locks={request:vi.fn((_name,_options,operation)=>{const result=queue.then(operation);queue=result.catch(()=>{});return result;})};const order=[];let release;
  const first=withStorageTransaction(async()=>{order.push('restore');await new Promise(resolve=>release=resolve);throw Error('interrupted');},locks);const rejected=expect(first).rejects.toThrow('interrupted');
  const second=withStorageTransaction(()=>order.push('recover'),locks);await Promise.resolve();expect(order).toEqual(['restore']);release();await rejected;await second;expect(order).toEqual(['restore','recover']);expect(locks.request.mock.calls.every(([name,options])=>name==='rook-state-photo-transaction-v1'&&options.mode==='exclusive')).toBe(true);
  expect(withStorageTransaction(()=>42,{})).toBe(42);
});
it('corrupt metadata does not hide a valid recovery checkpoint',async()=>{
  const storage=seeded();storage.values.set(M,'{bad metadata');expect(await recoverInterruptedRestore({storage})).toBe('clean');expect(readStartupState(storage)).toMatchObject({status:'error',code:'metadata-error',recovery:expect.any(Object)});restoreLocalCheckpoint(storage,hydrateStoredState);expect(readStartupState(storage).status).toBe('ready');
});
it('an empty-string journal is a recovery failure, never treated as absent',async()=>{
  const storage=seeded();storage.values.set(J,'');await expect(recoverInterruptedRestore({storage})).rejects.toThrow();
});
it('invalid prepared import cannot create a journal or stage photos',async()=>{
  const storage=seeded(),before=new Map(storage.values),stagePhotos=vi.fn();await expect(commitPreparedRestore({state:{schemaVersion:999},photos:[]},{storage,currentState:fixture,stagePhotos})).rejects.toThrow();expect(stagePhotos).not.toHaveBeenCalled();expect(storage.values).toEqual(before);
});
it('unsupported/denied protection and estimates do not block use or repeat requests',async()=>{
  const storage=seeded();expect(await inspectStorageProtection({storage,api:undefined,secure:true})).toMatchObject({result:'unsupported',estimate:null});
  const api={persisted:vi.fn(async()=>false),persist:vi.fn(async()=>false),estimate:vi.fn(async()=>({usage:123,quota:456}))};
  expect(await inspectStorageProtection({storage,api,secure:true,request:true})).toMatchObject({result:'not-granted',requested:true,estimate:{usage:123,quota:456}});
  await inspectStorageProtection({storage,api,secure:true,request:true});expect(api.persist).toHaveBeenCalledOnce();expect(readStartupState(storage).status).toBe('ready');
});
it.each([true,false])('storage API exceptions / insecure context (%s) never block data',async secure=>{
  const storage=seeded(),api={persisted:async()=>{throw new Error('denied');},persist:vi.fn(),estimate:async()=>{throw new Error('unsupported');}};await expect(inspectStorageProtection({storage,api,secure,request:true})).resolves.toMatchObject({result:secure?'unavailable':'unsupported',estimate:null});expect(api.persist).not.toHaveBeenCalled();
});
it('async storage estimates cannot roll back a newer generation or resurrect a deletion marker',async()=>{
  const storage=seeded();let release;
  const api={estimate:()=>new Promise(resolve=>release=resolve)};
  const first=inspectStorageProtection({storage,api,secure:true});fixture.profile.name+=' newer';expect(save(storage)).toBe(true);const generation=JSON.parse(storage.getItem(M)).generation;release({usage:10,quota:20});await first;expect(JSON.parse(storage.getItem(M)).generation).toBe(generation);
  const second=inspectStorageProtection({storage,api,secure:true});await deleteLocalState({storage});const receipt=storage.getItem(M);release({usage:0,quota:20});await second;expect(storage.getItem(M)).toBe(receipt);expect(readStartupState(storage)).toEqual({status:'empty'});
});
it('diagnostics remain bounded and contain no personal state or injected metadata contents',()=>{
  const storage=seeded(),meta=JSON.parse(storage.getItem(M));Object.assign(meta,{privateWorkout:fixture,startupOutcome:'Synthetic secret',persistentStorage:{result:'Synthetic secret'},storageEstimate:{usage:'Synthetic secret'}});storage.values.set(M,JSON.stringify(meta));const diagnostic=JSON.stringify(storageDiagnostics(storage));expect(diagnostic).not.toContain('Synthetic');expect(diagnostic.length).toBeLessThan(2500);expect(diagnostic).not.toContain('exercises');
});
