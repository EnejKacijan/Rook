# ROOK: pregled in izboljšava landinga ter paywallov

Delaj na najnovejšem commitu veje `codex/claude-visual-audit-oct30` v
`https://github.com/EnejKacijan/Rook`. Ne začni iz starega `main` in ne uporabi
prejšnjega patcha kot nove baze. Najprej preberi `AGENTS.md` in ta brief.

## Cilj in obseg

Želim, da s svojim najboljšim produktnim in oblikovalskim znanjem izboljšaš
predstavitev ROOK-a: intro, landing znotraj appa, predstavitev Pro, kontekstualne
paywalle in pot od zanimanja do jasne odločitve za nakup. Cilj je prepričljiv,
vizualno urejen tok, iz katerega uporabnik hitro razume, kaj dobi in zakaj mu to
koristi. Ne zadovolji se s prebarvanim gumbom, splošnim nasvetom ali dvema slikama.
Preglej vse relevantne zaslone, njihove povezave in pomembna stanja, razišči
primerljive produkte, izberi smiselno smer in jo dejansko implementiraj za pregled.

Pomembno: trenutna veja je namerno brez aktivnih paywallov, plačilnega SDK-ja in
omejitev Pro. To ni pokvarjen paywall. Prejšnji Pro zasloni so obstajali v ločeni
lokalni razvojni kopiji in niso bili v Git zgodovini te veje. Njihov preverjen
posnetek kode je v `docs/reference/monetization/README.md` in `source/`.
Datoteke imajo končnico `.reference`, da se ne vključijo v app ali teste.
To je izhodišče za pregled, ne odobrena trenutna ponudba ali delujoč checkout.
Ne trdi, da si v trenutni aplikaciji videl live paywall, če si videl le prototip.

Ohrani aktualen brezplačni app. Paywall in Pro tok izboljšaj v ločenem,
delujočem DEV predogledu z izrecnim zagonom in izoliranimi sintetičnimi podatki;
proizvodni app ga ne sme uvoziti ali vklopiti prek URL parametra. Za landing
lahko izboljšaš dejanske skupne zaslone, če ohraniš vse obstoječe vstopne poti in
brezplačen dostop. Plačljivo različico landinga prikaži v izoliranem predogledu.
Ne nameščaj plačilnih SDK-jev in ne spreminjaj entitlementov, kvot, cenika ali
poslovnega modela kot stranski učinek vizualnega dela. Predloge za drugačno
pakiranje ponudbe jasno loči od tega, kar je dejansko odobreno in implementirano.

## 1. Najprej ugotovi dejansko stanje

- Zapiši commit, uporabljene datoteke in razlike med aktualnim free appom,
  priloženim Pro referenčnim posnetkom in svojim predogledom. Preveri funkcije
  v aktualni kodi; stare štiri omejene saved-workout reže in stare kvote niso
  trenutna omejitev free appa.
- Zaženi dejanski aktualni intro in EntryLanding. Sestavi inventar vseh
  relevantnih zaslonov in pomembnih stanj. Vključi prvo odprtje, vrnitev,
  Build my plan, Bring my plan, Create workout, Freestyle, prijavo in Restore
  backup tam, kjer vplivajo na pot. Ne poškoduj obstoječega onboarding toka.
- V Pro predogledu odpri osnovni paywall in vse obstoječe kontekste:
  generiranje novega plana, Coach, shranjeni treningi, začasni plan in teme.
  Preglej tudi feature explorer, interaktivne primere in morebitne ponudbe.
  Za sintetične kontekste jasno označi, da niso trenutno aktivne free omejitve.
- Posnemi stanje pred spremembami v delujočem vmesniku. Za Pro uporabi
  dejanske referenčne komponente v izoliranem harnessu, ne na novo narisane
  nadomestne makete. Shared komponente, tipografijo in motion vzemi iz zadnje
  verzije appa; ne vrni starih skupnih CSS datotek ali celotnega starega App.jsx.

## 2. Naredi aktualno raziskavo

Sam razišči čim širši smiseln izbor aktualnih paywallov, onboardingov in
prodajnih tokov uspešnih appov. Ciljaj na 12–20 relevantnih primerov, od tega
vsaj 8 podrobno primerjaj, če lahko pridobiš zanesljive javne vire. Prednost
imajo trening in fitnes aplikacije; za orientacijo lahko preveriš Hevy, Strong,
Fitbod, Alpha Progression, Freeletics, Ladder, Caliber in primerljive produkte.
To so kandidati za raziskavo, ne vnaprej dokazana lestvica uspešnosti. Dodaj
nekaj odličnih primerov iz drugih naročniških appov, če je njihov vzorec uporaben.

