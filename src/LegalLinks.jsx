import {rookPlatform} from './platform.js';
import './privacyLegal.css';

export function LegalLink({document, children, className}) {
  const href = `/legal/${document}.html`;
  // Bundled documents remain inside a native WebView, including offline. On
  // the web a separate document keeps the active workout intact in its tab.
  return <a className={className} href={href} target={rookPlatform.isNative?undefined:'_blank'} rel="noopener noreferrer">{children}</a>;
}
export function LegalLinks() {
  return <nav className="legal-links" aria-label="Legal information"><LegalLink document="privacy">Privacy policy</LegalLink><LegalLink document="terms">Terms of service</LegalLink></nav>;
}
