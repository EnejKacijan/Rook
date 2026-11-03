export const SHEET_MOTION_DURATION = 180;

const preparedPanels = new WeakMap();
const directMotions = new WeakMap();

// Both handles share presentation; their existing owners keep gesture arbitration
// and thresholds. No geometry reads or React updates occur in the tracking frame.
export function createSheetDragMotion(getPanel, getLayer, {fadeDistance = 1} = {}) {
  let panel, layer, scrim, height=1, frame=null, timer=null, pending=null, previousWillChange='';
  const cancelFrame=()=>{if(frame!==null)cancelAnimationFrame(frame);frame=null;};
  const paint=distance=>{
    if(!panel)return;
    panel.style.transform=`translate3d(0, ${Math.max(0,distance)}px, 0)`;
    if(scrim)scrim.style.opacity=String(Math.max(0,1-distance/Math.max(1,height*fadeDistance)));
  };
  const flush=()=>{cancelFrame();if(pending!==null){paint(pending);pending=null;}};
  const clearScrim=()=>{
    if(layer&&scrim){
      // Hand the resting scrim back to CSS atomically. Restoring its decorative
      // background transition in the same style batch would flash from transparent.
      layer.style.transition='none';layer.style.backgroundColor='';
      void getComputedStyle(layer).backgroundColor;
    }
    scrim?.remove();scrim=null;
    if(layer)layer.style.transition='';
    if(panel){panel.style.willChange=previousWillChange;directMotions.delete(panel);}
  };
  const dispose=()=>{cancelFrame();clearTimeout(timer);pending=null;clearScrim();panel=layer=null;};
  const motion={
    get height(){return height;},
    begin(){
      cancelFrame();clearTimeout(timer);pending=null;
      const target=getPanel(),backdrop=getLayer();if(!target)return;
      if(panel&&panel!==target)clearScrim();
      // Measure once at the gesture boundary, never on each move.
      height=target.getBoundingClientRect().height||1;
      // Resolve the real resting color after stopping entry, once at takeover.
      // Light and dark layers do not all use the same scrim token. Reading an
      // in-flight entry color would also cause a flash at the end of cancellation.
      if(!scrim&&backdrop)backdrop.style.animation='none';
      const color=!scrim&&backdrop?getComputedStyle(backdrop).backgroundColor:null;
      if(!scrim)previousWillChange=target.style.willChange;
      panel=target;layer=backdrop;directMotions.set(panel,motion);
      panel.style.animation='none';panel.style.transition='none';panel.style.willChange='transform';
      if(layer){
        layer.style.animation='none';layer.style.transition='none';
        if(!scrim){scrim=document.createElement('div');scrim.className='sheet-drag-scrim';scrim.setAttribute('aria-hidden','true');scrim.style.backgroundColor=color;layer.append(scrim);}
        layer.style.backgroundColor='transparent';
      }
    },
    track(distance){pending=distance;if(frame===null)frame=requestAnimationFrame(()=>{frame=null;const value=pending;pending=null;if(value!==null)paint(value);});},
    prepareClose(){clearTimeout(timer);flush();},
    reset(duration=SHEET_MOTION_DURATION,easing='ease-out'){
      flush();if(!panel)return;
      // One release-boundary flush starts settling from the final tracked pose.
      panel.getBoundingClientRect();
      panel.style.transition=duration?`transform ${duration}ms ${easing}`:'none';panel.style.transform='';
      if(scrim){scrim.style.transition=duration?`opacity ${duration}ms ${easing}`:'none';scrim.style.opacity='1';}
      clearTimeout(timer);timer=setTimeout(()=>{if(panel)panel.style.transition='';clearScrim();},duration);
    },
    dismiss(duration,close){
      flush();if(!panel)return;panel.getBoundingClientRect();
      panel.style.transition=duration?`transform ${duration}ms ease`:'none';
      if(scrim)scrim.style.transition=duration?`opacity ${duration}ms ease`:'none';
      paint(height);if(scrim)scrim.style.opacity='0';
      clearTimeout(timer);timer=setTimeout(close,duration);
    },
    dispose,
  };
  return motion;
}

