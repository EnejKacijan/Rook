import { plannedWorkoutForDate, adaptedTemplateForToday, optionalStrengthForDate, nextScheduledWorkout, calendarDate } from './domain.js';
import { flexibleOccurrenceForDate } from './flexibleWeek.js';
import { canUseWorkoutToday } from './useWorkoutToday.js';

// Ephemeral, read-only projection of one state revision. The Today owner replaces
// this reader whenever any non-navigation state reference changes (or midnight).
// Nothing here is persisted or used as a competing scheduling authority.
export function createTodayScheduleReader(state) {
  const dates = new Map();
  const eligibility = new Map();
  return {
    read(key) {
      if (!dates.has(key)) {
        const date=calendarDate(key), recurringTemplate=plannedWorkoutForDate(state,date);
        const adaptedTemplate=adaptedTemplateForToday(state,date,recurringTemplate);
        const template=adaptedTemplate || optionalStrengthForDate(state,date);
        dates.set(key,{recurringTemplate,adaptedTemplate,template,occurrence:flexibleOccurrenceForDate(state,key,template?.id)});
        if(dates.size>64)dates.delete(dates.keys().next().value);
      }
      return dates.get(key);
    },
    next(key) {
      const entry=this.read(key);
      if (!('next' in entry)) entry.next=nextScheduledWorkout(state,calendarDate(key));
      return entry.next;
    },
    canUseToday(request) {
      const key=JSON.stringify(request);
      if(!eligibility.has(key)){
        // Cache only the affordance. Opening the flow and Apply still compute
        // and validate their own fresh canonical proposal against current state.
        eligibility.set(key,canUseWorkoutToday(state,request));
        if(eligibility.size>64)eligibility.delete(eligibility.keys().next().value);
      }
      return eligibility.get(key);
    },
  };
}
