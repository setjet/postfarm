import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger-ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium ' +
  'border transition-all select-none whitespace-nowrap shadow-main ' +
  'outline-none ' +
  'disabled:opacity-50 disabled:pointer-events-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-ink text-bg border-ink hover:bg-ink-2 hover:border-ink-2 active:scale-[0.98]',
  secondary:
    'bg-control text-ink-3 border-line hover:bg-[#363636] hover:text-ink hover:border-line-2',
  ghost:
    'bg-transparent text-ink-5 border-transparent shadow-none hover:bg-white/[0.055] hover:text-ink-2',
  'danger-ghost':
    'bg-transparent text-ink-5 border-transparent shadow-none hover:bg-red-500/10 hover:text-danger',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[11px]',
  md: 'h-9 px-3 text-[12px]',
  lg: 'h-10 px-3.5 text-[13px]',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  trailingIcon,
  fullWidth,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
      {trailingIcon}
    </button>
  );
}
