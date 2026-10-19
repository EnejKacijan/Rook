/* Paste into Safari Web Inspector before Back → Continue, or install with
 * Playwright addInitScript. Read-only, local/in-memory diagnostic: no storage,
 * network, input values, workout names or history are read/written. */
(() => {
  if (window.rookScratchTrace) return;
  const traces = [], restorers = [], ids = new WeakMap(), listeners = [];
  let nextId = 0, active = null, frame = 0, observed = new WeakSet();
  const id = value => value && (ids.get(value) || (ids.set(value, ++nextId), nextId));
  const label = node => node === window ? 'window' : node === document ? 'document' : node instanceof Element ? `${node.tagName}.${String(node.className).replace(/\s+/g, '.')}` : node?.nodeName || null;
  const stamp = () => performance.now();
  const record = (kind, detail = {}) => {
    if (active && active.events.length < 16000) active.events.push({t: stamp(), kind, ...detail});
  };
  const stack = () => new Error().stack;
  const replace = (object, key, replacement) => {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !descriptor.configurable) return;
    Object.defineProperty(object, key, {...descriptor, ...replacement(descriptor)});
    restorers.push(() => Object.defineProperty(object, key, descriptor));
  };
  for (const object of [window, Window.prototype, Element.prototype]) {
    for (const key of ['scroll', 'scrollTo', 'scrollBy', 'scrollIntoView']) replace(object, key, d => ({value: function(...args) {
      record('scroll-write', {method:key, node:id(this), target:label(this), args, stack:stack()});
      return d.value.apply(this, args);
    }}));
  }
  for (const key of ['scrollTop', 'scrollLeft']) replace(Element.prototype, key, d => ({set: function(value) {
    record('scroll-write', {method:key, node:id(this), target:label(this), value, stack:stack()});
    return d.set.call(this, value);
  }}));
  replace(HTMLElement.prototype, 'focus', d => ({value: function(...args) {
    record('focus-call', {target:label(this), args, stack:stack()});
    return d.value.apply(this, args);
  }}));
  replace(Event.prototype, 'preventDefault', d => ({value: function() {
    if (/^(touch|pointer)/.test(this.type)) record('prevent-default', {type:this.type,target:label(this.target),cancelable:this.cancelable,stack:stack()});
    return d.value.call(this);
  }}));
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  replace(EventTarget.prototype, 'addEventListener', d => ({value: function(type, fn, options) {
    if (/^(touch|pointer)/.test(type)) {
      listeners.push({node:id(this),target:label(this),type,fn,owner:this,capture:typeof options==='boolean'?options:Boolean(options?.capture),passive:options?.passive??null,active:true});
      record('listener-add', {target:label(this),type,passive:options?.passive??null});
    }
    return d.value.call(this,type,fn,options);
  }}));
  replace(EventTarget.prototype, 'removeEventListener', d => ({value: function(type, fn, options) {
    const capture=typeof options==='boolean'?options:Boolean(options?.capture);
    for(const item of listeners)if(item.owner===this&&item.type===type&&item.fn===fn&&item.capture===capture)item.active=false;
    return d.value.call(this,type,fn,options);
  }}));
  const listen = (node,type,fn) => {
    add.call(node,type,fn,{capture:true,passive:true});
    restorers.push(()=>remove.call(node,type,fn,true));
  };
  const scrollContainer = root => {
    for(let node=root;node&&node!==document.body;node=node.parentElement)
      if(/auto|scroll/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight+1)return node;
    return document.scrollingElement;
  };
  const nodeState = node => {
    if(!node)return null;
    const s=getComputedStyle(node),b=node.getBoundingClientRect();
    return {id:id(node),target:label(node),top:b.top,height:b.height,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,scrollTop:node.scrollTop,
      overflow:s.overflow,overflowX:s.overflowX,overflowY:s.overflowY,overscroll:s.overscrollBehavior,
      webkitMomentum:s.webkitOverflowScrolling??null,minHeight:s.minHeight,maxHeight:s.maxHeight,
      touchAction:s.touchAction,anchor:s.overflowAnchor,position:s.position,transform:s.transform,animation:s.animationName};
  };
  const sample = () => {
    const root=document.querySelector(window.rookEditorTraceSelector||'.scratch-editor-screen .plan-editor'), scroller=scrollContainer(root);
    const viewport=window.visualViewport;
    const fiberKey=root&&Object.keys(root).find(key=>key.startsWith('__reactFiber$'));
    let fiber=fiberKey&&root[fiberKey];
    while(fiber&&!['scratch','edit'].includes(fiber.memoizedProps?.mode))fiber=fiber.return;
    if(fiber&&!ids.has(fiber)&&fiber.alternate&&ids.has(fiber.alternate))ids.set(fiber,ids.get(fiber.alternate));
    if(fiber?.alternate&&!ids.has(fiber.alternate))ids.set(fiber.alternate,id(fiber));
    const children=root?[...root.querySelectorAll('[data-reorder-workout-section]')]:[];
    for(const node of [document.documentElement,document.body,root?.parentElement,root,...children].filter(Boolean))if(!observed.has(node)){observed.add(node);resize.observe(node);}
    return {t:stamp(),y:scrollY,documentTop:document.documentElement.scrollTop,bodyTop:document.body.scrollTop,
      viewport:viewport?{top:viewport.offsetTop,height:viewport.height,pageTop:viewport.pageTop,scale:viewport.scale}:null,
      active:label(document.activeElement),root:nodeState(root),scroller:nodeState(scroller),surface:nodeState(root?.parentElement),
      component:fiber?{id:id(fiber),key:fiber.key,sourceId:id(fiber.memoizedProps.source),programId:id(fiber.memoizedState?.memoizedState),sourceProgramKey:fiber.memoizedProps.source?.id,programKey:fiber.memoizedState?.memoizedState?.id}:null,
      days:children.map(node=>({id:id(node),key:node.dataset.dayId,top:node.offsetTop,height:node.offsetHeight})),
      overlayCount:document.querySelectorAll('.modal-layer,.plan-reorder-preview,[data-swipe-parent]').length,
      animations:document.getAnimations().map(a=>({name:a.animationName||null,state:a.playState,target:label(a.effect?.target)}))};
  };
  const resize=new ResizeObserver(entries=>record('resize', {nodes:entries.map(e=>({id:id(e.target),target:label(e.target),height:e.contentRect.height,width:e.contentRect.width}))}));
  const mutations=new MutationObserver(records=>{
    if(!active)return;
    for(const r of records){
      if(r.type==='attributes')record('attribute', {node:id(r.target),target:label(r.target),attribute:r.attributeName});
      else for(const [kind,nodes] of [['add',r.addedNodes],['remove',r.removedNodes]])for(const node of nodes)if(node instanceof Element){
        const roots=[...(node.matches('.plan-editor')?[node]:[]),...node.querySelectorAll('.plan-editor')];
        for(const root of roots)record(`editor-${kind}`,{node:id(root)});
      }
    }
  });
  mutations.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','inert']});
  for(const type of ['touchstart','touchmove','touchend','touchcancel','pointerdown','pointermove','pointerup','pointercancel','focusin','focusout','scroll','scrollend','animationstart','animationend','transitionrun','transitionend'])
    listen(document,type,event=>record(type,{target:label(event.target),node:id(event.target),cancelable:event.cancelable,prevented:event.defaultPrevented,y:scrollY,scrollTop:event.target?.scrollTop??null,
      touches:event.touches?[...event.touches].map(t=>({x:t.clientX,y:t.clientY})):undefined}));
  if(window.visualViewport)for(const type of ['resize','scroll'])listen(visualViewport,type,()=>record(`viewport-${type}`,{top:visualViewport.offsetTop,height:visualViewport.height,pageTop:visualViewport.pageTop}));
  const finish = () => {cancelAnimationFrame(frame);if(active){active.end=stamp();active=null;}return traces;};
  const begin = (reason='manual') => {
    finish();active={reason,start:stamp(),readyAt:null,events:[],frames:[],listeners:listeners.filter(l=>l.active).map(({fn,owner,...l})=>l)};traces.push(active);
    const tick=()=>{
      if(!active)return;
      const state=sample();active.frames.push(state);if(state.root?.height>0&&!active.readyAt)active.readyAt=state.t;
      if(stamp()-active.start<6500)frame=requestAnimationFrame(tick);else finish();
    };
    frame=requestAnimationFrame(tick);
  };
  listen(document,'click',event=>{
    const button=event.target.closest?.('button');
    if(button?.closest('.scratch-plan-screen')&&button.textContent.trim()==='CONTINUE')begin('scratch-continue');
  });
  window.rookScratchTrace={traces,begin,finish,mark:reason=>record('qa-mark',{reason}),sample,
    listeners:()=>listeners.filter(l=>l.active&&(l.owner===window||l.owner===document||l.owner?.isConnected)).map(({fn,owner,...l})=>({...l,source:String(fn)})),
    json:()=>JSON.stringify({userAgent:navigator.userAgent,standalone:navigator.standalone===true,traces},null,2),
    stop:()=>{finish();resize.disconnect();mutations.disconnect();restorers.reverse().forEach(restore=>restore());delete window.rookScratchTrace;}};
})();
