export function NavigationChevron({ direction = 'right', className = '' }) {
  return <svg className={`rook-navigation-chevron${className ? ` ${className}` : ''}`}
    viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={direction === 'left' ? 'm12.5 4.5-5.5 5.5 5.5 5.5' : 'm7.5 4.5 5.5 5.5-5.5 5.5'} />
  </svg>;
}

export function FirstRunBackButton({ onClick, label = 'Back', disabled = false }) {
  return <button type="button" className="detail-header-back first-run-back-button"
    aria-label={label} disabled={disabled} onClick={onClick}>
    <NavigationChevron direction="left" />
  </button>;
}
