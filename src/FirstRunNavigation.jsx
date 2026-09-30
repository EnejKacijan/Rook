import React from 'react';
import { captureFirstRunSurface, playFirstRunMotion, firstRunBackMotion, stopFirstRunMotion } from './firstRunMotion.js';
import { registerPageBackMotion } from './swipePageMotion.js';
import { focusNavigationTarget } from './navigationFocus.js';
import './firstRunNavigation.css';

const routes = ['landing', 'bring', 'sign-in', 'personalize', 'import', 'scratch', 'restore', 'create-workout', 'freestyle-confirm'];
const returnSurface = '.entry-bring-plan,.entry-sign-in,.onboarding-personal,.import-plan-screen,.scratch-plan-screen,.restore-backup-screen,.saved-workouts,.first-run-freestyle-screen';
const visibleScreen = host => [...(host?.querySelectorAll('main') || [])].find(node => !node.closest('[hidden],[inert]'));

// Retain visited form trees, not serialized drafts. getSnapshotBeforeUpdate reads
// the outgoing DOM before React hides it; layout commit restores scroll prepaint.
export class FirstRunNavigation extends React.Component {
  state = { visited: new Set(['landing', this.props.mode]) };
  host = React.createRef();
  scrolls = new Map();
  focus = new Map();
  snapshots = new Map();
  clearMotion = () => {};
  releaseRenderer = () => {};
  static getDerivedStateFromProps({ mode }, state) {
    return state.visited.has(mode) ? null : { visited: new Set([...state.visited, mode]) };
  }
  componentDidMount() {
    this.releaseRenderer = registerPageBackMotion(this.host.current, surface => {
      if (!surface.matches(returnSurface)) return null;
      this.clearMotion();
      const route = surface.closest('[data-first-run-page]')?.dataset.firstRunPage;
      return firstRunBackMotion(surface, this.snapshots.get(this.props.parents?.[route] || 'landing'));
    });
  }
  getSnapshotBeforeUpdate(previous) {
    if (previous.mode === this.props.mode) return null;
    this.clearMotion();
    const screen = visibleScreen(this.host.current);
    stopFirstRunMotion(screen);
    const scroller = document.scrollingElement || document.documentElement;
    this.scrolls.set(previous.mode, scroller.scrollTop);
    if (screen?.contains(document.activeElement)) {
      this.focus.set(previous.mode, document.activeElement);
      document.activeElement.blur();
    }
    const swipe = screen?.dataset.swipeBackCommitted === 'true';
    if (screen) delete screen.dataset.swipeBackCommitted;
    const outgoing = swipe ? null : captureFirstRunSurface(screen);
    this.snapshots.set(previous.mode, captureFirstRunSurface(screen));
    return { outgoing, swipe };
  }
  componentDidUpdate(previous, _state, snapshot) {
    if (previous.mode === this.props.mode) return;
    const screen = visibleScreen(this.host.current);
    const scroller = document.scrollingElement || document.documentElement;
    scroller.scrollTop = this.scrolls.get(this.props.mode) || 0;
    const back = this.props.mode === (this.props.parents?.[previous.mode] || 'landing');
    const target = back ? this.focus.get(this.props.mode) : screen?.querySelector('button[aria-label^="Back"],button[aria-label^="Close"]');
    focusNavigationTarget(target);
    if (!snapshot?.swipe) this.clearMotion = playFirstRunMotion(screen, snapshot?.outgoing, {
      back,
    });
  }
  componentWillUnmount() { this.clearMotion(); this.releaseRenderer(); }
  render() {
    const { mode, children } = this.props;
    return <div ref={this.host} className="first-run-navigation">
      {routes.filter(route => this.state.visited.has(route) && (route !== 'restore' || mode === 'restore')).map(route => <div key={route}
        className="first-run-page" data-first-run-page={route} hidden={route !== mode}
        inert={route !== mode ? '' : undefined} aria-hidden={route !== mode || undefined}>
        {children(route)}
      </div>)}
    </div>;
  }
}

// Questionnaire steps retain their hierarchy within the shared physical stack.
export class FirstRunStepMotion extends React.Component {
  host = React.createRef();
  steps = new Map();
  clearMotion = () => {};
  releaseRenderer = () => {};
  componentDidMount() {
    this.releaseRenderer = registerPageBackMotion(this.host.current, surface => {
      // Step zero delegates to the enclosing Landing stack. Later steps return
      // to their own previous question, using that same page-stack renderer.
      if (surface !== this.host.current?.firstElementChild || this.props.step === 0) return null;
      this.clearMotion();
      return firstRunBackMotion(surface, this.steps.get(this.props.step - 1));
    });
  }
  getSnapshotBeforeUpdate(previous) {
    if (previous.step === this.props.step) return null;
    this.clearMotion();
    const screen = this.host.current?.firstElementChild;
    stopFirstRunMotion(screen);
    const swipe = screen?.dataset.swipeBackCommitted === 'true';
    // This marker belongs to the completed step Back, not a later button Back
    // to Landing on the same live <main> node.
    if (screen) delete screen.dataset.swipeBackCommitted;
    const outgoing = captureFirstRunSurface(screen);
    this.steps.set(previous.step, outgoing);
    return { outgoing, swipe };
  }
  componentDidUpdate(previous, _state, snapshot) {
    if (previous.step !== this.props.step && !snapshot?.swipe) this.clearMotion = playFirstRunMotion(
      this.host.current?.firstElementChild, snapshot?.outgoing, { back: this.props.step < previous.step });
  }
  componentWillUnmount() { this.clearMotion(); this.releaseRenderer(); this.steps.clear(); }
  render() { return <div className="first-run-step-motion" ref={this.host}>{this.props.children}</div>; }
}
