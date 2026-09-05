import React, { useRef } from 'react';

export function SearchInput({ value, onClear, ...props }) {
  const inputRef = useRef(null);
  return <span className="rook-search-field">
    <input {...props} ref={inputRef} type="search" value={value} />
    {Boolean(value) && <button type="button" className="rook-search-clear" aria-label="Clear search"
      onMouseDown={event => event.preventDefault()}
      onClick={() => { onClear(); inputRef.current?.focus(); }}>×</button>}
  </span>;
}