export function fadeSheetBackdrop(layer,duration) {
  let scrim=layer?.querySelector(':scope > .sheet-drag-scrim');
  if(layer&&!scrim){
    // Button/Escape/backdrop dismissal uses the same composited scrim as drag.
    // Animating the full-screen background color repaints everything beneath it.
    scrim=document.createElement('div');scrim.className='sheet-drag-scrim';
    scrim.setAttribute('aria-hidden','true');scrim.style.backgroundColor=getComputedStyle(layer).backgroundColor;
    scrim.style.opacity='1';layer.append(scrim);
    layer.style.transition='none';layer.style.backgroundColor='transparent';
    void getComputedStyle(scrim).opacity;
  }
  if(scrim){scrim.style.transition=duration?`opacity ${duration}ms ease-out`:'none';scrim.style.opacity='0';}
}

/** Keep ownership until the browser finishes the actual slide, including a
 * delayed first frame on a busy device. The returned cancellation prevents an
 * old panel's completion from dismissing a replacement destination. */
export function closeSheetMotion(layer,panel,close,{duration=SHEET_MOTION_DURATION}={}) {
  panel.setAttribute('data-sheet-closing','');
  panel.style.willChange='transform';
  const height=freezeSheetMotion(layer,panel);
  // Keyboard/stable-top sheets can end well above the coverage layer's bottom.
  // Travel beyond that boundary even if the keyboard disappears during exit.
  const box=panel.getBoundingClientRect(),bottom=layer.getBoundingClientRect().bottom;
  const distance=Number.isFinite(box.top)&&bottom>0?Math.max(24,bottom-box.top+24):height+24;
  const pose=panel.style.transform;
  panel.style.transition=duration?`transform ${duration}ms ease-out`:'none';
  panel.style.transform=`${pose&&pose!=='none'?`${pose} `:''}translate3d(0, ${distance}px, 0)`;
  fadeSheetBackdrop(layer,duration);
  let active=true,timer;
  const finish=()=>{if(!active)return;active=false;clearTimeout(timer);if(layer.firstElementChild===panel)close();};
  const transition=duration?panel.getAnimations?.().find(animation=>animation.transitionProperty==='transform'):null;
  // Native completion owns real browsers. Tests/older engines with no animation
  // API retain the established duration; a bounded fallback handles interruption.
  timer=setTimeout(finish,transition?duration+1000:duration);
  if(transition)transition.finished.then(finish,finish);
  return ()=>{active=false;clearTimeout(timer);};
}

// Every bottom sheet uses the same full-travel rhythm, regardless of content height.
export function sheetEntryDuration() {
  return SHEET_MOTION_DURATION;
}

export function prepareSheetEntry(panel) {
  if (!panel?.matches('.screen, .sheet') ||
      panel.parentElement?.matches('.exercise-visual-layer, .edit-plan-page-layer')) return () => {};
  // Before paint, once per panel identity (including StrictMode). Content,
  // viewport and theme updates must not retime or replay an in-flight entrance.
  let entry = preparedPanels.get(panel);
  if (!entry) {
    panel.style.setProperty('--rook-sheet-enter-play-state', 'paused');
    const duration = `${sheetEntryDuration()}ms`;
    panel.style.setProperty('--rook-sheet-enter-duration', duration);
    panel.parentElement.style.setProperty('--rook-sheet-enter-duration', duration);
    entry = { started: false, frame: null };
    preparedPanels.set(panel, entry);
  }
  // WebKit can advance a CSS animation during the mounting task. Keep its
  // zero pose until the presentation frame, then start panel and scrim together.
  // This is a paint boundary, not a delay waiting for Today/date state to settle.
  if (!entry.started && entry.frame === null) entry.frame = requestAnimationFrame(() => {
    entry.frame = null;
    if (!panel.isConnected) return;
    entry.started = true;
    panel.style.setProperty('--rook-sheet-enter-play-state', 'running');
    panel.parentElement.style.setProperty('--rook-sheet-enter-play-state', 'running');
  });
  const frame = entry.frame;
  return () => {
    if (frame !== null && entry.frame === frame) { cancelAnimationFrame(frame); entry.frame = null; }
  };
}

export function freezeSheetMotion(layer, panel) {
  directMotions.get(panel)?.prepareClose();
  const transform = getComputedStyle(panel).transform;
  const background = getComputedStyle(layer).backgroundColor;
  panel.style.transition = layer.style.transition = 'none';
  panel.style.transform = transform;
  layer.style.backgroundColor = background;
  panel.style.animation = layer.style.animation = 'none';
  // Commit the current painted pose before transitioning out, also when close
  // interrupts entry. Cancelling CSS animation first would jump to Y=0.
  return panel.getBoundingClientRect().height;
}
