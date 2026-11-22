import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {warmupProgress} from './warmupSession.js';

// The live stage for the current exercise. Stages without steps never render.
export function activeWarmupStage(active) {
  const exercise = active?.exercises?.[active.exerciseIndex];
  if (!exercise) return null;
  return (active.warmup?.stages || []).find(stage =>
    stage.exerciseIndex === active.exerciseIndex &&
    stage.exerciseId === exercise.exerciseId &&
    (!stage.exerciseInstanceId || stage.exerciseInstanceId === exercise.id) &&
    warmupProgress(stage).total > 0) || null;
}

const storageKey = active => `rook-warmup-disclosure:${active.id}:${active.startedAt}`;

// Open/closed is a view choice, not workout data. Session storage keeps it
// through exercise changes and reloads without touching the saved workout.
function readChoices(active) {
  try { return JSON.parse(sessionStorage.getItem(storageKey(active)) || '{}') || {}; }
  catch { return {}; }
}
function writeChoice(active, stageId, open) {
  try {
    const choices = readChoices(active);
    choices[stageId] = open ? 'open' : 'closed';
    sessionStorage.setItem(storageKey(active), JSON.stringify(choices));
  } catch { /* The choice still holds for this screen. */ }
}

const hasLoggedSet = exercise => Boolean(exercise?.sets?.some(set => set.completed));

// Only the first planned warm-up opens by itself, and only before any working
// set. A pending warm-up the person opened or closed keeps that choice.
export function initialWarmupOpen(active, stage) {
  if (!active || !stage || warmupProgress(stage).outcome !== 'pending') return false;
  const choice = readChoices(active)[stage.id];
  if (choice === 'closed') return false;
  if (choice === 'open') return !hasLoggedSet(active.exercises[active.exerciseIndex]);
  if (active.exercises.some(hasLoggedSet)) return false;
  const first = (active.warmup?.stages || [])
    .filter(item => warmupProgress(item).total > 0)
    .reduce((best, item) => !best || item.exerciseIndex < best.exerciseIndex ? item : best, null);
  return first?.id === stage.id;
}

export function useWarmupDisclosure(active) {
  const stage = activeWarmupStage(active);
  const key = active && stage ? `${active.id}:${active.startedAt}:${stage.id}` : null;
  const [view, setView] = useState(() => ({key, open: initialWarmupOpen(active, stage)}));
  // Decide during render so the first paint already has the right state.
  const current = view.key === key ? view : {key, open: initialWarmupOpen(active, stage)};
  // Latch it, so logging a set later never collapses a list the person is using.
  useLayoutEffect(() => { if (view.key !== key) setView(current); });
  const [pulse, setPulse] = useState(null);
  const pulseTimer = useRef(null);
  useEffect(() => () => clearTimeout(pulseTimer.current), []);
  const activeRef = useRef(active), stageRef = useRef(stage), viewKey = useRef(key);
  activeRef.current = active; stageRef.current = stage; viewKey.current = key;
  const setOpen = useCallback((open, {remember = true} = {}) => {
    const live = activeRef.current, liveStage = stageRef.current;
    setView({key, open});
    if (remember && live && liveStage && warmupProgress(liveStage).outcome === 'pending') writeChoice(live, liveStage.id, open);
  }, [key]);
  // Short-lived marker for the step that just saved; CSS owns the motion.
  const markSaved = useCallback(stepKey => {
    clearTimeout(pulseTimer.current);
    setPulse(stepKey ? {key: stepKey, view: viewKey.current} : null);
    if (stepKey) pulseTimer.current = setTimeout(() => setPulse(null), 700);
  }, []);
  return {stage, open: current.open, setOpen, pulse: pulse?.view === key ? pulse : null, markSaved};
}
