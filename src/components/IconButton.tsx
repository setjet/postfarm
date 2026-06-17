import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'secondary' | 'ghost' | 'danger-ghost';
type Size = 'sm' | 'md';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon: ReactNode;
  label: string;
}

const base =
  'inline-flex items-center justify-center rounded-lg ' +
  'border transition-all shrink-0 ' +
  'outline-none ' +
  'disabled:opacity-50 disabled:pointer-events-none';

const variants: Record<Variant, string> = {
  secondary:
    'bg-control text-ink-4 border-line shadow-main hover:bg-[#363636] hover:text-ink hover:border-line-2',
  ghost:
    'bg-transparent text-ink-5 border-transparent hover:bg-white/[0.055] hover:text-ink-2',
  'danger-ghost':
    'bg-transparent text-ink-5 border-transparent hover:bg-red-500/10 hover:text-danger',
};

const sizes: Record<Size, string> = {
  sm: 'w-8 h-8',
  md: 'w-9 h-9',
};

export function IconButton({
  variant = 'ghost',
  size = 'md',
  icon,
  label,
  className = '',
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {icon}
    </button>
  );
}
