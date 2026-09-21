import { useLayoutEffect, useRef, useState } from 'react';
import { bindCoachScroll, FOLLOWING_LATEST } from './coachScroll.js';

export function useCoachScroll(scrollerRef, transcriptRef, conversationId, memory) {
  const controller = useRef(null);
  const localMemory = useRef(new Map());
  const [position, setPosition] = useState({ mode: FOLLOWING_LATEST, showLatest: false });
  const [visibleLatest, setVisibleLatest] = useState(false);
  const hideTimer = useRef(0);
  const onChange = next => {
    setPosition(next);
    if (next.showLatest) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = 0;
      setVisibleLatest(true);
    } else {
      setVisibleLatest(previous => {
        if (!previous || hideTimer.current) return previous;
        hideTimer.current = setTimeout(() => { hideTimer.current = 0; setVisibleLatest(false); }, 150);
        return previous;
      });
    }
  };
  useLayoutEffect(() => {
    const owner = bindCoachScroll(scrollerRef.current, transcriptRef.current, {
      conversationId, memory: memory || localMemory.current, onChange,
    });
    controller.current = owner;
    return () => { owner.dispose(); controller.current = null; if (hideTimer.current) clearTimeout(hideTimer.current); hideTimer.current = 0; setVisibleLatest(false); };
  }, [conversationId, memory, scrollerRef, transcriptRef]);
  // State/render changes and observers share the same single-frame scheduler.
  useLayoutEffect(() => { controller.current?.changed(); });
  return { ...position, showLatest: visibleLatest, latestExiting: visibleLatest && !position.showLatest, latest: () => controller.current?.latest(), changed: () => controller.current?.changed() };
}
