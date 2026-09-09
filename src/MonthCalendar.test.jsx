import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {MonthCalendar} from './MonthCalendar.jsx';
import {blankState,buildProgram} from './domain.js';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
afterEach(()=>{act(()=>root?.unmount());host?.remove();});
function setup(selectedDate='2026-09-07'){
 const state=blankState();state.program=buildProgram(state.profile);state.program.createdAt='2026-08-01T12:00:00Z';
 const onSelect=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host);
 act(()=>root.render(<MonthCalendar state={state} today="2026-09-07" selectedDate={selectedDate} header={<header>Calendar</header>} onSelect={onSelect}/>));return {state,onSelect};
}
const button=label=>[...host.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label||b.textContent===label);
it('keeps all supported statuses in the legend without an active session',()=>{
 setup();
 expect([...host.querySelectorAll('.month-calendar-legend > span')].map(e=>e.textContent)).toEqual(['Planned','✓Completed','In progress']);
});
it('keeps today independent of another selected date',()=>{
 setup('2026-09-10');
 const today=host.querySelector('[data-date="2026-09-07"]'),selected=host.querySelector('[data-date="2026-09-10"]');
 expect(today.classList.contains('is-today')).toBe(true);expect(today.classList.contains('is-selected')).toBe(false);
 expect(today.getAttribute('aria-current')).toBe('date');expect(today.getAttribute('aria-pressed')).toBe('false');
 expect(selected.classList.contains('is-selected')).toBe(true);expect(selected.getAttribute('aria-current')).toBe(null);
 expect(selected.closest('[role="gridcell"]').getAttribute('aria-selected')).toBe('true');
});
it('Today from another month selects the actual date without selecting a browsed date',()=>{
 const {onSelect}=setup('2026-08-21');act(()=>button('TODAY').click());
 expect(onSelect).toHaveBeenCalledExactlyOnceWith('2026-09-07');
});
it('opens the selected month, with one day tab stop and full labels',()=>{setup('2026-08-21');expect(host.querySelector('h2').textContent).toBe('August 2026');const selected=host.querySelector('[data-date="2026-08-21"]');expect(selected.getAttribute('aria-label')).toContain('Friday, August 21, 2026, selected');expect(selected.getAttribute('aria-pressed')).toBe('true');expect(host.querySelectorAll('[role=grid] button[tabindex="0"]')).toHaveLength(1);});
it('month browsing never selects; boundary months disable navigation',()=>{const {onSelect}=setup();expect(button('Next month').disabled).toBe(true);act(()=>button('Previous month').click());expect(onSelect).not.toHaveBeenCalled();expect(host.querySelector('h2').textContent).toBe('August 2026');act(()=>button('Previous month').click());expect(button('Previous month').disabled).toBe(true);expect(onSelect).not.toHaveBeenCalled();});
it('arrows cross a month without committing and Enter can select the focused date',()=>{const {onSelect}=setup('2026-09-01');const day=host.querySelector('[data-date="2026-09-01"]');act(()=>{day.focus();day.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));});expect(host.querySelector('h2').textContent).toBe('August 2026');expect(document.activeElement.dataset.date).toBe('2026-08-31');expect(onSelect).not.toHaveBeenCalled();act(()=>document.activeElement.click());expect(onSelect).toHaveBeenCalledExactlyOnceWith('2026-08-31');});
it('unavailable dates cannot select; Today selects only today',()=>{const {onSelect}=setup();const outside=host.querySelector('[data-date="2026-09-14"]');expect(outside.disabled).toBe(true);act(()=>outside.click());expect(onSelect).not.toHaveBeenCalled();act(()=>button('TODAY').click());expect(onSelect).toHaveBeenCalledExactlyOnceWith('2026-09-07');});
