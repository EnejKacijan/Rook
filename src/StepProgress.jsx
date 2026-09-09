// Shared onboarding and import-decision navigation progress, not a loading bar.
export function StepProgress({step,total,hideSingle=false}) {
  if(total<1||(hideSingle&&total===1))return null;
  return <div className="step-progress">
    <div className="progress-line" role="progressbar" aria-label="Step progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step} aria-valuetext={`Step ${step} of ${total}`}>
      <span style={{width:`${(step/total)*100}%`}} />
    </div>
    <span className="step-count" aria-hidden="true">STEP {step}/{total}</span>
  </div>;
}
