import {useEffect,useId,useRef,useState} from 'react';
import {emailAccountDetails,emailAccountError,emailPasswordRequirements,isEmailPasswordPolicyRejection,isEmailSignInRejection} from './emailAccountAuth.js';
import './emailAccount.css';

export function EmailAccountForm({onSubmit,onReset,onBack,getPasswordRequirements,busy=false,registrationOnly=false,allowRegistration=true,headingLevel=2,showBack=true}){
  const [mode,setMode]=useState(registrationOnly?'register':'sign-in');
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
  const [show,setShow]=useState(false),[error,setError]=useState(null),[message,setMessage]=useState(''),[working,setWorking]=useState(false);
  const [passwordFeedback,setPasswordFeedback]=useState(null);
  const pending=useRef(false),id=useId();const disabled=busy||working;
  const registering=mode==='register';
  const credentialsRejected=error?.credentialsRejected||undefined;
  const passwordError=error?.passwordRejected ? error.message : null;
  const errorId=`${id}-error`;
  const confirmHintId=`${id}-confirm-hint`;
  const clearErrorOnEdit=(passwordEdited=false)=>{
    if(credentialsRejected||(registering&&(!passwordError||passwordEdited)))setError(null);
  };
  const switchMode=value=>{setMode(value);setPassword('');setConfirm('');setPasswordFeedback(null);setShow(false);setError(null);setMessage('');};
  const showFailure=failure=>setError({
    message:emailAccountError(failure),
    credentialsRejected:mode==='sign-in'&&isEmailSignInRejection(failure),
    passwordRejected:registering&&isEmailPasswordPolicyRejection(failure),
  });

  useEffect(()=>{
    if(!registering||!getPasswordRequirements)return;
    let active=true;
    const timer=setTimeout(async()=>{
      let requirements=null;
      try { requirements=await getPasswordRequirements(password); }
      catch { /* Keep the app's local requirement visible when Firebase is unavailable. */ }
      if(active)setPasswordFeedback({password,requirements});
    },password ? 120 : 0);
    return ()=>{active=false;clearTimeout(timer);};
  },[registering,getPasswordRequirements,password]);

  const currentFeedback=passwordFeedback?.password===password ? passwordFeedback : null;
  const checkingPasswordRequirements=Boolean(getPasswordRequirements&&!currentFeedback);
  const missingRequirements=currentFeedback?.requirements ?? emailPasswordRequirements(password);
  let passwordHint='Password meets the requirements.';
  if(missingRequirements.length)passwordHint=`Use ${missingRequirements.join(', ')}.`;
  else if(checkingPasswordRequirements)passwordHint='Checking password requirements…';
  else if(currentFeedback?.requirements===null)passwordHint='Additional requirements will be checked when you submit.';
  const confirmationMismatch=Boolean(confirm&&password!==confirm);

  const submit=async event=>{
    event.preventDefault();if(pending.current||disabled)return;setError(null);setMessage('');
    let details;
    try{
      details=emailAccountDetails({email,password:mode==='reset'?'validation-only':password,intent:registering?'register':'sign-in'});
      if(registering&&password!==confirm){setError({ message:'The passwords do not match.' });return;}
    }catch(failure){showFailure(failure);return;}
    pending.current=true;setWorking(true);
    if(!registering)setPassword('');
    try{
      if(mode==='reset'){await onReset(details.email);setMessage('If a password account uses this email, you’ll receive a reset link. Check your inbox and spam folder.');}
      else {
        await onSubmit(details);
        if(registering){setPassword('');setConfirm('');setPasswordFeedback(null);setShow(false);}
      }
    }catch(failure){showFailure(failure);}
    finally{pending.current=false;setWorking(false);}
  };
  const Heading=headingLevel===1?'h1':'h2';
  return <section className="email-account" aria-labelledby={`${id}-title`} aria-busy={disabled}>
    {showBack&&<button type="button" className="email-account-back" disabled={disabled} onClick={onBack}>Back to sign-in methods</button>}
    <Heading id={`${id}-title`}>{mode==='register'?'Create an email account':mode==='reset'?'Reset your password':'Sign in with email'}</Heading>
    {registrationOnly&&<p>Keep this profile and restore it on another device.</p>}
    <form onSubmit={submit}>
      <label htmlFor={`${id}-email`}>Email</label>
      <input id={`${id}-email`} type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} disabled={disabled}
        aria-invalid={credentialsRejected} aria-describedby={credentialsRejected ? errorId : undefined}
        onChange={event=>{setEmail(event.target.value);clearErrorOnEdit();}}/>
      {mode!=='reset'&&<>
        <div className="email-account-password-label"><label htmlFor={`${id}-password`}>Password</label><button type="button" disabled={disabled} aria-pressed={show} onClick={()=>setShow(value=>!value)}>{show?'Hide password':'Show password'}</button></div>
        <input className="email-account-password" id={`${id}-password`} type={show?'text':'password'} autoComplete={mode==='register'?'new-password':'current-password'} required value={password} disabled={disabled}
          aria-invalid={credentialsRejected} aria-describedby={credentialsRejected ? errorId : mode==='register' ? `${id}-password-hint` : undefined}
          onChange={event=>{setPassword(event.target.value);clearErrorOnEdit(true);}}/>
        {registering&&<>
          <small key={passwordError ? 'rejected' : 'hint'} id={`${id}-password-hint`}
            role={passwordError ? 'alert' : undefined} aria-live={passwordError ? undefined : 'polite'}
            aria-busy={passwordError ? undefined : checkingPasswordRequirements}>{passwordError ?? passwordHint}</small>
          <label htmlFor={`${id}-confirm`}>Confirm password</label>
          <input id={`${id}-confirm`} type={show?'text':'password'} autoComplete="new-password" required value={confirm} disabled={disabled}
            aria-describedby={confirmationMismatch&&!error ? confirmHintId : undefined}
            onChange={event=>{setConfirm(event.target.value);clearErrorOnEdit();}}/>
          {confirmationMismatch&&!error&&<small id={confirmHintId}>Passwords do not match yet.</small>}
        </>}
      </>}
      {error&&!passwordError&&<p id={errorId} className="email-account-error" role="alert">{error.message}</p>}
      {message&&<p role="status">{message}</p>}
      <button type="submit" className="button primary" disabled={disabled}>{disabled?'PLEASE WAIT…':mode==='register'?'CREATE ACCOUNT':mode==='reset'?'SEND RESET LINK':'SIGN IN'}</button>
    </form>
    {mode==='sign-in'&&onReset&&<button type="button" className="email-account-link" disabled={disabled} onClick={()=>switchMode('reset')}>Forgot password?</button>}
    {mode==='sign-in'&&allowRegistration&&!registrationOnly&&<button type="button" className="email-account-link" disabled={disabled} onClick={()=>switchMode('register')}>New to ROOK? Create an account</button>}
    {mode!=='sign-in'&&!registrationOnly&&<button type="button" className="email-account-link" disabled={disabled} onClick={()=>switchMode('sign-in')}>Back to sign in</button>}
  </section>;
}