Uporabi aktualne uradne strani, dejansko vidne zaslone, javne študije primerov
in poročila ponudnikov naročniške infrastrukture. Pri galerijah paywallov
preveri datum, platformo in kontekst. Za vsak glavni sklep navedi vir in datum
dostopa ter povej, ali si videl dejanski zaslon, star posnetek ali samo opis.
Omejenega dostopa do tekmečeve aplikacije ne nadomesti z izmišljeno vsebino.
Ne kupuj naročnin in ne sprejemaj plačilnih obveznosti zaradi raziskave.

Loči dokaz od domneve: popularnost ali lep screenshot ne dokazujeta boljše
konverzije. Za številke o konverziji navedi vzorec, platformo in omejitve,
če so na voljo. ROOK-ovega prihodnjega povečanja prodaje ne predstavljaj kot
izmerjen rezultat. Raziskava naj vodi do odločitev, ne do slepega kopiranja.

Primerjalna tabela naj zajema: prvi zaslon in obljubo, trenutek ponudbe,
konkretno predstavitev vrednosti, dokaz ali predogled, količino besedila,
hierarhijo CTA-jev, mesečno/letno izbiro, trial, ceno in obnovitev, zapiranje,
restore, ponudbe, vizualno gostoto ter ujemanje s preostalim appom. Za ROOK
izlušči, kaj prevzameš, kaj prilagodiš in česa ne uporabiš, z razlogom.

## 3. Izberi in implementiraj smer, ki paše v ROOK

Pripravi 2–3 kratke konceptualne smeri, jih primerjaj in sam izberi najboljšo.
Nato jo implementiraj in po dejanskih screenshotih izboljšaj. Ne čakaj na mojo
odobritev vsakega razmika. Potrebujem konkretne pred/po primerjave za končno presojo.

- Vrednost razloži skozi resnične potrebe uporabnika in preverjene funkcije:
  kako lažje načrtuje, trenira in ve, kaj narediti naslednjič. Ne naštevaj samo
  abstraktnih buzzwordov. Uporabnik mora razumeti razliko med free in predlaganim
  Pro, ne da bi obstoječe brezplačne funkcije nenadoma zaklenil.
- Kjer koristi, pokaži kratek resničen interaktiven primer funkcije ali jasno
  označen sintetičen primer. Ne dodajaj lažnih klikljivih kontrol ali obljub,
  ki jih funkcija ne izpolni. Ne prodajaj neomejenega AI, če obstajajo omejitve.
- Kontekstualni paywall naj nagovori dejanski razlog prihoda, uporablja skupne
  vzorce in ohrani varen povratek k uporabnikovemu začetemu delu. Ne prikazuj
  paywalla med vpisovanjem seta, rest timerjem ali obnovo aktivnega treninga.
- Ohranjen naj bo čist izgled aktualnega ROOK-a, ne generičen prodajni template.
  Uporabi sedanje barvne tokene, shared chevrone, info sheete, animacije,
  footerje in tipografske vloge. Uporabniku so bili stari fonti preveliki:
  body 15px, action 14px, utility 13px, content heading 18px, page heading
  22px, v rem; input vsaj 16px, touch target vsaj 44px. Za izjemo pokaži razlog
  in dejanski mobile screenshot, ne povečuj vsega zato, da bi delovalo prodajno.
- En jasen glavni CTA na korak, razpoznavna sekundarna dejanja, malo podvajanja
  in dovolj prostora. Brez odvečnih zadnjih črt, dvojnih separatorjev,
  nepotrebnih kartic v karticah, odrezanega teksta, lažnega scroll prostora
  ali velikega praznega footerja. Več razlage prestavi pod info le tam, kjer
  ni potrebna za razumevanje ponudbe ali stroška.
- Zaupanje gradi z realno vrednostjo. Brez izmišljenih ocen, uporabnikov,
  pričevanj, rezultatov, lažnih countdownov, navideznih popustov, resetiranja
  rokov, skritega zapiranja ali nagovarjanja, ki sramoti zavrnitev. Jasna
  možnost zapiranja je del dobrega produkta.
- Cena, celotni obračunani znesek, interval in obnova naj bodo jasni pri izbiri
  in CTA-ju. Letna mesečna protivrednost ne sme prekriti letnega računa.
  Trial navedi samo ob potrjeni upravičenosti, z dejanskim trajanjem in stroškom
  po trialu. Pri neznani upravičenosti ne obljubi brezplačnosti. Popuste računaj
  iz preverljivih primerljivih cen. Ne izmišljaj končnih cen ali jamstva vračila.
