# ROOK privacy and legal checklist — local implementation, 1 November 2026

This implements the user's checklist in the existing free app. It is not a legal
opinion, a promise that ROOK cannot be sued, a security certification or proof
that operational duties have been completed. No deployment, push, account-setting
change, consent on a real user's behalf or real data deletion was performed.

The user confirmed they do not yet have a company. We have not invented a
controller identity, address, tax/registration number or contact email. A
controller can be a natural person; the missing requirement is a verified public
operator and contact, not an assumption that a company is already registered.

## Checklist decisions

| Requested item | Decision and implementation |
| --- | --- |
| Privacy policy | Draft at `/legal/privacy.html`, available without an account. Describes actual local storage, optional Firebase, OpenAI, photos, usage events, rights, retention limits and unresolved deployment matters. |
| Terms of service | Draft at `/legal/terms.html`. Defines the current free service, training/AI limits and content rights. No blanket waiver of mandatory rights or invented governing-law clause. |
| Refund policy | `/legal/refunds.html` accurately explains that this version has no purchase, subscription or renewal. No arbitrary “no refunds” rule or invented store purchase policy. |
| Cookie policy | `/legal/cookies.html` covers localStorage, sessionStorage, IndexedDB, Cache Storage and optional authentication persistence, not only traditional cookies. |
| Cookie consent banner | No blanket popup added to a build using essential requested storage and default-off local diagnostics. Optional diagnostics require deliberate opt-in in Profile. Any new marketing/analytics SDK or injected hosting tracker needs a new prior-consent assessment and must remain blocked meanwhile. This conclusion concerns the reviewed build; production dashboard-injected scripts were not inspected. |
| Check form consents | Account and entry flows expose Privacy/Terms links. AI sharing is a separate unchecked explicit consent, including health information voluntarily supplied, before authorization or a content POST. Decline is respected once, not reopened by plan retries. Existing separate photo-selection/review controls stay. No privacy “accept everything” or preselected marketing checkbox. Binding acceptance of final Terms and cloud-health lawful bases still need the release review; drafts are not passed off as final contracts. |
| Don't collect unnecessary data | Usage-event writes and adapter events are off by default, including once-only markers. Startup clears legacy optional diagnostics when there is no opt-in. Withdrawal clears history. Structured AI profile fields are whitelisted; display name, account identifiers, email and display settings are omitted on client and provider boundary. Workout identifiers and safety constraints are retained. User-entered free text is not falsely claimed to be anonymised. |
| Audit third-party SDKs | Reviewed imports/configuration of Firebase Auth/Firestore, Capacitor, OpenAI server calls, Netlify adapter, local analytics and installed production packages. Firebase Analytics/Storage SDK initialization and ad/payment SDKs are absent from reviewed runtime code. API response storage is already false. Auth/ownership/rate/spend guards remain intact. `npm audit --omit=dev` found RE2JS GHSA-gg6h-894w-4m9c; lockfile updated from 2.8.6 to compatible 2.9.1, then zero reported production vulnerabilities. This is not a penetration test or verification of provider dashboards. |
| Remove dark patterns | Optional choices default off; decline remains available with keyboard focus; no repeated AI prompts on declined retry; withdrawal is direct, announced and restores focus. No pricing/renewal traps introduced. Broad existing whole-app visual work remains preserved. |
| Remove hidden fees | No checkout/payment SDK in current app. The notice states the actual free release. API operator costs/quotas are not a user payment. No paywall added. |
| Remove fake reviews | No fabricated customer review, testimonial or star-rating claim found in the reviewed runtime/entry copy. None added. |
| Remove unsupported claims | No guaranteed-results/injury-prevention claim found in the inspected entry/runtime copy. Guidance, e1RM and time estimates retain their qualifiers. Terms explain AI/training/illustration limits, without claiming legal immunity. |
| Accessibility alt text | Existing exercise artwork uses meaningful alt text when informative and empty alt when duplicated by an adjacent exercise label/decorative. Private photo viewers have text alternatives. Existing credits are retained. New legal pages use real headings, text links and navigation rather than image text. See the generated source inventory and browser checks; no whole-app WCAG certification is claimed. |
| Keyboard navigation | New controls use native inputs/buttons/links; public pages have skip links, visible focus and reflow. AI dialog uses the existing ModalLayer focus trap/escape/restoration and motion. Tested Space, Escape, cancel, explicit acceptance and withdrawal. Fixed focus loss when the withdrawal button disappears. Existing navigation/overlay tests remain applicable. |
| Add business details | Dedicated Operator & contact page and one configuration module, `src/legalOperator.js`. Intentionally pending verified data. All notices remain marked draft/noindex until operator details AND explicit publication approval exist. `node scripts/check-legal-readiness.mjs` reports this honestly. |
| Unsubscribe link in emails | The app sends no marketing newsletters/campaigns. Firebase sign-in/password-reset/verification are transactional account flows. No fake unsubscribe control added to emails we do not send or control. A future marketing system needs separate optional opt-in, working unsubscribe and suppression, and a provider/template review before activation. |
| License fonts/images | System font stack, no remote font download. Existing AI-art disclosure and Bryl Lim / Workout Guide CC BY-SA 4.0 attribution retained and exposed in the public license page, including modification notice/source/license. Production software notices generated from installed lockfile packages, available at `/legal/software-notices.txt`; unresolved upstream notice gaps are recorded rather than silently called licensed/complete. |
| Data deletion request | Public data-rights page and Profile links distinguish local erasure, cloud/account deletion, external backups and other devices. Existing local-destructive confirmation reused; never triggered by opening a page. With verified contact, a deletion mail link opens a draft for the user to send, not a fake “request submitted” receipt. Cloud request delivery remains pending the contact and operator-run procedure below. |

