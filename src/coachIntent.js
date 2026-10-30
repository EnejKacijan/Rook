export const normalizeCoachMessage=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[’‘]/g,"'");
const combineWord=/\b(?:combin\w*|condens\w*|merg\w*|zdruz\w*|skombinir\w*)\b/;
export function isCombineTopic(value){
  const text=normalizeCoachMessage(value);
  return combineWord.test(text)||/\b(?:skupaj|skupi|skup)\b/.test(text)&&/\b(?:trening\w*|workout\w*|sessions?|daj|spravi|sestavi|put)\b/.test(text)||
    /\b(?:two|both|dva|oba|dve|obe)\b.*\b(?:workout\w*|trening\w*|sessions?)\b.*\b(?:into one|in one|v en(?:ega)?|v eno)\b/.test(text);
}
export function isCombineDeclined(value){
  return /\b(?:ne|don't|dont|do not|never)\s+(?:(?:mi|jih|ju|tega|it|them|please|prosim)\s+){0,3}(?:zdruz\w*|combin\w*|merg\w*|skombinir\w*)\b/.test(normalizeCoachMessage(value));
}
export function isCoachReadOnly(value){
  const text=normalizeCoachMessage(value).trim();
  if(/\b(?:and|then|pa|in|ter)\s+(?:combine|merge|zdruzi|premakni|prestavi|dodaj|odstrani|move|add|remove|change|adjust|fix|spremeni|prilagodi|popravi|zamenjaj)\b/.test(text))return false;
  return /^(?:please\s+)?(?:why\b|how\b|explain\b|what (?:is|are|does|do|would|happens)\b|is .+ (?:good|okay|ok|safe)\b|zakaj\b|kak(?:o)?\b|razlozi\b|povej\b|kaj (?:pomeni|mislis|menis|se zgodi|je|so|ce|bi)\b)/.test(text)||
    /\b(?:would|is|bi|ali je|a je).{0,35}(?:better|good idea|smiselno|boljse|bolje)\b/.test(text)||
    /^(?:(?:i (?:want|would like) to|can you|could you|please)\s+)?(?:review|assess|evaluate|explain|tell|check)\b/.test(text)||
    /^(?:lahko\s+)?(?:ocenis|preveris|pogledas|preglej|oceni|preveri|razlozis|poves)\b/.test(text)||
    /\b(?:samo (?:razlozi|povej|zanima)|just (?:explain|asking)|don't change|do not change|ne spreminjaj|brez sprememb)\b/.test(text);
}
export const isCombineIntent=value=>isCombineTopic(value)&&!isCombineDeclined(value)&&!isCoachReadOnly(value);
export const isCoachCancellation=value=>/^(?:cancel(?: (?:that|it|this|the proposal))?|never mind|nevermind|stop|pusti|preklici|ne hvala|pozabi|ne to|ne tega)[.!?\s]*$/.test(normalizeCoachMessage(value).trim());
export const isCoachAcknowledgement=value=>/^(?:yes|yeah|ok|okay|do it|yes please|okay do it|thanks|thank you|ja|ja daj|ja prosim|da|daj|potrdi|okej|hvala|super|top|pokazi(?: te| mi)?|show (?:it|the proposal))[.!?\s]*$/.test(normalizeCoachMessage(value).trim());
export function isWorkoutTimeAnswer(value){
  const text=normalizeCoachMessage(value).trim();
  if(/\b(?:sleep|slept|spal\w*|spanj\w*|rest|pocitek|odmor|reps|ponovit\w*|kg|lbs|calories|kcal)\b/.test(text)&&!/\b(?:whole workout|total workout|celoten trening|cas za trening)\b/.test(text))return false;
  if(/too short|too long|premalo|predolgo/.test(text)&&!/make|change|shorten|extend|spremeni|podaljs|skrajs/.test(text))return false;
  return /^\s*[+-]?\d+(?:[.,]\d+)?(?:\s*(?:h\d+|h|m|min\w*|hours?|ur\w*))?\s*[.!?]*$/.test(text)||
    /\b(?:imam|mam|have|available|min|minutes?|minut\w*|cas\w*|hours?|uro|uri|ure|half an hour|pol ure|no strict limit|no time limit|brez omejitve)\b/.test(text);
}
export function isCoachScheduleRequest(value){
  const text=normalizeCoachMessage(value);
  return !isCombineTopic(value)&&!isCoachReadOnly(value)&&
    /\b(?:move|swap|reschedul\w*|rearrang\w*|shift|prestav\w*|premak\w*|zamenj\w*|razpored\w*|urnik|available days|availability|unavailable|can't train|cannot train|ne morem (?:trenirati|trenirat|v (?:ponedeljek|torek|sredo|cetrtek|petek|soboto|nedeljo)))\b/.test(text);
}
export function coachActionWithinScope(action,message){
  if(!action)return true;
  if(isCoachReadOnly(message))return false;
  const text=normalizeCoachMessage(message);
  if(isCombineTopic(message))return ['combine-workouts','revise-combined-workout'].includes(action.type);
  if(action.type==='week-schedule-change'){
    if(!isCoachScheduleRequest(message))return false;
    const wholeWeek=/\b(?:week|teden|tedna|tedn|urnik|availability|available|unavailable|preostal\w*|remaining)\b/.test(text);
    const swap=/\b(?:swap|exchange|zamenj\w*)\b/.test(text);
    return wholeWeek||(action.changes?.length||0)<=(swap?2:1);
  }
  if(action.type==='program-exercise-change'&&/\b(?:today|danes|this session|ta trening)\b/.test(text)&&!/\b(?:plan|program|permanent\w*|recurring|each|always|vsak\w*|vedno)\b/.test(text))return false;
  return true;
}

export function combineFailureText(error,sl){
  if(!sl)return error;
  const text=String(error||'');
  if(/10.?180|Choose .*minutes/.test(text))return 'Izberi od 10 do 180 minut ali možnost brez časovne omejitve.';
  if(/cannot fit|coverage|useful combination|minimum/.test(text))return 'Pomembne vaje iz obeh treningov ne gredo v ta čas. Izberi več časa ali opravi samo en trening.';
  if(/active workout|workout already|already in progress/.test(text))return 'Najprej dokončaj ali prekliči trening, ki že poteka.';
  if(/current adjustment|current workout adjustment|combined workout/.test(text))return 'Najprej dokončaj ali prekliči trenutno pripravljen trening.';
  if(/custom warm-up|unsupported group/.test(text))return 'Eden od treningov ima posebno ogrevanje ali povezane vaje. Najprej preglej izvirnik; teh podatkov ne bom odstranil.';
  if(/source|source workout|no longer available|unresolved sessions/.test(text))return 'Eden od izbranih treningov ni več na voljo. Ponovno izberi dva še neopravljena treninga.';
  if(/restrictions|equipment|training setup|specific detail|Review .+ first/.test(text))return 'Najprej preveri označene podatke o vajah, opremi ali omejitvah. Treningov še nisem spreminjal.';
  if(/schedule|plan changed|outdated/.test(text))return 'Urnik se je spremenil. Najprej preglej aktualne termine; treningov nisem spreminjal.';
  return 'Tega predloga trenutno ne morem pripraviti. Preveri izbrana treninga in čas; ničesar nisem spremenil.';
}
