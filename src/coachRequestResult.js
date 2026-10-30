import {touchCoachConversation} from './coachConversations.js';

// A response owns one pending message, never a frozen snapshot of the app.
export function coachRequestEntry(state, identity) {
  if (state.profile?.id !== identity.profileId) return null;
  const entry = state.conversations?.find(item => item.id === identity.entryId
    && item.conversationId === identity.conversationId
    && item.coachRequestId === identity.requestId);
  return entry && !entry.reply && !entry.coachActionsArchived && entry.coachWorkflowStatus !== 'cancelled'
    && !entry.coachReviewCancelled && !entry.combineReviewCancelled ? entry : null;
}

export function applyCoachRequestResult(state, identity, result) {
  if (!coachRequestEntry(state, identity)) return state;
  const next = structuredClone(state);
  const entry = coachRequestEntry(next, identity);
  for(const id of result.reply?.supersededEntryIds||[]){
    const prior=next.conversations.find(item=>item.id===id&&item.conversationId===identity.conversationId);
    if(prior&&prior.id!==entry.id&&prior.reply&&!prior.coachActionsArchived&&!['applied','undone','reverted','undo-conflict','cancelled'].includes(prior.actionResult?.status)){
      prior.coachWorkflowStatus='cancelled';
      prior.supersededBy=entry.id;
      if(prior.reply.combineRequest||prior.reply.combineReviewRequired||prior.reply.action?.type==='combine-workouts')prior.combineReviewCancelled=true;
    }
  }
  if (result.requestError) entry.requestError = true;
  else { entry.reply = result.reply; delete entry.requestError; }
  delete entry.coachRequestId;
  touchCoachConversation(next, identity.conversationId);
  return next;
}

export function createCoachReplyCommit(identity, reply, persist) {
  const options = {planVersion:false};
  const result = {applied:false, persistenceError:false, state:null};
  let savedInput = null, savedState = null;
  const update = current => {
    // The caller consumes the outcome of the final invocation after React has
    // replayed or rebased this updater, not a previous invocation's outcome.
    result.applied = false;
    result.persistenceError = false;
    result.state = null;
    delete options.persistedState;
    // React can replay a functional updater. Reuse the already durable result
    // only for the identical input; rebased app changes still receive a fresh merge.
    const input = JSON.stringify(current);
    if (savedState && input === savedInput) {
      options.persistedState = savedState;
      result.applied = true;
      result.state = savedState;
      return savedState;
    }
    const next = applyCoachRequestResult(current, identity, {reply});
    if (next === current) return current;
    if (!persist(next)) { result.persistenceError = true; return current; }
    savedInput = input;
    savedState = next;
    options.persistedState = next;
    result.applied = true;
    result.state = next;
    return next;
  };
  return {update, options, result};
}
