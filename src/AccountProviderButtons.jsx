import { accountProviderName } from './accountProviders.js';
import './accountProviders.css';

export const providerButtonClass = (id, treatment = 'primary') => `button ${id==='password'?'secondary':treatment}`;
const label = (id,prefix) => `${prefix} ${accountProviderName(id).toUpperCase()}`;
export function AccountProviderLabel({ id, prefix = 'CONTINUE WITH' }) {
  return <>{label(id,prefix)}</>;
}
export function AccountProviderButtons({ providers = ['google.com'], disabled, busy, onChoose, treatment = 'primary', prefix = 'CONTINUE WITH', initialFocus = false }) {
  return <div className="account-provider-buttons">{providers.map((id,index) => <button key={id} type="button"
    className={providerButtonClass(id,treatment)} disabled={disabled || busy}
    data-sheet-initial-focus={initialFocus && index===0 ? true : undefined}
    aria-label={label(id,prefix)} onClick={() => onChoose(id)}>
    {busy ? 'VERIFYING…' : <AccountProviderLabel id={id} prefix={prefix}/>}</button>)}</div>;
}
