import { useEffect, useRef, useState } from 'react';
import { X, Loader2, Sparkles } from 'lucide-react';
import { Button } from './Button';
import { PackPicker } from './PackPicker';
import type { GenerateOptions } from '../lib/api';

interface GenerateModalProps {
  defaultPacks: string[];
  initialCount?: number;
  initialOptions?: GenerateOptions;
  generating: boolean;
  error?: string | null;
  onClose: () => void;
  onGenerate: (count: number, options: GenerateOptions) => void;
}

const COUNT_OPTIONS = [1, 3, 5, 10];
const fieldLabel = 'mb-1.5 block text-[11px] font-semibold text-ink-4';
const segmentedButton = (selected: boolean) =>
  `h-8 rounded-md px-2 text-[11px] font-medium transition-colors duration-150 motion-reduce:transition-none disabled:opacity-50 ${
    selected ? 'bg-control text-ink' : 'text-ink-5 hover:bg-white/[0.045] hover:text-ink-3'
  }`;

export function GenerateModal({ defaultPacks, initialCount, initialOptions, generating, error, onClose, onGenerate }: GenerateModalProps) {
  const startingCount = initialCount ?? 3;
  const [count, setCount] = useState(startingCount);
  const [quantitySource, setQuantitySource] = useState<'preset' | 'custom'>(COUNT_OPTIONS.includes(startingCount) ? 'preset' : 'custom');
  const [postFormat, setPostFormat] = useState<'standard' | 'notes'>(initialOptions?.postFormat || 'standard');
  const [packs, setPacks] = useState<string[]>(initialOptions?.packs || defaultPacks);
  const [useTrends, setUseTrends] = useState(initialOptions?.useTrends || false);
  const [useLearning, setUseLearning] = useState(initialOptions?.useLearning || false);
  const [qualityMode, setQualityMode] = useState<'off' | 'normal' | 'strict'>(initialOptions?.qualityMode || 'off');
  const [minScore, setMinScore] = useState(initialOptions?.minScore ?? 7);
  const [maxRewriteAttempts, setMaxRewriteAttempts] = useState(initialOptions?.maxRewriteAttempts ?? 1);
  const [contentBucket, setContentBucket] = useState(initialOptions?.contentBucket || '');
  const [ctaKeyword, setCtaKeyword] = useState(initialOptions?.ctaKeyword || '');
  const [topicMode, setTopicMode] = useState<'general' | 'custom'>(initialOptions?.topicMode || 'general');
  const [topic, setTopic] = useState(initialOptions?.topic || '');
  const [generationNotes, setGenerationNotes] = useState(initialOptions?.generationNotes || '');
  const [topicError, setTopicError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const submittedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const generatingRef = useRef(generating);

  useEffect(() => {
    onCloseRef.current = onClose;
    generatingRef.current = generating;
  }, [generating, onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => (closeButtonRef.current || dialog)?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!generatingRef.current) {
          event.preventDefault();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  const submit = () => {
    if (generating || submittedRef.current) return;
    const cleanTopic = topic.trim();
    if (topicMode === 'custom' && !cleanTopic) {
      setTopicError('Enter a topic, or switch back to General.');
      return;
    }
    setTopicError(null);
    submittedRef.current = true;
    onGenerate(count, {
      postFormat,
      packs,
      useTrends,
      useLearning,
      qualityMode,
      minScore,
      maxRewriteAttempts,
      contentBucket: contentBucket.trim() || undefined,
      ctaKeyword: ctaKeyword.trim() || undefined,
      topicMode,
      topic: topicMode === 'custom' ? cleanTopic : undefined,
      generationNotes: generationNotes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-6" onClick={generating ? undefined : onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-modal-title"
        tabIndex={-1}
        className="fade-up flex max-h-[calc(100dvh-24px)] w-[1000px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-main sm:max-h-[85vh] sm:max-w-[calc(100vw-48px)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3 sm:px-5">
          <h2 id="generate-modal-title" className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-raised text-accent">
              <Sparkles size={15} />
            </span>
            Generate slideshows
          </h2>
          {!generating && (
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close Generate slideshows"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-5 hover:bg-white/[0.055] hover:text-ink"
            >
              <X size={18} />
            </button>
          )}
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-6 overflow-y-auto px-4 py-4 sm:px-5 md:grid-cols-[minmax(280px,0.86fr)_minmax(0,1.5fr)] md:gap-7">
          <div className="min-w-0 space-y-4">
            <fieldset>
              <legend className={fieldLabel}>How many?</legend>
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-2">
                <div className="grid grid-cols-4 gap-1 rounded-lg bg-raised p-1">
                  {COUNT_OPTIONS.map((option) => {
                    const selected = quantitySource === 'preset' && count === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setQuantitySource('preset');
                          setCount(option);
                        }}
                        disabled={generating}
                        className={segmentedButton(selected)}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                <label className={`flex h-10 items-center justify-between gap-1 rounded-lg border px-2 transition-colors duration-150 motion-reduce:transition-none ${quantitySource === 'custom' ? 'border-accent bg-white/[0.035]' : 'border-line bg-raised'}`}>
                  <span className="text-[10px] font-medium text-ink-5">Custom</span>
                  <input
                    aria-label="Custom quantity"
                    type="number"
                    min={1}
                    max={100}
                    value={count}
                    disabled={generating}
                    onFocus={() => setQuantitySource('custom')}
                    onChange={(event) => {
                      setQuantitySource('custom');
                      setCount(Math.max(1, Math.min(100, Math.round(Number(event.target.value) || 1))));
                    }}
                    className="h-7 w-10 bg-transparent text-right text-[12px] font-medium tabular-nums text-ink outline-none disabled:opacity-50"
                  />
                </label>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-6">1–100. Large batches generate in chunks.</p>
            </fieldset>

            <fieldset>
              <legend className={fieldLabel}>Format</legend>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-raised p-1">
                <button type="button" aria-pressed={postFormat === 'standard'} onClick={() => setPostFormat('standard')} disabled={generating} className={segmentedButton(postFormat === 'standard')}>Standard carousel</button>
                <button type="button" aria-pressed={postFormat === 'notes'} onClick={() => setPostFormat('notes')} disabled={generating} className={segmentedButton(postFormat === 'notes')}>Notes-style</button>
              </div>
              {postFormat === 'notes' && <p className="mt-1.5 text-[11px] leading-relaxed text-ink-6">Creates a 2-slide lifestyle hook + iPhone Notes carousel.</p>}
            </fieldset>

            <fieldset>
              <legend className={fieldLabel}>Topic</legend>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-raised p-1">
                <button
                  type="button"
                  aria-pressed={topicMode === 'general'}
                  onClick={() => {
                    setTopicMode('general');
                    setTopicError(null);
                  }}
                  disabled={generating}
                  className={segmentedButton(topicMode === 'general')}
                >
                  General
                </button>
                <button type="button" aria-pressed={topicMode === 'custom'} onClick={() => setTopicMode('custom')} disabled={generating} className={segmentedButton(topicMode === 'custom')}>Custom topic</button>
              </div>
              {topicMode === 'custom' ? (
                <input
                  value={topic}
                  onChange={(event) => {
                    setTopic(event.target.value);
                    if (topicError) setTopicError(null);
                  }}
                  placeholder="What should these posts be about?"
                  disabled={generating}
                  className="mt-2 h-9 w-full rounded-lg border border-line bg-raised px-3 text-[12px] text-ink outline-none placeholder:text-ink-6 focus:border-line-2 disabled:opacity-50"
                />
              ) : (
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-6">Uses the Brain, trends, learning, and buckets to choose the topic.</p>
              )}
              {topicError && <p role="alert" className="mt-1 text-[11px] text-danger">{topicError}</p>}
            </fieldset>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label htmlFor="generation-notes" className="text-[11px] font-semibold text-ink-4">Generation notes</label>
                <span className="text-[10px] tabular-nums text-ink-6">{generationNotes.length}/2000</span>
              </div>
              <textarea
                id="generation-notes"
                value={generationNotes}
                onChange={(event) => setGenerationNotes(event.target.value.slice(0, 2000))}
                maxLength={2000}
                rows={2}
                placeholder="e.g. use shorter hooks and avoid emojis"
                disabled={generating}
                className="w-full resize-none rounded-lg border border-line bg-raised px-3 py-2 text-[12px] text-ink outline-none placeholder:text-ink-6 focus:border-line-2 disabled:opacity-50"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-ink-6">Optional instructions for what to include, avoid, or emphasise.</p>
            </div>

            <fieldset className="space-y-3">
              <legend className={fieldLabel}>Growth options</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-[11px] text-ink-4">
                  <input type="checkbox" checked={useTrends} onChange={(event) => setUseTrends(event.target.checked)} disabled={generating} />
                  Use stored trends
                </label>
                <label className="flex items-center gap-2 text-[11px] text-ink-4">
                  <input type="checkbox" checked={useLearning} onChange={(event) => setUseLearning(event.target.checked)} disabled={generating} />
                  Use learning
                </label>
              </div>

              <div>
                <label className="mb-1 block text-[10px] text-ink-6">Quality mode</label>
                <select
                  value={qualityMode}
                  onChange={(event) => setQualityMode(event.target.value as 'off' | 'normal' | 'strict')}
                  disabled={generating}
                  className="h-9 w-full rounded-lg border border-line bg-raised px-3 text-[11px] text-ink outline-none focus:border-line-2 disabled:opacity-50"
                >
                  <option value="off">Off</option>
                  <option value="normal">Normal - include weak posts as Needs review</option>
                  <option value="strict">Strict - drop posts below threshold</option>
                </select>
              </div>

              {qualityMode !== 'off' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-ink-6">Minimum score
                    <input type="number" min={1} max={10} value={minScore} onChange={(event) => setMinScore(Number(event.target.value))} onBlur={() => setMinScore((score) => Math.min(Math.max(score || 1, 1), 10))} disabled={generating} className="mt-1 h-9 w-full rounded-lg border border-line bg-raised px-3 text-[12px] text-ink outline-none focus:border-line-2 disabled:opacity-50" />
                  </label>
                  <label className="text-[10px] text-ink-6">Rewrite attempts
                    <input type="number" min={0} max={5} value={maxRewriteAttempts} onChange={(event) => setMaxRewriteAttempts(Number(event.target.value))} onBlur={() => setMaxRewriteAttempts((attempts) => Math.min(Math.max(attempts || 0, 0), 5))} disabled={generating} className="mt-1 h-9 w-full rounded-lg border border-line bg-raised px-3 text-[12px] text-ink outline-none focus:border-line-2 disabled:opacity-50" />
                  </label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <input value={contentBucket} onChange={(event) => setContentBucket(event.target.value)} placeholder="Bucket, e.g. mistakes" disabled={generating} className="h-9 w-full rounded-lg border border-line bg-raised px-3 text-[11px] text-ink outline-none placeholder:text-ink-6 focus:border-line-2 disabled:opacity-50" />
                <input value={ctaKeyword} onChange={(event) => setCtaKeyword(event.target.value)} placeholder="CTA, e.g. save" disabled={generating} className="h-9 w-full rounded-lg border border-line bg-raised px-3 text-[11px] text-ink outline-none placeholder:text-ink-6 focus:border-line-2 disabled:opacity-50" />
              </div>
            </fieldset>
          </div>

          <div className="min-w-0">
            <PackPicker selected={packs} onChange={setPacks} disabled={generating} layout="generation" />
          </div>
        </div>

        <footer className="shrink-0 border-t border-line bg-[#181818] px-4 py-3 sm:px-5">
          {error && !generating && <p role="alert" className="mb-2 text-[12px] leading-snug text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={generating}>Cancel</Button>
            <Button variant="primary" icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} onClick={submit} disabled={generating}>
              {generating ? 'Generating…' : `Generate ${count}`}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
