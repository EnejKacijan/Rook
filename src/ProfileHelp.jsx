import {AnimatedDetails} from './AnimatedDetails.jsx';
import {useState} from 'react';
import './profileHelp.css';

const answers = [
  ['Forgot your password?', <>
    Choose <strong>Continue with email → Forgot password?</strong> on sign-in. Enter your account email, then check your inbox and spam.
  </>],
  ['Can I use Google and email?', <>
    While signed in with Google, open <strong>Profile → Account &amp; sync → Add password.</strong> Both methods use the same email and training profile.
  </>],
  ['Where are my workouts saved?', <>
    Workouts are saved on this device. A linked account keeps a cloud copy when <strong>Synced</strong>. Photos stay local. For a recovery file, open <strong>Profile → Data &amp; backup.</strong>
  </>],
  ['How do I change just today’s workout?', <>
    Use <strong>Adjust today</strong>, review, then apply. For permanent changes, open <strong>Profile → Program → Edit plan.</strong>
  </>],
  ['Coach isn’t responding?', <>
    Check your connection and <strong>Profile → Account &amp; sync.</strong> Verify your email if asked, then retry. Workout logging also works offline.
  </>],
];

export function ProfileHelp() {
  const [expanded,setExpanded]=useState(null);
  return <section className="profile-help" aria-label="Quick answers">
    {answers.map(([question, answer],index) => <AnimatedDetails className="profile-help-item" key={question}
      open={expanded===index} onOpenChange={next=>setExpanded(next?index:null)}>
      <summary>{question}</summary>
      <p>{answer}</p>
    </AnimatedDetails>)}
  </section>;
}
