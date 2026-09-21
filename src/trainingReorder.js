import {flushSync} from 'react-dom';
import {registerTrainingRowGesture} from './trainingRowGesture.js';
import {moveReorderPreview} from './reorderPresentation.js';
import {interactionFeedback} from './interactionFeedback.js';

// Shared editor/active-queue mechanics. Callers own identity, eligibility and mutations.
export function bindTrainingReorder(root, {
  reorderGestureRef, reorderFrameRef, reorderPreviewRef, cancelReorderRef,
  suppressReorderClickUntil, commitReorderRef, setReorderView,
  getCandidate, beforeStart, getScroller, getViewport, feedback=interactionFeedback,
}) {
  let settles=[];
  const clearSettles=()=>{settles.forEach(animation=>animation?.cancel());settles=[];};
  const clearFrame = () => {
    if (reorderFrameRef.current)
      cancelAnimationFrame(reorderFrameRef.current);
    reorderFrameRef.current = null;
  };
  const resetDisplacement = (gesture) => {
    gesture?.units?.forEach((unit) =>
      unit.elements.forEach((element) => {
        element.style.removeProperty("transform");
        element.classList.remove("reorder-live-source");
        element.classList.remove("reorder-drop-before", "reorder-drop-after");
      }),
    );
  };
  const clearCandidate = () => {
    const gesture = reorderGestureRef.current;
    // Release ownership before DOM restoration or lostpointercapture can
    // dispatch another event. No move blocker or auto-scroll survives idle.
    reorderGestureRef.current = null;
    clearFrame();
    if (gesture?.holdTimer) clearTimeout(gesture.holdTimer);
    gesture?.releaseListeners?.();
    if (gesture) gesture.active = false;
    if (gesture?.pointerId != null && gesture.activator.hasPointerCapture?.(gesture.pointerId))
      gesture.activator.releasePointerCapture(gesture.pointerId);
    resetDisplacement(gesture);
    root.classList.remove("is-reordering", "is-week-reordering");
    if (gesture?.compactStyle) {
      root.style.paddingTop = gesture.compactStyle.paddingTop;
      root.style.minHeight = gesture.compactStyle.minHeight;
      gesture.scroller.scrollTop = gesture.compactStyle.scrollTop;
      gesture.scroller.style.overflowAnchor = gesture.compactStyle.overflowAnchor;
    }
    setReorderView(null);
  };
  const activatorFor = (target) => {
    const activator = target.closest?.("[data-reorder-kind]");
    if (!activator || !root.contains(activator) || root.closest("[inert]") || activator.disabled || document.querySelector("[data-edge-back-active]")) return null;
    const blocked = target.closest?.(
      "input, textarea, select, a, [contenteditable='true'], [data-no-reorder]",
    );
    return blocked ? null : activator;
  };
  const scrollContainerFor = (element) => {
    let current = element.parentElement;
    while (current && current !== document.body) {
      const overflow = getComputedStyle(current).overflowY;
      if (/(auto|scroll)/.test(overflow) && !current.matches('.app-shell, #root'))
        return current;
      current = current.parentElement;
    }
    return root;
  };
  // Standalone import/review pages may otherwise use document scrolling. Give
  // that editor its own bounded viewport; never auto-scroll the app/document.
  const scopedFallback = !getScroller && scrollContainerFor(root) === root;
  if (scopedFallback) root.classList.add('is-reorder-scroll-scope');
  const measureUnits = (gesture) => {
    let groups;
    if (gesture.kind === "workout") {
      groups = Array.from(
        root.querySelectorAll("[data-reorder-workout-section]"),
      ).map((element) => ({
        index: Number(element.dataset.reorderIndex),
        elements: [element],
      }));
    } else {
      const cards = Array.from(
        root.querySelectorAll("[data-reorder-block-index]"),
      ).filter(
        (card) =>
          card.closest("[data-day-id]")?.dataset.dayId === gesture.dayId,
      );
      const grouped = new Map();
      cards.forEach((card) => {
        const index = Number(card.dataset.reorderBlockIndex);
        const entry = grouped.get(index) || { index, elements: [] };
        entry.elements.push(card);
        grouped.set(index, entry);
      });
      groups = [...grouped.values()];
    }
    const units = groups
      .sort((first, second) => first.index - second.index)
      .map((unit) => {
        const rects = unit.elements.map((element) =>
          element.getBoundingClientRect(),
        );
        const top = Math.min(...rects.map((rect) => rect.top));
        const bottom = Math.max(...rects.map((rect) => rect.bottom));
        return {
          ...unit,
          top,
          bottom,
          height: bottom - top,
          center: (top + bottom) / 2,
        };
      });
    const sourceUnit = units.find((unit) => unit.index === gesture.sourceIndex);
    if (!sourceUnit) return null;
    const parent = sourceUnit.elements[0]?.parentElement;
    const parentStyle = parent ? getComputedStyle(parent) : null;
    const gap = Number.parseFloat(parentStyle?.rowGap || parentStyle?.gap || "0") || 0;
    return { units, sourceUnit, sourceSpan: sourceUnit.height + gap };
  };
  const targetForPosition = (gesture, clientY) => {
    const scrollDelta = gesture.scroller.scrollTop - gesture.scrollTopAtActivation;
    const activeCenter =
      gesture.sourceUnit.top + clientY - gesture.startY + gesture.sourceUnit.height / 2;
    const remainingCenters = gesture.units
      .filter((unit) => unit.index !== gesture.sourceIndex)
      .map((unit) =>
        unit.center -
        scrollDelta,
      );
    let targetIndex = remainingCenters.filter((center) => activeCenter >= center).length;
    const previous = gesture.lastTargetIndex;
    if (previous !== undefined && targetIndex !== previous) {
      const hysteresis = gesture.pointerType === "mouse" ? 3 : 6;
      if (
        targetIndex > previous &&
        activeCenter < remainingCenters[targetIndex - 1] + hysteresis
      )
        targetIndex = previous;
      if (
        targetIndex < previous &&
        activeCenter > remainingCenters[targetIndex] - hysteresis
      )
        targetIndex = previous;
    }
    return targetIndex;
  };
  const applyDisplacement = (gesture, targetIndex) => {
    const remaining = gesture.units.filter(unit => unit.index !== gesture.sourceIndex);
    gesture.units.forEach((unit) => {
      let offset = 0;
      if (
        targetIndex > gesture.sourceIndex &&
        unit.index > gesture.sourceIndex &&
        unit.index <= targetIndex
      )
        offset = -gesture.sourceSpan;
      if (
        targetIndex < gesture.sourceIndex &&
        unit.index >= targetIndex &&
        unit.index < gesture.sourceIndex
      )
        offset = gesture.sourceSpan;
      unit.elements.forEach((element) => {
        element.classList.toggle("reorder-drop-before", unit === remaining[targetIndex] && element === unit.elements[0]);
        element.classList.toggle("reorder-drop-after", targetIndex === remaining.length && unit === remaining.at(-1) && element === unit.elements.at(-1));
        if (unit.index === gesture.sourceIndex)
          element.classList.add("reorder-live-source");
        element.style.transform = offset
          ? `translate3d(0, ${offset}px, 0)`
          : "translate3d(0, 0, 0)";
      });
    });
  };
  const publish = (gesture) => {
    const targetIndex = targetForPosition(gesture, gesture.clientY);
    if (gesture.lastFeedbackIndex !== targetIndex) feedback.selection();
    gesture.lastFeedbackIndex = targetIndex;
    gesture.lastTargetIndex = targetIndex;
    gesture.targetIndex = targetIndex;
    applyDisplacement(gesture, targetIndex);
    if (!gesture.viewPublished) {
      gesture.viewPublished = true;
      setReorderView({
        kind: gesture.kind,
        dayId: gesture.dayId,
        exerciseId: gesture.exerciseId,
        sourceIndex: gesture.sourceIndex,
        targetIndex,
        label: gesture.label,
        meta: gesture.meta,
        left: gesture.sourceUnit.left,
        width: gesture.sourceUnit.width,
        top: gesture.sourceUnit.top,
        height: gesture.sourceUnit.height,
      });
    }
    moveReorderPreview(reorderPreviewRef.current, "--reorder-drag-y", gesture.clientY - gesture.startY);
  };
  const autoScroll = (time) => {
    const gesture = reorderGestureRef.current;
    if (!gesture?.active) return;
    const scroller = gesture.scroller;
    const bounds = scroller.getBoundingClientRect();
    const viewport = getViewport?.(scroller) || {top:Math.max(0,bounds.top),bottom:Math.min(window.innerHeight,bounds.bottom)};
    const zone = 56;
    let direction = 0;
    let depth = 0;
    if (gesture.clientY < viewport.top + zone) {
      direction = -1;
      depth = (viewport.top + zone - gesture.clientY) / zone;
    } else if (gesture.clientY > viewport.bottom - zone - 16) {
      direction = 1;
      depth = (gesture.clientY - (viewport.bottom - zone - 16)) / zone;
    }
    const elapsed = Math.min(32, time - (gesture.frameTime || time));
    gesture.frameTime = time;
    if (direction) {
      if (gesture.kind === "workout") {
        const elements = [...root.querySelectorAll('[data-reorder-workout-section]')];
        if ((direction > 0 && elements.at(-1)?.getBoundingClientRect().bottom <= viewport.bottom - 16) ||
            (direction < 0 && elements[0]?.getBoundingClientRect().top >= viewport.top + 16)) {
          reorderFrameRef.current = requestAnimationFrame(autoScroll);
          return;
        }
      }
      const distance = direction * (120 + 400 * Math.min(1, depth)) * elapsed / 1000;
      const before = scroller.scrollTop;
      scroller.scrollTop = Math.max(0,Math.min(scroller.scrollHeight-scroller.clientHeight,before+distance));
      if (scroller.scrollTop !== before) publish(gesture);
    }
    reorderFrameRef.current = requestAnimationFrame(autoScroll);
  };
  const activate = (gesture) => {
    if (!gesture || reorderGestureRef.current !== gesture) return;
    // Measure the final collapsed geometry, not the old expanded card height.
    if (beforeStart?.(gesture) === false) { clearCandidate(); return; }
    root.dispatchEvent(new Event("rook-reorder-start",{bubbles:true}));
    gesture.active = true;
    gesture.holdTimer = null;
    gesture.scroller = getScroller?.(gesture.activator) || scrollContainerFor(gesture.activator);
    root.classList.add("is-reordering");
    if (gesture.kind === "workout") {
      const section = gesture.activator.closest('[data-reorder-workout-section]');
      const oldTop = section.getBoundingClientRect().top;
      const padding = parseFloat(getComputedStyle(root).paddingTop) || 0;
      gesture.compactStyle = { paddingTop: root.style.paddingTop, minHeight: root.style.minHeight, scrollTop: gesture.scroller.scrollTop, overflowAnchor: gesture.scroller.style.overflowAnchor };
      gesture.scroller.style.overflowAnchor = "none";
      // Keep the source under the pointer and prevent scroll clamping while
      // display:none takes all expanded exercise content out of layout.
      root.style.minHeight = `${root.getBoundingClientRect().height}px`;
      root.classList.add("is-week-reordering");
      root.style.paddingTop = `${padding + Math.max(0, oldTop - section.getBoundingClientRect().top)}px`;
      gesture.scroller.scrollTop = gesture.compactStyle.scrollTop;
    }
    const measured = measureUnits(gesture);
    if (!measured) {
      clearCandidate();
      return;
    }
    gesture.units = measured.units;
    gesture.sourceUnit = measured.sourceUnit;
    gesture.sourceSpan = measured.sourceSpan;
    gesture.sourceUnit.left = Math.min(
      ...gesture.sourceUnit.elements.map(
        (element) => element.getBoundingClientRect().left,
      ),
    );
    gesture.sourceUnit.width = Math.max(
      ...gesture.sourceUnit.elements.map(
        (element) => element.getBoundingClientRect().right,
      ),
    ) - gesture.sourceUnit.left;
    gesture.scrollTopAtActivation = gesture.scroller.scrollTop;
    gesture.lastTargetIndex = gesture.sourceIndex;
    gesture.lastFeedbackIndex = gesture.sourceIndex;
    feedback.pickup();
    publish(gesture);
    reorderFrameRef.current = requestAnimationFrame(autoScroll);
  };
  const buildCandidate = (activator, clientY, pointerType) => {
    const kind = activator.dataset.reorderKind;
    const dayId = activator.dataset.dayId;
    const exerciseId = activator.dataset.exerciseId || null;
    const sourceIndex = Number(
      kind === "workout"
        ? activator.closest("[data-reorder-workout-section]")?.dataset.reorderIndex
        : activator.closest("[data-reorder-block-index]")?.dataset.reorderBlockIndex,
    );
    const candidate = getCandidate({kind,dayId,exerciseId,sourceIndex});
    if(!candidate)return null;
    return {
      ...candidate,kind,dayId,exerciseId,sourceIndex,
      pointerType,
      activator,
      startY: clientY,
      clientY,
      targetIndex: sourceIndex,
      active: false,
    };
  };
  const finish = (commit = true) => {
    const gesture = reorderGestureRef.current;
    if (!gesture) return;
    const wasActive = gesture.active;
    const visual=new Map();
    if(wasActive)for(const unit of gesture.units)for(const element of unit.elements){
      const box=element.getBoundingClientRect();
      visual.set(element,unit===gesture.sourceUnit?{top:box.top+gesture.clientY-gesture.startY+gesture.scroller.scrollTop-gesture.scrollTopAtActivation,left:box.left}:box);
    }
    let applied=false;
    flushSync(()=>{clearCandidate();if(wasActive&&commit&&gesture.targetIndex!==gesture.sourceIndex)applied=commitReorderRef.current?.(gesture);});
    if (wasActive) {
      suppressReorderClickUntil.current = performance.now() + 500;
      if(applied)feedback.drop();
      if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)for(const [element,before] of visual){
        if(!element.isConnected)continue;
        const after=element.getBoundingClientRect(),dy=before.top-after.top;
        if(Math.abs(dy)>1)settles.push(element.animate?.([{transform:`translate3d(0,${dy}px,0)`},{transform:'translate3d(0,0,0)'}],{duration:180,easing:'cubic-bezier(.2,0,0,1)'}));
      }
    }
  };
  const releaseGesture=registerTrainingRowGesture(root,'reorder',{
    candidate(target,point,pointerType){
      const activator=activatorFor(target);
      return activator?buildCandidate(activator,point.clientY,pointerType):null;
    },
    begin(gesture){
      clearSettles();reorderGestureRef.current=gesture;activate(gesture);
      return gesture.active;
    },
    move(gesture,point){
      if(!gesture.active||reorderGestureRef.current!==gesture)return false;
      gesture.clientY=point.clientY;publish(gesture);
    },
    end(gesture,commit,point){
      if(reorderGestureRef.current!==gesture)return;
      if(commit&&gesture.active){gesture.clientY=point.clientY;publish(gesture);}
      finish(commit);
    },
  });
  cancelReorderRef.current = releaseGesture.cancel;
  return () => {
    // Cleanup can run inside React's commit phase. Clear before unregistering
    // so the adapter never attempts flushSync from a lifecycle cleanup.
    clearCandidate();releaseGesture();clearSettles();
    if (scopedFallback) root.classList.remove('is-reorder-scroll-scope');
    cancelReorderRef.current = null;
  };
}
