# Claude: vikend opomnik za tedenski streak

## Naloga in izhodišče

Delaj v `EnejKacijan/Rook`, na najnovejšem commitu veje
`codex/claude-visual-audit-oct30`. Najprej zabeleži `git rev-parse HEAD` in preberi
`AGENTS.md` ter `docs/claude-review-snapshot-nov1.md`. Vse dosedanje lokalne
spremembe so vključene v nov posnetek te veje; ne uporabljaj `main`, starega
commita `e27689e` ali prenesenih starih patchev.

Uporabnik želi nevsiljiv opomnik, če do sobote ali nedelje še ni zaključil
treninga in bi po koncu tedna izgubil obstoječi streak. Premisli o najboljši
predstavitvi in jo implementiraj v dejanski aplikaciji. Morebitna animacija naj
bo umirjena in smiselna. To je ciljni pregled teh stanj, ne nov pregled vseh
zaslonov aplikacije.

Samodejnega vikend opomnika v izhodišču še ni. Trenutno je samo besedilo
»This week is still open. Log a workout by Sunday to keep your streak going.«
v podrobnostih streaka v Profilu. Ob zaključku prvega treninga v tednu že obstaja
enkratna animacija števca; ne dodajaj drugega sistema štetja ali praznovanja.

## Pravilo, ki mora ostati nespremenjeno

- Teden teče od ponedeljka do nedelje po lokalnem koledarju naprave.
- Zadostuje vsaj en dejansko zaključen trening v tednu. Izpuščen načrtovani
  trening sam po sebi ne prekine streaka. Popolnoma prazen pretekli teden ga.
- Strength šteje z vsaj enim opravljenim setom; cardio, conditioning in mobility
  po vsaj eni minuti zaključene aktivnosti. Uporabi obstoječe pomočnike.
- Upoštevaj dejanski datum vadbe iz `workoutPerformedDate`, ne poljubno
  prestavljenega dneva plana ali samo časa zaključka. Trening od prejšnjega
  tedna, zaključen danes, zato ne sme dobiti obljube, da bo zagotovil ta teden.
- Tekoči teden ima čas do konca nedelje. Sam obisk aplikacije, počitek, premik
  dneva ali odprt trening še ne dodajo tedna.
- Uvoz zgodovine lahko obnovi dejansko stanje, ne sproži pa nove nagrade za
  uvoz. Brisanje, popravek ali nadaljevanje treninga stanje ponovno izračunajo.

Logiko izpelji iz `weeklyTrainingStreak`, `useLocalDay` in obstoječe zgodovine.
Ne spreminjaj pravila v »opravi vse načrtovane treninge« in ne uvajaj dnevnega
streaka, zamrznitev ali dodatnih kreditov.

## Odločitev o prikazu

Predlagano izhodišče je sobota in nedelja, samo če je `current > 0`,
`earnedThisWeek === false` in uporabnik gleda resnični današnji dan. Pretehtaj,
ali zadostuje sobota ali šele nedelja; izberi in kratko utemelji prag. Ne
uporabljaj poljubnega odštevanja ur za zaznavanje dneva.

- Ena kompaktna, mirna vrstica na Today je primernejše izhodišče od velike
  opozorilne kartice ali samodejnega modalnega okna. Primerjaj jo s trenutnimi
  missed-workout in active-workout obvestili. Izogni se kupu podobnih kartic.
- Ob aktivnem treningu ne tekmuj z nadaljevanjem in zaključkom. Ne preusmeri
  uporabnika na Today ali v nov trening sredi trenutnega. Ne predpostavljaj,
  da konec katereregakoli odprtega treninga zagotovi ta teden.
- Povezava lahko odpre obstoječe podrobnosti streaka ali smiselno trenutno
  dejanje; mora dejansko delovati tudi pri rest dayu ali brez današnjega
  načrtovanega treninga. Ne zaženi ali prestavi treninga brez izbire uporabnika.
- Novi uporabnik s streakom 0 nima česa izgubiti. Po že zaključenem treningu
  v tekočem tednu opozorila ni, tudi če ima druge missed workouts.
- Besedilo naj bo kratko, v angleščini, stvarno in podporno. Ne pritiskaj na
  vadbo ob poškodbi, bolezni ali potrebnem počitku. Ne uporabljaj rdečega alarma
  ali sramotenja. Primer: »One workout this week keeps your 3-week streak going.«
- Omogoči tih dismiss za ta teden. Če si uporabnik opomnik skrije, ga ne
  prikazuj znova ob vsakem obisku, preklopu zavihka ali remountu. Omejene zapise
  prikaza/dismiss loči po profilu in tednu; niso del treningov ali nagrad.
  Spoštuj obstoječe brisanje lokalnih podatkov in odpornost na napake shrambe.
