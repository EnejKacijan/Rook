import { useEffect, useState } from 'react';

// Decorative assets may not have been cached before the device went offline.
// Hide a failed source and retry on reconnect, without persisting failure state.
export function useAvailableImage(source) {
  const [failedSource, setFailedSource] = useState(null);
  useEffect(() => {
    const retry = () => setFailedSource(null);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);
  return {
    source: source && source !== failedSource ? source : null,
    onError: () => setFailedSource(source),
  };
}
