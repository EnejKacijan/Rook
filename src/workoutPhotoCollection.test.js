import { describe, expect, it, vi } from "vitest";
import { createWorkoutPhotoCollection, savedWorkoutPhotoEntries } from "./workoutPhotoCollection.js";
import { notifyWorkoutPhotoChanges, subscribeWorkoutPhotoChanges } from "./workoutPhotos.js";
import { finishRestoreTransaction, recoverInterruptedRestore, RESTORE_JOURNAL_KEY } from "./restoreTransaction.js";
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };

describe("one saved-photo collection", () => {
  it("includes saved photos without any logged exercises, excluding dangling references and duplicate links", () => {
    const workouts = [
      {id:"empty-workout",photoId:"saved",canonicalPlanDate:"2026-09-01",exercises:[]},
      {id:"duplicate",photoId:"saved",canonicalPlanDate:"2026-09-01"},
      {id:"deleted",photoId:"missing",canonicalPlanDate:"2026-09-02"},
    ];
    expect(savedWorkoutPhotoEntries(workouts,[{id:"saved"}]).map(e=>e.id)).toEqual(["saved"]);
    expect(savedWorkoutPhotoEntries(workouts,[])).toEqual([]);
  });
  it("shares one read, retains confirmed records during refresh/error, and accepts committed updates", async () => {
    const first=deferred(), second=deferred(); let changed;
    const read=vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue([]);
    const stop=vi.fn(); const store=createWorkoutPhotoCollection(read,listener=>{changed=listener;return stop;});
    const a=store.subscribe(vi.fn()), b=store.subscribe(vi.fn());
    expect(read).toHaveBeenCalledTimes(1); expect(store.getSnapshot()).toEqual({status:"loading",records:null});
    first.resolve([{id:"photo"}]); await flush();
    changed(); expect(store.getSnapshot()).toEqual({status:"loading",records:[{id:"photo"}]});
    second.reject(Error("read failed")); await flush();
    expect(store.getSnapshot()).toEqual({status:"error",records:[{id:"photo"}]});
    changed(); await flush(); expect(store.getSnapshot()).toEqual({status:"ready",records:[]});
    a(); expect(stop).not.toHaveBeenCalled(); b(); expect(stop).toHaveBeenCalledOnce();
  });
  it("read failure is never confirmed empty and older reads cannot undo a new mutation", async () => {
    const old=deferred(), fresh=deferred(); let changed;
    const store=createWorkoutPhotoCollection(vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise),fn=>{changed=fn;return ()=>{};});
    const stop=store.subscribe(()=>{}); changed(); fresh.reject(Error("offline")); await flush();
    expect(store.getSnapshot()).toEqual({status:"error",records:null});
    old.resolve([{id:"stale"}]); await flush(); expect(store.getSnapshot().records).toBeNull(); stop();
  });
  it("view notification errors do not report a successful storage write as failed", () => {
    const good=vi.fn(); const a=subscribeWorkoutPhotoChanges(()=>{throw Error("view");}),b=subscribeWorkoutPhotoChanges(good);
    expect(()=>notifyWorkoutPhotoChanges()).not.toThrow(); expect(good).toHaveBeenCalledOnce(); a();b();
  });
  it("refreshes restore subscribers only after the cross-store commit/recovery boundary", async () => {
    const values=new Map([[RESTORE_JOURNAL_KEY,JSON.stringify({version:1,id:"restore",previousState:"previous"})]]);
    const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const observed=[];const stop=subscribeWorkoutPhotoChanges(()=>observed.push(storage.getItem(RESTORE_JOURNAL_KEY)));
    await recoverInterruptedRestore({storage,rollbackPhotos:async()=>{},discardSnapshot:async()=>{}});
    expect(observed).toEqual([null]);
    await finishRestoreTransaction({storage,discardSnapshot:async()=>{throw Error("inert snapshot cleanup");}});
    expect(observed).toEqual([null,null]);stop();
  });
});
