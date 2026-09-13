// @vitest-environment jsdom
import React, { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { acknowledgementDuration, useSelectionAcknowledgement, useScheduleContinueReveal } from "./useOnboardingInteractions.js";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root, frames, animate, finish;
beforeEach(()=>{
  frames=new Map();let n=0;
  vi.stubGlobal("requestAnimationFrame",fn=>{frames.set(++n,fn);return n;});
  vi.stubGlobal("cancelAnimationFrame",id=>frames.delete(id));
  vi.stubGlobal("matchMedia",()=>({matches:false}));
  animate=vi.fn(()=>({finished:new Promise(resolve=>{finish=resolve;}),cancel:vi.fn()}));
  Element.prototype.animate=animate;
});
afterEach(()=>{act(()=>root?.unmount());document.body.innerHTML="";vi.unstubAllGlobals();vi.restoreAllMocks();delete Element.prototype.animate;});
function frame(){act(()=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());});}
function render(element){const host=document.createElement("div");document.body.append(host);root=createRoot(host);act(()=>root.render(element));}
function Choices(){const [step,setStep]=useState(1),[answer,setAnswer]=useState("");const ack=useSelectionAcknowledgement(step);return <main data-step={step}><button onClick={event=>{if(ack.begin(event,()=>setStep(s=>s+1)))setAnswer("chosen");}} aria-pressed={answer==="chosen"}>Choose</button><button onClick={()=>setStep(s=>s-1)}>Back</button></main>;}
it("uses the same acknowledgement duration before and after CSS minification",()=>{
  expect(acknowledgementDuration("120ms")).toBe(120);
  expect(acknowledgementDuration(" .12s ")).toBe(120);
  expect(acknowledgementDuration("")).toBe(120);
});
it("paints selected draft before one animation completion, ignores duplicate clicks, and Back never replays it", async()=>{
  render(<Choices/>);const choice=document.querySelector("button");act(()=>{choice.click();choice.click();});
  expect(choice.getAttribute("aria-pressed")).toBe("true");expect(document.querySelector("main").dataset.step).toBe("1");
  frame();frame();expect(animate.mock.calls[0][1].duration).toBe(120);
  await act(async()=>finish());expect(document.querySelector("main").dataset.step).toBe("2");
  act(()=>document.querySelectorAll("button")[1].click());frame();frame();
  expect(document.querySelector("main").dataset.step).toBe("1");expect(animate).toHaveBeenCalledTimes(1);
});
it("Back cancels pending acknowledgement and reduced motion has no timed animation",async()=>{
  render(<Choices/>);act(()=>document.querySelector("button").click());frame();frame();
  act(()=>document.querySelectorAll("button")[1].click());await act(async()=>finish());expect(document.querySelector("main").dataset.step).toBe("0");
});
it("reduced motion advances after selected paint opportunity without animation",()=>{
  vi.stubGlobal("matchMedia",()=>({matches:true}));render(<Choices/>);act(()=>document.querySelector("button").click());
  expect(document.querySelector("button").getAttribute("aria-pressed")).toBe("true");frame();frame();
  expect(animate).not.toHaveBeenCalled();expect(document.querySelector("main").dataset.step).toBe("2");
});
it("only explicit valid duration activation reveals minimum distance once and manual input cancels pending work",()=>{
  function Schedule(){const ref=useRef(null),reveal=useScheduleContinueReveal(4,ref);return <main ref={ref}><button onClick={()=>reveal(true)}>Time</button><div className="onboarding-footer"><button className="primary">Continue</button></div></main>;}
  render(<Schedule/>);const scroll=vi.fn();Object.defineProperty(document,"scrollingElement",{configurable:true,value:document.documentElement});document.documentElement.scrollTo=scroll;
  const buttons=document.querySelectorAll("button");buttons[1].getBoundingClientRect=()=>({top:800,bottom:858});
  expect(scroll).not.toHaveBeenCalled();act(()=>buttons[0].click());act(()=>buttons[0].dispatchEvent(new Event("touchstart",{bubbles:true})));frame();expect(scroll).not.toHaveBeenCalled();
  act(()=>buttons[0].click());frame();expect(scroll).toHaveBeenCalledWith({top:102,behavior:"smooth"});
  act(()=>buttons[0].click());frame();expect(scroll).toHaveBeenCalledTimes(1);
});
