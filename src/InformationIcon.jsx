import './informationIcon.css';

export function InformationIcon({className = ''}) {
  return <svg className={`rook-information-icon${className ? ` ${className}` : ''}`} aria-hidden="true" focusable="false"
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="12" cy="12" r="8.5"/><path d="M12 10.5v6M12 7.2v.5" strokeLinecap="round"/>
  </svg>;
}
