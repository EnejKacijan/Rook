import { describe, it, expect } from 'vitest';
import { defaultProfile, buildProgram, validateProgram, WEEKDAYS } from './domain.js';

describe('120-minute availability', () => {
  for (const goal of ['Build muscle', 'Get stronger', 'Lose fat', 'General fitness', 'Athletic performance']) {
    for (const experience of ['Beginner', 'Intermediate', 'Advanced']) {
      it(`${goal}, ${experience}: respects existing programming rather than filling time`, () => {
        for (const daysPerWeek of [2, 3, 4, 5, 6]) {
          for (const home of [false, true]) {
            const profile = { ...defaultProfile(), goal, experience, daysPerWeek,
              availableDays: WEEKDAYS.slice(0, daysPerWeek), sessionMinutes: 120,
              environment: home ? 'Home gym' : 'Commercial gym',
              equipment: home ? ['dumbbells', 'bodyweight'] : ['full gym'], priorities: ['Balanced'] };
            const program = buildProgram(profile);
            expect(validateProgram(program, profile).valid).toBe(true);
            expect(program.days).toHaveLength(daysPerWeek);
            for (const day of program.days) {
              expect(day.exercises.length).toBeGreaterThan(0);
              expect(day.estimatedMinutes).toBeLessThanOrEqual(120);
            }
            expect(program.days.some(day => day.estimatedMinutes < 100)).toBe(true);
            expect(JSON.parse(JSON.stringify({ profile, program })).profile.sessionMinutes).toBe(120);
          }
        }
      });
    }
  }
});
