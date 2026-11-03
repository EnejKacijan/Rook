import {useEffect,useRef} from 'react';
import {rookPlatform} from './platform.js';
import {legalPageHref} from './legalAppearance.js';
import './privacyLegal.css';

export function LegalLink({document, children, className}) {
  const anchor=useRef(null);
  const href = legalPageHref(document);
  // Parent layout effects resolve the theme after the initial child render.
  useEffect(()=>{if(anchor.current)anchor.current.href=legalPageHref(document);});
  // A theme may change after this link rendered. Capture the current appearance
  // for ordinary, modified, middle-button and context-menu navigation alike.
  const syncAppearance = event => { event.currentTarget.href = legalPageHref(document); };
  // Bundled documents remain inside a native WebView, including offline. On
  // the web a separate document keeps the active workout intact in its tab.
  return <a ref={anchor} className={className} href={href} onClick={syncAppearance} onAuxClick={syncAppearance} onContextMenu={syncAppearance} target={rookPlatform.isNative?undefined:'_blank'} rel="noopener noreferrer">{children}</a>;
}
export function LegalLinks() {
  return <nav className="legal-links" aria-label="Legal information"><LegalLink document="privacy">Privacy policy</LegalLink><LegalLink document="terms">Terms of service</LegalLink></nav>;
}