## Files and commands

- Policy source: `src/legalDocuments.js`; operator configuration: `src/legalOperator.js`.
- Regenerate: `node scripts/generate-legal-pages.mjs`; verify: append `--check`.
- Public HTML is static and account-free; it does not mount the app, initialize
  Firebase, read workout storage or send analytics/AI requests.
- `public/sw.js` caches policy documents under their own URLs. A legal-page
  navigation cannot overwrite `/index.html` and strand the offline app.
- `node scripts/generate-software-notices.mjs` writes the installed production
  inventory and notices. Server packages are not mislabelled as browser SDKs.
- New isolated, in-memory QA fixture: `/review/privacy-preview/` and
  `?appearance=light` or `?scenario=entry`. Its AI consent demo sends no provider
  request. Network guards are tested separately with synthetic requests.

## Operational release requirements — not solved by a policy page

1. Supply a verified operator name, public service/contact address, country and
   monitored support/privacy email. Add registration/VAT details only if real
   and applicable. Do not publish a guessed home address or contact.
2. Settle applicable jurisdictions and supported ages/parental-permission rules,
   the lawful basis and explicit consent where needed for health-related cloud
   data, and final Terms acceptance/version records. Local AI consent is a
   device-side versioned choice, not a server-side account-wide consent ledger.
3. Review actual Firebase/Netlify/OpenAI agreements, subprocessors, regions,
   transfer safeguards, logs/backups and retention settings. Verify the deployed
   site has no dashboard-injected optional scripts. No console setting was
   changed in this task. Account rollout safeguards remain unchanged.
4. Establish a monitored request intake and ownership-verification process, with
   the applicable response deadlines, exceptions and escalation path. Do not ask
   people to email passwords, ID documents by default, workout exports or photos.
5. For a verified cloud-erasure request: pause writes from that identity, account
   for other signed-in devices and retained local copies, identify the exact UID,
   erase its `rookAccounts/{uid}` document AND its `entities` subcollection (parent
   deletion alone does not delete descendants), erase relevant account-linked
   `rookAiSecurity/user-<sha256(uid)>` records when lawful, remove/revoke the
   Firebase Authentication identity and sessions, and handle processor backups,
   exceptions and confirmation. Preserve other accounts and global safety
   counters. Test this with disposable emulator/staging accounts before offering
   it publicly; no real account was deleted here. Deleting only the Auth user or
   local storage is insufficient.
6. Review the remaining software-notice exceptions and asset provenance for the
   actual release artifact, and retain provider/source records. A package's MIT
   or Apache label does not establish a right to another creator's image/logo.
7. Get a qualified review of the final notices and operating procedures, then
   set explicit legal publication approval, use a final version identifier,
   regenerate pages and rerun readiness. Filling an email alone cannot turn the
   drafts into approved notices. This task leaves publication disabled.

## Primary sources checked

- [EU GDPR business guidance](https://europa.eu/youreurope/business/governance-and-sustainability/digital-and-data-compliance/data-protection-gdpr/index_en.htm)
- [Slovenian SPOT — personal data, consent and cookies](https://spot.gov.si/sl/teme/varstvo-osebnih-podatkov/)
- [EU consumer contract information](https://europa.eu/youreurope/citizens/consumers/shopping/contract-information/index_en.htm)
- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)
- [Firebase privacy and security](https://firebase.google.com/support/privacy)
- [Netlify privacy](https://www.netlify.com/privacy/) — provider DPA must also be checked for processor activity.
- [W3C image alternatives](https://www.w3.org/WAI/tutorials/images/)
- [RE2JS maintainer security advisory](https://github.com/le0pard/re2js/security/advisories/GHSA-gg6h-894w-4m9c)

Verification logs and screenshots: `artifacts/legal-privacy-audit/`. The final
verification summary records actual browser states and test results separately
from the unverified release requirements above.

Broad suite: 7397 passed, 8 skipped, no failures (470 passing files). The final
consent-sheet closing/focus refinement, including one additional lifecycle case,
passed 29 targeted tests in 4 files. The final production build passed. The
post-update production dependency audit reports zero known vulnerabilities.
The installed notice inventory covers 239 production package entries; 11
entries still need upstream-notice verification. Those are not described as
cleared. The legal-readiness check intentionally remains false.
