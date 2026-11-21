function normalizeTimeRequest(message) {
  return message.normalize('NFKC').toLowerCase()
    .replace(/[٠-٩]/g,digit=>String(digit.charCodeAt(0)-0x660))
    .replace(/[۰-۹]/g,digit=>String(digit.charCodeAt(0)-0x6f0))
    .normalize('NFD').replace(/\p{M}/gu,'').normalize('NFC');
}

export function requestedCoachWorkoutMinutes(message) {
  const text=normalizeTimeRequest(message);
  const number=text.match(/(?<![\d.,])(\d{2,3})\s*(?:(?:min(?:ut\p{L}*|s)?|минут\p{L}*|хвилин\p{L}*|دقيق\p{L}*|دقائق|دقیق\p{L}*)(?!\p{L})|分(?:钟|鐘|間)?|분)/u)?.[1];
  const minutes=Number(number);
  return minutes>=10 && minutes<=240 ? minutes : null;
}

// Full weekday names and common inflections used in schedule requests.
// Keep ambiguous short names limited to the existing English shortcuts.
const weekdayByWord=new Map([
  ['Mon','monday ponedeljek ponedeljka ponedeljku ponedeljkov montag lunes lundi lunedi segunda-feira ponedjeljak ponedjeljka ponedjeljku понедельник понедельника понеділок понеділка понеделник الاثنين'],
  ['Tue','tue tuesday torek torka torku torkov dienstag martes mardi martedi terca-feira utorak utorka utorku вторник вторника вівторок вівторка вторник الثلاثاء'],
  ['Wed','wed wednesday sreda sredo sredi sredin mittwoch miercoles mercredi mercoledi quarta-feira srijeda srijedu srijede среда среду среды середа середу среди сряда الاربعاء'],
  ['Thu','thu thursday cetrtek cetrtka cetrtku cetrtkov donnerstag jueves jeudi giovedi quinta-feira cetvrtak cetvrtka cetvrtku четверг четверга четвер четвъртък الخميس'],
  ['Fri','fri friday petek petka petku petkov freitag viernes vendredi venerdi sexta-feira petak petka petku пятница пятницу пятницы пятниця пятницю петък الجمعة'],
  ['Sat','sat saturday sobota soboto soboti sobote sobotni samstag sonnabend sabado samedi sabato subota subotu subote суббота субботу субботы субота суботу суботи събота السبت'],
  ['Sun','sun sunday nedelja nedeljo nedelji nedelje nedeljski sonntag domingo dimanche domenica nedjelja nedjelju nedjelje воскресенье воскресенья неділя неділю неділі неделя الاحد'],
].flatMap(([day,words])=>words.split(' ').map(word=>[word,day])));

const asianWeekdays={
  一:'Mon',二:'Tue',三:'Wed',四:'Thu',五:'Fri',六:'Sat',日:'Sun',天:'Sun',
  月:'Mon',火:'Tue',水:'Wed',木:'Thu',金:'Fri',土:'Sat',
  월:'Mon',화:'Tue',수:'Wed',목:'Thu',금:'Fri',토:'Sat',일:'Sun',
};
const dayAfterTomorrow=/(?<!\p{L})(?:day after tomorrow|pojutri|ubermorgen|pasado manana|apres-demain|dopodomani|depois de amanha|prekosutra|послезавтра|післязавтра|вдругиден|بعد غد)(?!\p{L})|后天|後天|明後日|あさって|모레/u;
const tomorrow=/(?<!\p{L})(?:tomorrow|jutri|jutrisn\w*|morgen|manana|demain|domani|amanha|sutra|sutrasnj\w*|завтра|утре|غدا|غد|فردا)(?!\p{L})|明天|明日|あした|내일/u;
const today=/(?<!\p{L})(?:today|danes|dans|heute|hoy|aujourd['’]hui|oggi|hoje|danas|сегодня|сьогодні|днес|اليوم|امروز)(?!\p{L})|今天|今日|きょう|오늘/u;

export function coachWorkoutDayReference(message) {
  const date=message.normalize('NFKC').match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (date) return {date};
  const text=normalizeTimeRequest(message);
  const words=text.match(/[\p{L}]+(?:-[\p{L}]+)*/gu) || [];
  const shortMonday=/\b(?:(?:on|for)\s+mon\b|mon\.?\s+\d)/.test(text);
  const asian=text.match(/(?:星期|周|週)([一二三四五六日天])|([月火水木金土日])曜(?:日)?|([월화수목금토일])요일/u);
  const weekday=words.map(word=>weekdayByWord.get(word)).find(Boolean) ||
    asianWeekdays[asian?.[1] || asian?.[2] || asian?.[3]] || (shortMonday ? 'Mon' : null);
  if (weekday) return {weekday};
  if (dayAfterTomorrow.test(text)) return {offset:2};
  // In Spanish and German the same word also means "morning".
  const relative=text.replace(/\b(?:(?:por|de|en) la manana|am morgen|heute morgen)\b/g,term=>term.startsWith('heute')?'heute':'');
  if (tomorrow.test(relative)) return {offset:1};
  if (today.test(relative)) return {offset:0};
  return null;
}
