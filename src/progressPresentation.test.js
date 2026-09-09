import {it,expect} from 'vitest';
import {adjustedMovedLabel} from './progressPresentation.js';
it.each([[0,0],[1,0],[0,1],[2,3]])('labels adjusted %i and moved %i explicitly',(adjusted,moved)=>{
  expect(adjustedMovedLabel(adjusted,moved)).toBe(`${adjusted} adjusted · ${moved} moved`);
});
