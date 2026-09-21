import React from 'react';
import './workoutMotion.css';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function milliseconds(surface, token, fallback) {
  const value = getComputedStyle(surface).getPropertyValue(token).trim();
  const match = /^(\d*\.?\d+)(ms|s)$/.exec(value);
  return match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : fallback;
}
export function workoutMotionDuration(surface, kind) {
  if (reduced() && kind !== 'acknowledge') return milliseconds(surface, '--rook-motion-press-in', 80);
  return kind === 'exercise' ? Math.min(180, milliseconds(surface, '--rook-motion-layout', 190))
    : milliseconds(surface, '--rook-motion-state', 200);
}

// Inert paint only: React owns one live exercise/session throughout the change.
// Capture before replacement, including the outgoing scroll and edited values.
function capture(surface, completion) {
  if (!surface?.animate || reduced()) return null;
  const rect = surface.getBoundingClientRect();
  const headerBottom = !completion ? surface.closest('.workout-screen')?.querySelector('.workout-header')?.getBoundingClientRect().bottom || 0 : 0;
  const top = Math.max(0, rect.top, headerBottom), bottom = Math.min(innerHeight, rect.bottom);
  if (!rect.width || bottom <= top) return null;
  const layer = document.createElement('div');
  layer.className = 'workout-motion-paint';
  layer.setAttribute('inert', ''); layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { left: `${rect.left}px`, top: `${top}px`, width: `${rect.width}px`, height: `${bottom - top}px` });
  const copy = surface.cloneNode(true);
  const originals = [surface, ...surface.querySelectorAll('*')], copies = [copy, ...copy.querySelectorAll('*')];
  const scrolls = originals.map(node => [node.scrollTop, node.scrollLeft]);
  copies.forEach((node, index) => {
    node.removeAttribute('id'); node.removeAttribute('name'); node.removeAttribute('autofocus');
    node.style.animation = 'none'; node.style.transition = 'none';
    if (node.matches('input,textarea,select')) node.value = originals[index].value;
  });
  // A completed workout must never carry a rest timer onto its success screen.
  copy.querySelectorAll('.rest-timer,.today-action-toast,[role="dialog"],.modal-layer').forEach(node => node.remove());
  if (completion) {
    const header = copy.querySelector('.workout-header'), original = surface.querySelector('.workout-header');
    if (header && original) {
      const bounds = original.getBoundingClientRect();
      const space = document.createElement('div');
      space.style.height = `${bounds.height}px`;
      header.before(space);
      Object.assign(header.style, { position:'absolute', top:`${bounds.top - rect.top}px`, left:`${bounds.left - rect.left}px`, width:`${bounds.width}px` });
    }
  }
  Object.assign(copy.style, { position:'absolute', margin:'0', left:'0', top:`${rect.top - top}px`, width:`${rect.width}px`, height:`${rect.height}px`, transform:'none' });
  if (!completion && surface.closest('.workout-screen')) {
    // Logger/layout rules are scoped to its workout and freestyle ancestors.
    // Keep that CSS context on the paint copy without a second live screen.
    const context = document.createElement('div');
    context.className = surface.closest('.workout-screen').className;
    Object.assign(context.style, {position:'absolute', inset:'0', padding:'0', margin:'0', minHeight:'0', overflow:'visible'});
    context.append(copy); layer.append(context);
  } else layer.append(copy);
  return { layer, mount() { document.body.append(layer); copies.forEach((node, i) => { node.scrollTop = scrolls[i][0]; node.scrollLeft = scrolls[i][1]; }); } };
}

// Scoped to exercise replacement and the successful workout -> complete boundary.
// Normal set edits, timers, notes, photos and feedback never trigger this motion.
export class WorkoutMotion extends React.Component {
  host = React.createRef();
  clear = () => {};
  changes(previous) {
    return this.props.kind === 'exercise' ? previous.identity !== this.props.identity
      : previous.identity === 'workout' && this.props.identity === 'complete';
  }
  getSnapshotBeforeUpdate(previous) {
    if (!this.changes(previous)) return null;
    this.clear();
    return capture(this.host.current?.firstElementChild, this.props.kind === 'completion');
  }
  componentDidUpdate(previous, _state, outgoing) {
    if (!this.changes(previous)) return;
    const surface = this.host.current?.firstElementChild;
    if (!surface?.animate) return;
    const completion = this.props.kind === 'completion', quiet = reduced();
    const duration = workoutMotionDuration(surface, this.props.kind);
    const easing = getComputedStyle(surface).getPropertyValue('--rook-ease-standard').trim() || 'cubic-bezier(.2,0,0,1)';
    const timing = { duration, easing };
    const animations = [];
    if (outgoing) {
      outgoing.mount();
      animations.push(outgoing.layer.animate([{opacity:1, transform:'translate(0,0)'}, {opacity:0, transform:completion?'translateY(-4px)':'translateX(-5px)'}], timing));
    }
    // Completion contains a viewport-fixed Done dock: fade its screen without
    // turning it into a transformed containing block. The check scales locally.
    const move = !quiet && !completion;
    animations.push(surface.animate([{opacity:0, ...(move && {transform:'translateX(5px)'})}, {opacity:1, ...(move && {transform:'translateX(0)'})}], timing));
    let timer;
    const clear = () => {
      clearTimeout(timer); animations.forEach(animation => animation.cancel()); outgoing?.layer.remove();
      window.removeEventListener('resize', clear); window.removeEventListener('pagehide', clear);
      document.removeEventListener('visibilitychange', clear);
      surface.removeEventListener('pointerdown', clear, true); surface.removeEventListener('keydown', clear, true);
    };
    this.clear = clear;
    timer = setTimeout(clear, duration);
    window.addEventListener('resize', clear); window.addEventListener('pagehide', clear);
    document.addEventListener('visibilitychange', clear);
    surface.addEventListener('pointerdown', clear, {capture:true, passive:true}); surface.addEventListener('keydown', clear, true);
  }
  componentWillUnmount() { this.clear(); }
  render() { return <div ref={this.host} className="workout-motion-boundary">{this.props.children}</div>; }
}
