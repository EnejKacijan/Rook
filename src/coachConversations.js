import { isoDay, uid } from './domain.js';

export const coachEntries = (state, id = state.activeCoachConversationId) =>
  (state.conversations || []).filter(entry => (entry.conversationId || 'legacy') === id);
export const hasCoachDraft = state => Boolean(String(state.coachDraft || '').trim());
// Owned by the mounted app, not persisted/synced or recreated by tab remounts.
export function createCoachVisitTracker() {
  const entered=new Set();
  return {isColdStart:profileId=>!entered.has(profileId),entered:profileId=>entered.add(profileId)};
}
export function coachConversationDayContext(state,id=state.activeCoachConversationId) {
  const context=state.coachConversationMeta?.[id]?.dayContext;
  if(context?.kind!=='ask' || context.profileId!==state.profile.id ||
    !/^\d{4}-\d{2}-\d{2}$/.test(context.date||''))return null;
  const date=new Date(`${context.date}T12:00:00`);
  return Number.isFinite(date.getTime()) && isoDay(date)===context.date ? context : null;
}
const timestamp = value => value == null ? null : Number.isFinite(new Date(value).getTime()) ? new Date(value).getTime() : null;
const terminal = new Set(['applied', 'undone', 'reverted', 'undo-conflict', 'cancelled']);

// Workflow ownership lives on the existing message/action records, not a second
// chat store. Plain text (including questions) never creates workflow ownership.
export function pendingCoachWorkflows(state, id = state.activeCoachConversationId) {
  const pending = new Map();
  let clarification;
  const proposals = new Map();
  for (const entry of coachEntries(state, id)) {
    const reply = entry.reply;
    const cancelled = entry.coachWorkflowStatus === 'cancelled' || entry.coachReviewCancelled || entry.combineReviewCancelled;
    if (reply?.combineRequest || reply?.combineReviewRequired || reply?.action?.type === 'combine-workouts') {
      if (clarification) pending.delete(clarification);
      clarification = null;
    }
    const proposalId = reply?.action?.type === 'combine-workouts' && reply.action.proposal?.id;
    if (proposalId && !cancelled) {
      if (proposals.has(proposalId)) pending.delete(proposals.get(proposalId));
      proposals.set(proposalId, entry.id);
    }
    if (entry.coachActionsArchived || cancelled || terminal.has(entry.actionResult?.status)) continue;
    if (!reply || reply.combineRequest || reply.combineReviewRequired || reply.action) pending.set(entry.id, entry);
    if (reply?.combineRequest || reply?.combineReviewRequired) clarification = entry.id;
  }
  return [...pending.values()];
}

export function normalizeCoachConversations(state) {
  const conversations = (state.conversations || []).map(entry => entry.conversationId ? entry : { ...entry, conversationId: 'legacy' });
  const metadata = { ...(state.coachConversationMeta || {}) };
  for (const id of new Set([...Object.keys(metadata), ...conversations.map(entry => entry.conversationId)])) {
    const entries = conversations.filter(entry => entry.conversationId === id);
    const times = entries.map(entry => timestamp(entry.createdAt)).filter(value => value !== null);
    const existing = metadata[id] || {};
    const createdAt = timestamp(existing.createdAt) ?? (times.length ? Math.min(...times) : null);
    metadata[id] = { ...existing, id, createdAt,
      lastActivityAt: Math.max(timestamp(existing.lastActivityAt) || 0, ...times) || null,
      lastUserActivityAt: Math.max(timestamp(existing.lastUserActivityAt) || 0, ...times) || null,
      localDateStarted: /^\d{4}-\d{2}-\d{2}$/.test(existing.localDateStarted || '') ? existing.localDateStarted : createdAt === null ? null : isoDay(createdAt) };
  }
  return { ...state, conversations, coachConversationMeta: metadata };
}

// The existing ID helper also works on the owner's plain-HTTP LAN preview.
export function coachConversationId() { return uid('thread'); }

// Applied adjustments reserve occurrences through the workout owner, not through
// chat. Cancelling an unaccepted candidate must never cancel that applied owner.
export function cancelCoachWorkflows(state, id = state.activeCoachConversationId) {
  const next = structuredClone(state);
  // Include superseded unaccepted candidates too: abandoning a revision must
  // not reveal an earlier proposal as newly pending after manual New chat.
  const ids = new Set(coachEntries(next, id).filter(entry => !terminal.has(entry.actionResult?.status) &&
    (!entry.reply || entry.reply.action || entry.reply.combineRequest || entry.reply.combineReviewRequired)).map(entry => entry.id));
  for (const entry of next.conversations || []) if (ids.has(entry.id)) {
    entry.coachWorkflowStatus = 'cancelled';
    if (entry.reply?.combineRequest || entry.reply?.combineReviewRequired || entry.reply?.action?.type === 'combine-workouts') entry.combineReviewCancelled = true;
  }
  return next;
}

