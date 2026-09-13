import { useLayoutEffect, useRef, useState } from 'react';

// Editing text is not a prescription. In particular, clearing a set count must
// never resize the set array and discard the user's existing set metadata.
export function PlanNumberInput({ value, onCommit, commits, min = 1, max, ...props }) {
  const [draft, setDraft] = useState(null);
  const raw = useRef(null);
  const commitRef = useRef(null);
  commitRef.current = () => {
    const text = raw.current;
    if (text === null) return;
    raw.current = null;
    const number = Number(text);
    setDraft(null);
    if (/^\d+$/.test(text.trim()) && Number.isInteger(number) && number >= Number(min) &&
        (max == null || number <= Number(max)) && number !== Number(value)) {
      onCommit(number);
    }
  };
  useLayoutEffect(() => {
    if (!commits) return;
    const commit = () => commitRef.current();
    commits.add(commit);
    return () => commits.delete(commit);
  }, [commits]);
  return <input {...props} type="text" inputMode="numeric"
    value={draft ?? value ?? ''}
    onFocus={event => { raw.current = event.currentTarget.value; setDraft(raw.current); }}
    onChange={event => { raw.current = event.currentTarget.value; setDraft(raw.current); }}
    onBlur={() => commitRef.current()}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'Escape') { raw.current = null; setDraft(null); event.currentTarget.blur(); }
    }} />;
}
