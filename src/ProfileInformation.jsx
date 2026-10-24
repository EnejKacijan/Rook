import {useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './profileInformation.css';

export function ProfileInformation({label,title,children,Modal,backgroundRef}) {
  const [open,setOpen]=useState(false),trigger=useRef(null),titleId=useId();
  return <>
    <button type="button" className="profile-info-trigger" ref={trigger} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="8.5"/><path d="M12 10.5v6M12 7.2v.5" strokeLinecap="round"/></svg>
    </button>
    {open && createPortal(<Modal close={()=>setOpen(false)} returnFocusRef={trigger} backgroundRef={backgroundRef}>{close =>
      <section className="screen detail-screen profile-information-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="sheet-header-chrome"><button type="button" className="sheet-close" aria-label={`Close ${title}`} data-sheet-initial-focus onClick={close}>×</button></header>
        <h1 id={titleId}>{title}</h1>
        <div className="profile-information-copy">{children}</div>
      </section>
    }</Modal>,document.body)}
  </>;
}
