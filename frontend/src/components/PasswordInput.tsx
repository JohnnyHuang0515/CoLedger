import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { EyeIcon, EyeOffIcon } from './icons';

// Password field with a show/hide eye toggle. Forwards all standard <input>
// props (value/onChange/required/minLength…); `type` is managed internally.
export function PasswordInput({
  className = '',
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className={`w-full rounded-lg border border-border px-3 py-2 pr-10 text-sm font-normal outline-none focus:border-primary ${className}`}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        // tabIndex -1 keeps tab order going straight from the field to submit.
        tabIndex={-1}
        aria-label={show ? '隱藏密碼' : '顯示密碼'}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-base text-text-muted transition-colors hover:text-text-secondary"
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
