import type { ReactNode } from 'react';

interface ViewHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export function ViewHeader({ title, subtitle, right }: ViewHeaderProps) {
  return (
    <div className="px-4 sm:px-8 py-4 border-b border-line flex items-center justify-between gap-4 shrink-0">
      <div className="min-w-0">
        <h1 className="text-[24px] sm:text-[26px] font-semibold text-ink leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-[12px] text-ink-5 mt-1 max-w-2xl leading-relaxed">{subtitle}</p>
        )}
      </div>
      {right && <div className="flex shrink-0 items-center justify-end gap-2">{right}</div>}
    </div>
  );
}
