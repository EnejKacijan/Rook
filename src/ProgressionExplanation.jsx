import {AnimatedDetails} from './AnimatedDetails.jsx';
import './progressionGuidance.css';

export function ProgressionExplanation({presentation}) {
  return <AnimatedDetails className="progression-why"><summary aria-label="Why this step?" data-workout-options onPointerDown={event=>{if(event.button===0)event.preventDefault();}}>Why</summary><p className="progression-evidence">{presentation.explanation}</p></AnimatedDetails>;
}
