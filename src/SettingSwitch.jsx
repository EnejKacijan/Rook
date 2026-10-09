import React, { useId } from 'react';

export function SettingSwitch({
  label,
  help,
  accessory,
  checked,
  onChange,
  disabled = false,
  className = "",
}) {
  const inputId = useId();
  const helpId = `${inputId}-help`;
  if (accessory) {
    return (
      <div
        className={`setting-switch setting-switch-with-accessory${disabled ? " disabled" : ""}${className ? ` ${className}` : ""}`}
      >
        <label className="setting-switch-text" htmlFor={inputId}>
          {label}
        </label>
        {accessory}
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <label
          className="setting-switch-toggle"
          htmlFor={inputId}
          aria-hidden="true"
        >
          <i />
        </label>
      </div>
    );
  }
  return (
    <label
      className={`setting-switch${disabled ? " disabled" : ""}${className ? ` ${className}` : ""}`}
    >
      <span className="setting-switch-copy">
        {help ? (
          <>
            <strong>{label}</strong>
            <small id={helpId}>{help}</small>
          </>
        ) : (
          label
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        aria-describedby={help ? helpId : undefined}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}
