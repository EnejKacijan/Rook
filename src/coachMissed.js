import {isoDay,weekday,calendarDate} from './domain.js';
import {missedFlexibleSessions,addCalendarDays} from './flexibleWeek.js';

// This resolves source identity only; the existing schedule sheet owns dates,
// conflicts and Apply. No language-model proposal can silently pick a source.
export function coachMissedReply(state,message,today=isoDay()) {
  const text=String(message).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(!/missed|zamujen|izpust/.test(text)||/combin|condens|merg|zdruz/.test(text))return null;
  const sl=/zamujen|izpust/.test(text);
  const all=missedFlexibleSessions(state,today);
  let choices=all;
  const date=text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  const dayNames=[['Mon','monday','ponedel'],['Tue','tuesday','torek'],['Wed','wednesday','sred'],['Thu','thursday','cetrtek'],['Fri','friday','petek'],['Sat','saturday','sobot'],['Sun','sunday','nedelj']];
  const day=dayNames.find(([,en,si])=>text.includes(en)||text.includes(si))?.[0];
  if(date)choices=all.filter(s=>s.scheduledDate===date||s.originalDate===date);
  else if(/yesterday|vceraj/.test(text))choices=all.filter(s=>s.scheduledDate===addCalendarDays(today,-1));
  else if(day)choices=all.filter(s=>weekday(calendarDate(s.scheduledDate))===day);
  else if(/\blast\b|zadnj/.test(text))choices=all.slice(-1);
  else if(/\bfirst\b|prv/.test(text))choices=all.slice(0,1);
  else {const named=all.filter(s=>text.includes(s.workout.name.toLowerCase()));if(named.length)choices=named;}
  return {final:true,source:'missed-occurrence',action:null,
    text:choices.length>1?(sl?'Kateri zamujeni trening želiš prestaviti? Izberi datum in trening.':'Which missed workout do you want to reschedule? Choose the dated occurrence.'):
      choices.length?(sl?'Ta trening še ni opravljen. Izberi ga za pregled novega datuma.':'This occurrence is still uncompleted. Select it to choose a new date.'):
      (sl?'V aktualnem tednu ni ustreznega zamujenega treninga. Stare datume lahko pregledaš v koledarju.':'No matching actionable missed workout remains in the current week. Older dates remain available in the calendar.'),
    missedChoices:choices.map(s=>({id:s.logicalSessionId,label:`${s.workout.name} · ${s.scheduledDate}${s.moved?` · Originally ${s.originalDate}`:''}`}))};
}
