import React from 'react';
import './trainingReorder.css';
export function ReorderHandle({className='',...props}) {
  return <button type="button" {...props} className={`rook-reorder-handle ${className}`} data-no-edge-back><i aria-hidden="true"/></button>;
}
