import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import './destructiveConfirmationSheet.css';

// Content for the canonical ModalLayer: it retains gesture, focus, background
// and document ownership rather than implementing another modal controller.
export function DestructiveConfirmationSheet({ Modal, Header, title, description,
  confirmLabel, keepLabel, closeLabel, backLabel = 'Back', confirm, close,
  backgroundRef, returnFocusRef, error }) {
  const titleId = useId(), descriptionId = useId();
  return createPortal(<Modal close={close} backgroundRef={backgroundRef}
    returnFocusRef={returnFocusRef} lockDocument={false}>
    {requestClose => <section className="sheet destructive-confirmation-sheet"
      role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <Header title="" onBack={requestClose} backLabel={backLabel} onClose={requestClose} closeLabel={closeLabel}/>
      <div className="sheet-scroll destructive-confirmation-copy">
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="destructive-confirmation-actions">
        <button type="button" className="button danger" onClick={() => confirm(requestClose)}>{confirmLabel}</button>
        <button type="button" className="button secondary" data-sheet-initial-focus onClick={requestClose}>{keepLabel}</button>
      </div>
    </section>}
  </Modal>, document.body);
}
