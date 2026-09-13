import React from 'react';
import './customExerciseFallback.css';

// Shared by add, replace and restriction-review pickers. Creation stays with
// the caller so this presentation cannot change validation or insertion scope.
export function CustomExerciseFallback({ onCreate }) {
  return <aside className="custom-exercise-fallback">
    <span>Can’t find it?</span>
    <button type="button" aria-label="Create custom exercise" onClick={onCreate}>
      <span aria-hidden="true">+</span> Create custom exercise
    </button>
  </aside>;
}
