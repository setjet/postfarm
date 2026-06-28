import { useEffect, useMemo, useState } from 'react';
import { Clock3, Loader2, Sparkles } from 'lucide-react';
import type { GenerateOptions } from '../lib/api';

interface GenerationLoadingCardProps {
  count: number;
  options: GenerateOptions;
}

function stagesFor(options: GenerateOptions) {
  const quality = options.qualityMode && options.qualityMode !== 'off';
  return [
    'reading your brand brain...',
    ...(options.useTrends || options.trendIds?.length ? ['studying trend patterns...'] : []),
    'writing hooks...',
    'building slide copy...',
    ...(quality ? ['scoring post quality...', 'rewriting weak posts...'] : []),
    'choosing hashtags...',
    'saving to queue...',
  ];
}

function formatLabel(options: GenerateOptions) {
  return options.postFormat === 'notes' ? 'Text-note carousel' : 'Standard carousel';
}

function estimateSeconds(count: number, options: GenerateOptions) {
  const quality = options.qualityMode && options.qualityMode !== 'off';
  let perPost = options.postFormat === 'notes' ? 6 : 4;
  if (quality) perPost = options.postFormat === 'notes' ? 11 : 9;
  if (quality) perPost += Math.min(Math.max(Number(options.maxRewriteAttempts || 1) - 1, 0), 3) * 2;
  if (options.useTrends || options.trendIds?.length) perPost += 1;
  if (options.useLearning) perPost += 1;
  return Math.min(Math.max(Math.round(count * perPost + 4), 8), 180);
}

function remainingLabel(progress: number, estimateMs: number, startedAt: number) {
  const elapsed = Date.now() - startedAt;
  const left = Math.max(0, Math.ceil((estimateMs - elapsed) / 1000));
  if (progress > 0.84 || left <= 5) return 'almost done';
  if (left <= 15) return 'about 10s left';
  if (left <= 45) return `about ${Math.ceil(left / 5) * 5}s left`;
  if (left <= 90) return `about ${Math.ceil(left / 10) * 10}s left`;
  return `about ${Math.ceil(left / 30) * 30}s left`;
}

export function GenerationLoadingCard({ count, options }: GenerationLoadingCardProps) {
  const estimate = useMemo(() => estimateSeconds(count, options), [count, options]);
  const stages = useMemo(() => stagesFor(options), [options]);
  const estimateMs = estimate * 1000;
  const [startedAt] = useState(() => Date.now());
  const [progress, setProgress] = useState(0.08);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio = Math.min(elapsed / estimateMs, 1);
      const eased = 1 - Math.pow(1 - ratio, 2.2);
      setProgress(Math.min(0.9, 0.08 + eased * 0.82));
    }, 260);
    return () => window.clearInterval(timer);
  }, [estimateMs, startedAt]);

  const stageIndex = Math.min(stages.length - 1, Math.floor((progress / 0.9) * stages.length));
  const percent = Math.round(progress * 100);
  const remaining = remainingLabel(progress, estimateMs, startedAt);

  return (
    <div className="modal-backdrop !z-[70]">
      <div className="modal-shell fade-up w-full max-w-md">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-raised border border-line flex items-center justify-center text-accent shrink-0">
              <Sparkles size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold">
                {formatLabel(options)}
              </p>
              <h2 className="text-[17px] font-semibold text-ink mt-1">Generating posts...</h2>
              <p className="text-[12px] text-ink-5 mt-1">
                Creating {count} post{count === 1 ? '' : 's'}
              </p>
            </div>
            <Loader2 size={17} className="text-accent animate-spin mt-1" />
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-[12px] text-ink-4" aria-live="polite">
                {stages[stageIndex]}
              </p>
              <span className="text-[11px] text-ink-6 tabular-nums">{percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-control border border-line overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-[12px] text-ink-5">
            <Clock3 size={13} className="text-ink-6" />
            <span>{remaining}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