- Opomnik izgine takoj po veljavnem zaključku. Tudi ob urejanju/uvozu/izbrisu
  zgodovine, zamenjavi profila, vrnitvi v aplikacijo in prehodu čez polnoč se mora
  upravičenost pravilno ponovno izračunati.

Začni z opomnikom v aplikaciji. Ne obljubljaj obvestil, ko je aplikacija zaprta,
če ni implementiran in preverjen ustrezen mehanizem. Za ta krog ne dodajaj
SDK-jev, push strežnika, e-poštnih kampanj, stroškov ali nove zahteve za sistemsko
dovoljenje. Morebitno širšo možnost obvestil predlagaj ločeno z jasnimi omejitvami.

## Gibanje in konsistentnost

Če animacija izboljša razumevanje, uporabi kratek prehod po obstoječih motion
žetonih, največ ob prvem dejanskem prikazu v upravičenem tednu. Brez zank,
utripanja, tresenja, konfeta, lažnega aktivnega segmenta ali stalnega animiranja
barve. Upoštevaj `prefers-reduced-motion`; informacija mora biti jasna tudi brez
gibanja. Ne kradi fokusa in ne ponavljaj glasnih obvestil bralniku zaslona.

Ohrani že sprejeto:

- Profile: ena kompaktna vrstica »Weekly streak · N weeks ›«; Best in koledar
  zadnjih šestih tednov sta v skupnem spodnjem listu po kliku na celotno vrstico.
- Weekly review: črtice kažejo samo dokončano/še nedokončano. Aktivni trening
  ima eno mirno besedilno oznako; uporabnik je zavrnil pikčasto dekoracijo.
- Obstoječe skupne info/ModalLayer/AnimatedDetails animacije in fokus, dosledni
  chevroni, en sam ločilnik in trenutna tipografija.
- Nobenih premium omejitev ali paywallov.

## Preverjanje in predaja

Zaženi dejansko aplikacijo v cloud okolju z `--mode theme-preview` in
`VITE_ROOK_ACCOUNT_SYNC_ROLLOUT=false`; uporabi izolirane sintetične podatke.
Namig: nove strani `review/streak-detail-preview/` in
`review/workout-recovery-preview/` uporabljajo začasno pomnilniško shrambo, zato
ne potrebujejo pravih podatkov ali praznjenja uporabnikovega localStorage.
Za novo stanje po potrebi dodaj dev-only fixture z istimi varovali. Ni potrebe
po Claude Desktop, Remote Control ali dostopu do lokalne mape na uporabnikovem PC.

Zajemaj dejanske screenshote pred in po, ne maket. Primerjaj najmanj:

1. Petek/sobota/nedelja, obstoječ streak, ta teden brez treninga.
2. Nedelja pred koncem dneva in ponedeljek po začetku novega tedna, tudi ob
   vrnitvi iz ozadja brez reloada; DST, prehod leta in lokalni čas.
3. Že opravljen trening ta teden; 0 streak; nov uporabnik; že prekinjen niz;
   več načrtovanih/missed treningov, od katerih je vsaj eden zaključen.
4. Aktivni strength trening iz tega in prejšnjega tedna ter aktivna optional
   session. Rest day s smiselno povezavo, brez napačnega zagona drugega treninga.
5. Dismiss, remount/reload, naslednji teden, menjava profila in napaka shrambe.
6. Zaključek/Continue/Undo/izbris/urejanje/uvoz, ki spremenijo upravičenost.
7. Today s hkratnim missed-workout ali active-workout obvestilom, Profile in
   podrobnosti streaka; zgodovinski in prihodnji dan ne smeta dobiti opozorila.

Preveri 320/393/430 px, svetlo/temno, Green in Gold, 200 % besedilo, fokus s
tipkovnico, reduced motion in brez vodoravnega preliva. Prave telefonske
tipkovnice ali screen readerja ne označi za preverjenega samo na osnovi simulacije.
Dodaj smiselne teste za pravilo in dejanja, zaženi povezane obstoječe teste in
build; po širših skupnih spremembah tudi celotno zbirko. Nestabilne padce
preveri na vhodni reviziji, ne razglasi jih za stare brez primerjave.

Vrni kratko utemeljitev praga/postavitve, seznam dejansko pregledanih stanj,
screenshote pred/po, rezultate testov/builda, omejitve ter en patch nad svojim
zabeleženim vhodnim commitom s SHA-256 in uspešnim `git apply --check`.

**Ne delaj commitov, pusha, PR-ja, mergea ali objave na Netlify. Ne spreminjaj
`netlify.toml` ali hosting nastavitev; `build.ignore = "exit 0"` ostane.**
