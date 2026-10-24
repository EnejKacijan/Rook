import { useEffect, useId, useRef, useState } from 'react';
import { emailAccountDetails, emailAccountError } from './emailAccountAuth.js';
import './emailAccount.css';

export function AddAccountPassword({ email, onSubmit, onConfirm, onCancel, busy = false }) {
  const id=useId(),firstField=useRef(null),confirmButton=useRef(null),pending=useRef(false);
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[show,setShow]=useState(false);
  const [working,setWorking]=useState(false),[needsConfirmation,setNeedsConfirmation]=useState(false);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const disabled=busy||working;
  useEffect(()=>{if(!disabled)(needsConfirmation?confirmButton:firstField).current?.focus();},[needsConfirmation,disabled]);
  const submit=async event=>{
    event.preventDefault();
    if(pending.current||disabled||needsConfirmation)return;
    setError('');setMessage('');
    try{emailAccountDetails({email,password,intent:'register'});}catch(failure){setError(emailAccountError(failure));return;}
    if(password!==confirmation){setError('The passwords do not match.');return;}
    pending.current=true;setWorking(true);
    const value=password;setPassword('');setConfirmation('');setShow(false);
    try{await onSubmit({password:value});}
    catch(failure){setError(emailAccountError(failure));setNeedsConfirmation(failure?.code==='auth/requires-recent-login');}
    finally{pending.current=false;setWorking(false);}
  };
  const confirm=async()=>{
    if(pending.current||disabled)return;
    pending.current=true;setWorking(true);setError('');setMessage('');
    try{await onConfirm();setNeedsConfirmation(false);setMessage('Google account confirmed. Enter your new password.');firstField.current?.focus();}
    catch(failure){setError(failure?.code==='auth/popup-closed-by-user'?'Confirmation canceled. Try again when you’re ready.':emailAccountError(failure));}
    finally{pending.current=false;setWorking(false);}
  };
  return <section className="email-account account-add-password" aria-labelledby={`${id}-title`} aria-busy={disabled}>
    <h2 id={`${id}-title`}>Set a ROOK password</h2>
    <p>Keep the same training. Sign in with Google or email.</p>
    <form onSubmit={submit}>
      <label htmlFor={`${id}-email`}>Account email</label>
      <input id={`${id}-email`} type="email" autoComplete="username" value={email} readOnly />
      <div className="email-account-password-label"><label htmlFor={`${id}-password`}>New password</label>
        <button type="button" disabled={disabled||needsConfirmation} aria-pressed={show} onClick={()=>setShow(value=>!value)}>{show?'Hide password':'Show password'}</button></div>
      <input ref={firstField} id={`${id}-password`} type={show?'text':'password'} autoComplete="new-password" required value={password}
        disabled={disabled||needsConfirmation} onChange={event=>setPassword(event.target.value)} aria-describedby={`${id}-hint`} />
      <small id={`${id}-hint`}>Use at least 8 characters.</small>
      <label htmlFor={`${id}-confirm`}>Confirm password</label>
      <input id={`${id}-confirm`} type={show?'text':'password'} autoComplete="new-password" required value={confirmation}
        disabled={disabled||needsConfirmation} onChange={event=>setConfirmation(event.target.value)} />
      {error&&<p className="email-account-error" role="alert">{error}</p>}
      {message&&<p role="status">{message}</p>}
      {needsConfirmation
        ?<button ref={confirmButton} type="button" className="button primary" disabled={disabled} onClick={confirm}>CONFIRM WITH GOOGLE</button>
        :<button type="submit" className="button primary" disabled={disabled}>{disabled?'SAVING…':'SET PASSWORD'}</button>}
      <button type="button" className="button quiet" disabled={disabled} onClick={onCancel}>CANCEL</button>
    </form>
  </section>;
}
