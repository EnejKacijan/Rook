import {it,expect} from 'vitest';
import {nextImportReview} from './nextImportReview.js';
const exercise=(id,matchStatus='unresolved')=>({id,matchStatus});
it('advances across days and skips resolved exercises without changing the draft',()=>{
 const program={days:[{exercises:[exercise('a'),exercise('b','confirmed-custom')]},{exercises:[exercise('c','needs-name-review')]}]};
 const before=JSON.stringify(program);expect(nextImportReview(program,'a')).toBe('c');expect(JSON.stringify(program)).toBe(before);
 expect(nextImportReview(program,'c')).toBe('a');
});
it('does not reopen the final resolved item or an already reviewed exercise',()=>{
 expect(nextImportReview({days:[{exercises:[exercise('a'),exercise('b','confirmed-match')]}]},'a')).toBeNull();
});
