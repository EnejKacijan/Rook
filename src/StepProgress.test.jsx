import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {StepProgress} from './StepProgress.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
it('keeps onboarding first-fraction semantics and optionally hides a single step',()=>{
 const host=document.createElement('div'),root=createRoot(host);
 try{
  act(()=>root.render(<StepProgress step={1} total={8}/>));
  expect(host.querySelector('.progress-line span').style.width).toBe('12.5%');
  expect(host.querySelector('[role="progressbar"]').getAttribute('aria-valuetext')).toBe('Step 1 of 8');
  act(()=>root.render(<StepProgress step={1} total={1}/>));expect(host.textContent).toBe('STEP 1/1');
  act(()=>root.render(<StepProgress step={1} total={1} hideSingle/>));expect(host.childElementCount).toBe(0);
  act(()=>root.render(<StepProgress step={0} total={0}/>));expect(host.childElementCount).toBe(0);
 }finally{act(()=>root.unmount());}
});
