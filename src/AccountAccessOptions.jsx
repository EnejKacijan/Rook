import {useState} from 'react';
import {AccountProviderButtons} from './AccountProviderButtons.jsx';
import {EmailAccountForm} from './EmailAccountForm.jsx';

// One form shared by entry, recovery and anonymous profile linking. It does
// not own Firebase state, profile mutation or any credential persistence.
export function AccountAccessOptions({providers=['google.com'],onChoose,onEmail,onReset,registrationOnly=false,allowRegistration=true,emailOpen:controlledOpen,onEmailOpenChange,emailHeadingLevel=2,showEmailBack=true,...buttonProps}){
  const [localOpen,setLocalOpen]=useState(false);const emailOpen=controlledOpen??localOpen;
  const setEmailOpen=value=>{setLocalOpen(value);onEmailOpenChange?.(value);};
  if(emailOpen&&providers.includes('password')&&onEmail)return <EmailAccountForm busy={buttonProps.busy||buttonProps.disabled} onBack={()=>setEmailOpen(false)} onSubmit={onEmail} onReset={onReset} registrationOnly={registrationOnly} allowRegistration={allowRegistration} headingLevel={emailHeadingLevel} showBack={showEmailBack}/>;
  return <AccountProviderButtons {...buttonProps} providers={providers.filter(id=>id!=='password'||Boolean(onEmail))} onChoose={id=>id==='password'?setEmailOpen(true):onChoose(id)}/>;
}
