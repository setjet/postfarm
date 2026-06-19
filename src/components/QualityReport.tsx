import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, ShieldAlert, Sparkles } from 'lucide-react';
import type { QualityReport as QualityReportType } from '../types';
import { Button } from './Button';

export function QualityReport({ report, onFix, onRecheck }: {
  report?: QualityReportType | null;
  onFix?: () => Promise<void> | void;
  onRecheck?: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = report?.status || 'blocked';
  const meta = report
    ? status === 'passed'
      ? { label: 'Passed', icon: CheckCircle2, className: 'border-success/40 bg-green-500/10 text-success' }
      : status === 'warnings'
      ? { label: `${report.summary.warnings} warning${report.summary.warnings === 1 ? '' : 's'}`, icon: AlertTriangle, className: 'border-warning/40 bg-amber-500/10 text-warning' }
      : { label: `${report.summary.blocking} blocked`, icon: ShieldAlert, className: 'border-danger/40 bg-red-500/10 text-danger' }
    : { label: 'Not checked', icon: ShieldAlert, className: 'border-line bg-white/5 text-ink-5' };
  const Icon = meta.icon;
  const hasSafeFix = !!report?.findings.some((finding) => finding.fix === 'safe');

  const run = async (action?: () => Promise<void> | void) => {
    if (!action) return;
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium ${meta.className}`}
      >
        <Icon size={12} /> Quality: {meta.label}{report ? ` · ${report.score}/100` : ''}
        <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-line bg-[#101010] p-3">
          {report?.findings.length ? (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {report.findings.map((finding) => (
                <div key={finding.id} className="rounded-lg border border-line bg-white/[0.025] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-semibold uppercase tracking-wider ${finding.severity === 'blocking' ? 'text-danger' : 'text-warning'}`}>{finding.severity}</span>
                    <span className="text-[11px] font-medium text-ink-3">{finding.check}</span>
                    {finding.slideIndex !== undefined && <span className="text-[9px] text-ink-6">Slide {finding.slideIndex + 1}</span>}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-4">{finding.explanation}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-ink-6">Suggested: {finding.suggestion}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-ink-4">All detected content, layout, and technical checks passed.</p>
          )}
          {error && <p className="mt-2 text-[10px] text-danger">{error}</p>}
          {(onRecheck || (onFix && hasSafeFix)) && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              {onRecheck && <Button size="sm" disabled={busy} onClick={() => void run(onRecheck)}>{busy ? <Loader2 size={12} className="animate-spin" /> : null} Recheck</Button>}
              {onFix && hasSafeFix && <Button size="sm" disabled={busy} icon={<Sparkles size={12} />} onClick={() => void run(onFix)}>Apply safe fixes</Button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
