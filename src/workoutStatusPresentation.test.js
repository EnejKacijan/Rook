import { it, expect } from 'vitest';
import { workoutVisibleStatus } from './workoutStatusPresentation.js';

it.each([['missed','Missed'],['skipped','Skipped'],['active','Workout in progress']])('presents %s once without changing its input', (status, label) => {
  const input = Object.freeze({status});
  expect(workoutVisibleStatus(input)).toBe(label);
  expect(workoutVisibleStatus(input)).not.toMatch(/not performed/i);
});
it('retains moved destination provenance', () => {
  expect(workoutVisibleStatus({status:'moved',destination:'Fri, Oct 2'})).toBe('Moved to Fri, Oct 2');
});
it.each([{endedEarly:true}, {status:'ended-early'}, {}])('keeps partial/empty execution distinct from normal completion: %j', workout => {
  expect(workoutVisibleStatus({workout,summary:{completed:0,total:12}})).toBe('Ended early');
});
it('uses Completed only for a completed execution with normal set coverage', () => {
  expect(workoutVisibleStatus({workout:{status:'completed'},summary:{completed:12,total:12}})).toBe('Completed');
  expect(workoutVisibleStatus({status:'planned'})).toBe('');
});
