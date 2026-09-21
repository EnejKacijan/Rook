import { isoDay, uid } from './domain.js';

export const coachEntries = (state, id = state.activeCoachConversationId) =>
  (state.conversations || []).filter(entry => (entry.conversationId || 'legacy') === id);
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
    if (reply?.combineRequest || reply?.action?.type === 'combine-workouts') {
      if (clarification) pending.delete(clarification);
      clarification = null;
    }
    const proposalId = reply?.action?.type === 'combine-workouts' && reply.action.proposal?.id;
    if (proposalId && !cancelled) {
      if (proposals.has(proposalId)) pending.delete(proposals.get(proposalId));
      proposals.set(proposalId, entry.id);
    }
    if (cancelled || terminal.has(entry.actionResult?.status)) continue;
    if (!reply || reply.combineRequest || reply.action) pending.set(entry.id, entry);
    if (reply?.combineRequest) clarification = entry.id;
  }
  return [...pending.values()];
}

export function normalizeCoachConversations(state) {
  const conversations = (state.conversations || []).map(entry => entry.conversationId ? entry : { ...entry, conversationId: 'legacy' });
  const metadata = { ...(state.coachConversationMeta || {}) };
  for (const id of new Set(conversations.map(entry => entry.conversationId))) {
    const entries = conversations.filter(entry => entry.conversationId === id);
    const times = entries.map(entry => timestamp(entry.createdAt)).filter(value => value !== null);
    const existing = metadata[id] || {};
    const createdAt = timestamp(existing.createdAt) ?? (times.length ? Math.min(...times) : null);
    metadata[id] = { ...existing, id, createdAt,
      lastActivityAt: Math.max(timestamp(existing.lastActivityAt) || 0, ...times) || null,
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
    (!entry.reply || entry.reply.action || entry.reply.combineRequest)).map(entry => entry.id));
  for (const entry of next.conversations || []) if (ids.has(entry.id)) {
    entry.coachWorkflowStatus = 'cancelled';
    if (entry.reply?.combineRequest || entry.reply?.action?.type === 'combine-workouts') entry.combineReviewCancelled = true;
  }
  return next;
}

export function enterCoachConversation(state, { now = new Date(), manual = false, cancelPending = false, createId = coachConversationId } = {}) {
  let next = normalizeCoachConversations(state);
  const metadata = next.coachConversationMeta;
  const active = metadata[next.activeCoachConversationId] || Object.values(metadata).sort((a, b) =>
    (b.lastActivityAt || b.createdAt || 0) - (a.lastActivityAt || a.createdAt || 0) || a.id.localeCompare(b.id))[0];
  const pending = active ? pendingCoachWorkflows(next, active.id) : [];
  if (manual && pending.length && !cancelPending) throw new Error('Your current Coach adjustment is still in progress.');
  if (!manual && active && (pending.length || active.localDateStarted === isoDay(now))) {
    return { ...next, activeCoachConversationId: active.id };
  }
  if (manual && pending.length) next = cancelCoachWorkflows(next, active.id);
  // Empty visits get a durable current identity for draft/reload stability, but
  // leave no empty historical conversations behind when the next one starts.
  for (const id of Object.keys(next.coachConversationMeta)) {
    if (!coachEntries(next, id).length) delete next.coachConversationMeta[id];
  }
  const id = createId();
  next.coachConversationMeta[id] = { id, createdAt: new Date(now).getTime(), lastActivityAt: new Date(now).getTime(), localDateStarted: isoDay(now) };
  return { ...next, activeCoachConversationId: id, coachDraft: '' };
}

export function persistCoachEntry(state, options, persist) {
  const next = enterCoachConversation(state, options);
  if (JSON.stringify(next) === JSON.stringify(state)) return state;
  if (!persist(next)) throw new Error('Couldn’t save this chat. Your current conversation is unchanged. Try again.');
  return next;
}

export function touchCoachConversation(state, id, now = Date.now()) {
  const metadata = state.coachConversationMeta?.[id];
  if (metadata) metadata.lastActivityAt = now;
  return state;
}
