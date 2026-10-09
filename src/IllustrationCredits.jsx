import React from 'react';
import {illustrationDisclosure, requiredIllustrationCredits} from './illustrationProvenance.generated.js';
import {handleExternalLinkClick} from './externalLink.js';

function CreditLink({href, children}) {
  return <a href={href} target="_blank" rel="noreferrer" onClick={event => handleExternalLinkClick(event, href)}>{children}</a>;
}

export function IllustrationCredits({entries = requiredIllustrationCredits, disclosure = illustrationDisclosure}) {
  return <section className="appearance-credits" aria-label="Illustration credits">
    <span className="eyebrow">ILLUSTRATION CREDITS</span>
    {disclosure && <p>{disclosure}</p>}
    {entries.map(entry => <p key={entry.assetId}>
      {entry.label} illustration by <CreditLink href={entry.sourceUrl}>{entry.creator} / {entry.sourceName}</CreditLink>.
      {' '}{entry.changes}{' '}Licensed under <CreditLink href={entry.licenseUrl}>{entry.license}</CreditLink>.
    </p>)}
    <span className="eyebrow">EXERCISE REFERENCES</span>
    <p><CreditLink href="https://bryllim.github.io/workout-guide/">Workout Guide</CreditLink> provides exercise catalog information, including names, muscles and equipment.</p>
  </section>;
}