- Cene in ponudbe v predogledu so izrecno sintetične; dejanska ponudba bo morala
  priti od plačilnega ponudnika. Obstoječe pravne strani opisujejo free verzijo:
  ne prepiši jih v lažno pripravljene plačilne pogoje in ne oglašuj live nakupa.
  Predlagane spremembe pogojev zabeleži kot odprto odvisnost za prihodnjo uvedbo.

## 4. Preveri celoten relevantni tok, ne samo happy path

V delujočem predogledu preveri vse kontekste, oba plana in prehode nazaj;
potrjen, zavrnjen in neznan trial; manjkajoč ali nalagajoč se product;
različne valute in dolge prevedene cene; izteklo ali neupravičeno ponudbo;
odprt explorer in vrnitev z ohranjeno izbiro/fokusom; ponovno odprtje;
loading, pending, cancel, failure, timeout in uspeh nakupa ter restore brez
nakupa in z aktivnim dostopom. Plačilne izide simuliraj z jasno ločenim mockom;
nikoli ne kliči resničnega purchase, restore ali billing endpointa.

Preveri dvojni klik, zapiranje med čakanjem, izgubo povezave, ohranitev
začetega uporabnikovega dela ter odsotnost dvojnega nadaljevanja po uspehu.
Če referenčna koda obljublja nekaj, česar ni, popravi predstavitev in to zapiši.

Zajemi in preglej pri 320, 393 in 430 CSS px, Light in Dark, vsaj Green in Gold
ter še eni paleti, pri povečanju besedila 130 %/200 %, pri zoomu 200 %,
z reduced motion in s tipkovnico. Kjer testiraš formo ali sheet, preveri tudi
nizek viewport za odprto tipkovnico. Če nimaš pravega telefona ali store SDK-ja,
to izrecno povej; simulacija ni preverjanje pravega sistema ali nakupa.

Dodaj smiselne vedenjske regresije za spremenjeno interakcijo in ohrani
cenovne/eligibility/deduplication varovalke. Ne briši testov za free dostop,
da bi nova omejitev navidezno prestala. Zaženi ciljne teste, build in celoten
nabor; morebitne padce preveri tudi na izhodišču in jasno loči svoje regresije
od dokazanih obstoječih napak. Ne označi padca za nestabilnega brez dokazila.

## 5. Kaj mi vrneš

1. Kratek povzetek najpomembnejših odločitev in zakaj so primerne za ROOK.
2. Raziskavo z neposrednimi viri in primerjalno tabelo; dokaze loči od hipotez.
3. Inventar vseh relevantnih zaslonov/stanj z oznako: zajeto, implementirano,
   preverjeno, nepreverjeno. Ne trdi, da je pregledan celoten app, če je pregledan
   samo ta prodajni tok.
4. Pregledne primerjave pred/po istih stanj z enako širino in temo, kontaktni
   pregled ter posamezne screenshot datoteke. Priloži ukaz in lokalne URL-je,
   s katerimi lahko odprem tudi edge stanja.
5. En kumulativni patch nad natančno navedenim izhodiščnim commitom, brez
   odvisnosti od tvojih nejavnih datotek. `git apply --check` naj uspe na čistem
   izhodišču. Priloži SHA-256, seznam datotek, rezultate testov in builda ter
   realne vrzeli. Ne vrni samo predlogov ali slik brez implementacije.
6. Kratek predlog naslednjega merjenja: katere variante in dogodke bi bilo
   smiselno primerjati (nakup, aktivacija, odjava/vračilo), brez vklopa novega
   sledenja. Za zdaj ne dodajaj SDK-ja, ne zbiraj novih osebnih podatkov in ne
   trdi, da je neizmerjena smer dokazano boljša.

## Meje tega dela

Delaj z izoliranimi sintetičnimi podatki in ohrani vse zadnje lokalne popravke.
Ni novih nakupov, pravih plačil, novih kvot, aktivacije naročnin, sprememb računov,
credentialov ali store produktov. Ni commita, pusha, PR-ja, mergea v `main`,
Netlify objave ali build hooka. `netlify.toml` in `build.ignore` ostaneta
nespremenjena. Če lokalni port 4400 že uporablja celoten app, ga ne zamenjaj z
account-disabled QA strežnikom; izoliran predogled uporabi na drugem portu.

Začni z inventarjem in raziskavo, nato nadaljuj do delujočega, preverjenega
rezultata. Hočem prepričljiv ROOK, ki daje uporabniku jasen razlog za nakup
in se po izgledu ter obnašanju ujema z appom.
