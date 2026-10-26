import {useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {InformationIcon} from './InformationIcon.jsx';
import './profileInformation.css';

export function ProfileInformation({label,title,children,Modal,backgroundRef,id,triggerClassName='',triggerContent,sheetClassName='',closeLabel}) {
  const [open,setOpen]=useState(false),trigger=useRef(null),generatedId=useId();
  const dialogId=id || `${generatedId}-information`,titleId=`${dialogId}-title`;
  // A sheet above an existing sheet inherits its document lock. Only its own
  // surface moves; closing help must not pan or re-enter the retained parent.
  const nested=Boolean(backgroundRef?.current?.closest('.modal-layer'));
  return <>
    <button type="button" className={`profile-info-trigger${triggerClassName ? ` ${triggerClassName}` : ''}`} ref={trigger}
      aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} onClick={()=>setOpen(true)}>
      {triggerContent}<InformationIcon/>
    </button>
    {open && createPortal(<Modal close={()=>setOpen(false)} returnFocusRef={trigger} backgroundRef={backgroundRef} lockDocument={!nested}>{close =>
      <section id={dialogId} className={`screen detail-screen profile-information-sheet${sheetClassName ? ` ${sheetClassName}` : ''}`}
        data-sheet-motion="information" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="sheet-header-chrome"><button type="button" className="sheet-close" aria-label={closeLabel || `Close ${title}`} data-sheet-initial-focus onClick={close}>×</button></header>
        <h1 id={titleId}>{title}</h1>
        <div className="profile-information-copy">{children}</div>
      </section>
    }</Modal>,document.body)}
  </>;
}
