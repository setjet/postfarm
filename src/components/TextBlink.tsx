import type { HTMLAttributes } from 'react';
import { cn } from '../lib/utils';

interface TextBlinkProps extends HTMLAttributes<HTMLSpanElement> {
  text?: string;
}

export function TextBlink({ text = 'Generating', className, ...props }: TextBlinkProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn('text-blink inline-block', className)}
      {...props}
    >
      {text}
    </span>
  );
}
