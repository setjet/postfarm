import type { ReactNode } from 'react';

interface ViewHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export function ViewHeader({ title, subtitle, right }: ViewHeaderProps) {
  return (
    <header className="shrink-0 px-4 pb-2 pt-7 sm:px-8 sm:pb-3 sm:pt-9">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-[12px] leading-5 text-ink-5">{subtitle}</p>
        )}
      </div>
      {right && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">{right}</div>}
      </div>
    </header>
  );
}
