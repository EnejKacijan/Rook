import {expect,it} from 'vitest';
import {isCombineIntent,isCombineDeclined,isCoachReadOnly,isCoachScheduleRequest} from './coachIntent.js';
it.each(['Združi mi moj Push in Pull','daj oba workouta skupaj','spravi Push in Pull skupi','dva treninga v enega','Combine my workouts','Can you merge these two sessions?'])('recognizes combination request: %s',text=>expect(isCombineIntent(text)).toBe(true));
it.each(['Ne združi teh treningov','ne mi tega združevat','don’t combine these','do not merge them'])('declines a combination without reinterpreting it: %s',text=>{expect(isCombineDeclined(text)).toBe(true);expect(isCombineIntent(text)).toBe(false);});
it.each(['Zakaj naj združim treninga?','Kako deluje združevanje?','Povej mi nekaj o Push','How do you combine workouts?','Explain my workout','Kaj pomeni estimated 1RM?','Samo razloži, ne spreminjaj plana'])('keeps an explanation read-only: %s',text=>expect(isCoachReadOnly(text)).toBe(true));
it.each(['Move Push to Sunday','Swap Monday and Friday','Prestavi včerajšnji trening na danes','I cannot train on Monday'])('recognizes scheduling: %s',text=>expect(isCoachScheduleRequest(text)).toBe(true));
it.each(['Combine Push and Pull','Why should I move Push?','How is my week?','Povej mi o planu'])('does not request a schedule mutation: %s',text=>expect(isCoachScheduleRequest(text)).toBe(false));
