import {useId,useRef,useState} from 'react';
import {emailAccountDetails,emailAccountError} from './emailAccountAuth.js';
import './emailAccount.css';

export function EmailAccountForm({onSubmit,onReset,onBack,busy=false,registrationOnly=false,allowRegistration=true,headingLevel=2,showBack=true}){
  const [mode,setMode]=useState(registrationOnly?'register':'sign-in');
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
  const [show,setShow]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[working,setWorking]=useState(false);
  const pending=useRef(false),id=useId();const disabled=busy||working;
  const switchMode=value=>{setMode(value);setPassword('');setConfirm('');setShow(false);setError('');setMessage('');};
  const submit=async event=>{
    event.preventDefault();if(pending.current||disabled)return;setError('');setMessage('');
    let details;
    try{
      details=emailAccountDetails({email,password:mode==='reset'?'validation-only':password,intent:mode==='register'?'register':'sign-in'});
      if(mode==='register'&&password!==confirm){setError('The passwords do not match.');return;}
    }catch(failure){setError(emailAccountError(failure));return;}
    pending.current=true;setWorking(true);setPassword('');setConfirm('');
    try{
      if(mode==='reset'){await onReset(details.email);setMessage('If a password account uses this email, you’ll receive a reset link. Check your inbox and spam folder.');}
      else await onSubmit(details);
    }catch(failure){setError(emailAccountError(failure));}
    finally{pending.current=false;setWorking(false);}
  };
  const Heading=headingLevel===1?'h1':'h2';
  return <section className="email-account" aria-labelledby={`${id}-title`} aria-busy={disabled}>
    {showBack&&<button type="button" className="email-account-back" disabled={disabled} onClick={onBack}>Back to sign-in methods</button>}
    <Heading id={`${id}-title`}>{mode==='register'?'Create an email account':mode==='reset'?'Reset your password':'Sign in with email'}</Heading>
    {registrationOnly&&<p>Keep this profile and restore it on another device.</p>}
    <form onSubmit={submit}>
      <label htmlFor={`${id}-email`}>Email</label>
      <input id={`${id}-email`} type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} disabled={disabled} onChange={event=>setEmail(event.target.value)}/>
      {mode!=='reset'&&<>
        <div className="email-account-password-label"><label htmlFor={`${id}-password`}>Password</label><button type="button" disabled={disabled} aria-pressed={show} onClick={()=>setShow(value=>!value)}>{show?'Hide password':'Show password'}</button></div>
        <input id={`${id}-password`} type={show?'text':'password'} autoComplete={mode==='register'?'new-password':'current-password'} required value={password} disabled={disabled} onChange={event=>setPassword(event.target.value)} aria-describedby={mode==='register'?`${id}-password-hint`:undefined}/>
        {mode==='register'&&<><small id={`${id}-password-hint`}>Use at least 8 characters.</small><label htmlFor={`${id}-confirm`}>Confirm password</label><input id={`${id}-confirm`} type={show?'text':'password'} autoComplete="new-password" required value={confirm} disabled={disabled} onChange={event=>setConfirm(event.target.value)}/></>}
      </>}
      {error&&<p className="email-account-error" role="alert">{error}</p>}
      {message&&<p role="status">{message}</p>}
      <button type="submit" className="button primary" disabled={disabled}>{disabled?'PLEASE WAIT…':mode==='register'?'CREATE ACCOUNT':mode==='reset'?'SEND RESET LINK':'SIGN IN'}</button>
    </form>
    {mode==='sign-in'&&onReset&&<button type="button" className="email-account-link" disabled={disabled} onClick={()=>switchMode('reset')}>Forgot password?</button>}
    {mode==='sign-in'&&allowRegistration&&!registrationOnly&&<button type="button" className="email-account-link" disabled={disabled} onClick={()=>switchMode('register')}>New to ROOK? Create an account</button>}
    {mode!=='sign-in'&&!registrationOnly&&<button type="button" className="email-account-link" disabled={disabled} onClick={()=>switchMode('sign-in')}>Back to sign in</button>}
  </section>;
}
