/** A normal next step, never an automatic provider request. */
export function ImportInterpretationOffer({draft,busy,onInterpret,onReview}) {
  return <section className="import-interpretation-offer" aria-labelledby="import-interpretation-title" aria-busy={busy}>
    <h2 id="import-interpretation-title">Import needs a little help</h2>
    <p role="status">{draft.knownCount} source items preserved.<br/>Some wording still needs interpretation.</p>
    {draft.error&&<p className="import-interpretation-error" role="alert">{draft.error}</p>}
    <button type="button" className="button secondary" disabled={busy} onClick={onInterpret}>{busy?'INTERPRETING…':draft.attemptedAI?'RETRY AI INTERPRETATION':'INTERPRET WITH AI'}</button>
    <button type="button" className="text-button import-local-review" disabled={busy} onClick={onReview}>Review local draft</button>
    <small>Only unresolved note fragments are sent to OpenAI. No profile or workout history is sent.</small>
  </section>;
}