export function enterCoachConversation(state, { now = new Date(), manual = false, coldStart = false, cancelPending = false, discardDraft = false, initialDraft = '', dayContext = null, createId = coachConversationId } = {}) {
  let next = normalizeCoachConversations(state);
  const metadata = next.coachConversationMeta;
  const active = metadata[next.activeCoachConversationId] || Object.values(metadata).sort((a, b) =>
    (b.lastActivityAt || b.createdAt || 0) - (a.lastActivityAt || a.createdAt || 0) || a.id.localeCompare(b.id))[0];
  const pending = active ? pendingCoachWorkflows(next, active.id) : [];
  const draft = hasCoachDraft(next);
  if (manual && pending.length && !cancelPending) throw new Error('Your current Coach adjustment is still in progress.');
  if (manual && draft && !discardDraft) throw new Error('Your unsent draft is still here. Confirm before starting a new chat.');
  const empty=active && !draft && !pending.length && !coachEntries(next,active.id).length;
  if (active && ((!manual && (!coldStart || pending.length || draft)) || empty)) {
    if(manual || coldStart && empty){
      delete next.coachConversationMeta[active.id].dayContext;
      if(dayContext)next.coachConversationMeta[active.id].dayContext=structuredClone(dayContext);
      next.coachDraft=initialDraft;
    }
    return { ...next, activeCoachConversationId: active.id };
  }
  if (manual && pending.length) next = cancelCoachWorkflows(next, active.id);
  // Empty visits get a durable current identity for draft/reload stability, but
  // leave no empty historical conversations behind when the next one starts.
  for (const id of Object.keys(next.coachConversationMeta)) {
    if (!coachEntries(next, id).length) delete next.coachConversationMeta[id];
  }
  const id = createId();
  next.coachConversationMeta[id] = { id, createdAt: new Date(now).getTime(), lastActivityAt: new Date(now).getTime(), lastUserActivityAt:null, localDateStarted: isoDay(now), ...(dayContext?{dayContext:structuredClone(dayContext)}:{}) };
  return { ...next, activeCoachConversationId: id, coachDraft: manual || coldStart && !draft ? initialDraft : next.coachDraft || '' };
}

export function continueCoachConversation(state,id,{profileId=state.profile.id,cancelPending=false,discardDraft=false,now=Date.now()}={}) {
  if(profileId!==state.profile.id)throw Error('This chat belongs to another profile. Open chat history again.');
  let next=normalizeCoachConversations(state);
  if(!coachEntries(next,id).length)throw Error('This conversation is no longer available.');
  if(id===next.activeCoachConversationId)return next;
  if(pendingCoachWorkflows(next).length&&!cancelPending)throw Error('Your current Coach adjustment is still in progress.');
  if(hasCoachDraft(next)&&!discardDraft)throw Error('Your unsent draft is still here. Confirm before continuing another chat.');
  if(pendingCoachWorkflows(next).length)next=cancelCoachWorkflows(next);
  // Continuing the discussion never restores an old transaction. Preserve all
  // text/results, cancel unaccepted historical work, and freeze its controls.
  next=cancelCoachWorkflows(next,id);
  next.conversations=next.conversations.map(entry=>(entry.conversationId||'legacy')===id
    ? {...entry,coachActionsArchived:true} : entry);
  for(const key of Object.keys(next.coachConversationMeta))
    if(key!==id&&!coachEntries(next,key).length)delete next.coachConversationMeta[key];
  next.activeCoachConversationId=id;next.coachDraft='';
  next.coachConversationMeta[id].lastActivityAt=new Date(now).getTime();
  return next;
}

export function persistCoachContinuation(state,id,options,persist) {
  const next=continueCoachConversation(state,id,options);
  if(JSON.stringify(next)===JSON.stringify(state))return state;
  if(!persist(next))throw Error('Couldn’t open this chat. Your current conversation is unchanged.');
  return next;
}

export function persistCoachEntry(state, options, persist) {
  const next = enterCoachConversation(state, options);
  if (JSON.stringify(next) === JSON.stringify(state)) return state;
  if (!persist(next)) throw new Error('Couldn’t save this chat. Your conversation is unchanged.');
  return next;
}

export function touchCoachConversation(state, id, now = Date.now(), { user = false } = {}) {
  const metadata = state.coachConversationMeta?.[id];
  if (metadata) {
    metadata.lastActivityAt = now;
    if (user) metadata.lastUserActivityAt = now;
  }
  return state;
}
