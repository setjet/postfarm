import { Check, X, Sparkles, RefreshCw, Loader2, Pencil, Wand2, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { Slideshow } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { SlidePreview } from '../components/SlidePreview';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { normalizeHashtags } from '../lib/hashtags';
import { QualityReport } from '../components/QualityReport';

interface QueueViewProps {
  slideshows: Slideshow[];
  generating: boolean;
  canGenerate: boolean;
  selectedIds: string[];
  onGenerate: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (id: string) => void;
  onRewrite: (id: string, note?: string) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkSchedule: () => void;
  onQuality: (id: string) => Promise<void> | void;
  onSafeFix: (id: string) => Promise<void> | void;
}

export function QueueView({
  slideshows,
  generating,
  canGenerate,
  selectedIds,
  onGenerate,
  onApprove,
  onReject,
  onEdit,
  onRewrite,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onBulkSchedule,
  onQuality,
  onSafeFix,
}: QueueViewProps) {
  const selectedCount = selectedIds.length;
  return (
    <>
      <ViewHeader
        title="Queue"
        subtitle={`${slideshows.length} slideshows waiting for your review. Approve to send to the scheduler.`}
        right={
          <>
            {selectedCount > 0 ? (
              <>
                <span className="text-[12px] text-ink-5">{selectedCount} selected</span>
                <Button variant="primary" icon={<Check size={13} />} onClick={onBulkSchedule}>
                  Schedule {selectedCount}
                </Button>
                <Button variant="ghost" onClick={onClearSelection}>Clear</Button>
              </>
            ) : (
              slideshows.length > 0 && (
                <Button variant="secondary" className="w-[128px]" onClick={onSelectAll}>Select all</Button>
              )
            )}
            <Button
              variant="primary"
              icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              onClick={onGenerate}
              disabled={generating || !canGenerate}
              className="w-[128px]"
            >
              {generating ? 'Generating...' : 'Generate more'}
            </Button>
          </>
        }
      />

      {slideshows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-sm fade-up">
            <div className="w-11 h-11 rounded-xl bg-raised border border-line flex items-center justify-center mx-auto mb-4 shadow-main">
              <Check size={18} className="text-accent" />
            </div>
            <h2 className="text-[16px] font-semibold text-ink">
              {canGenerate ? 'Queue empty' : 'Add your OpenRouter key to start'}
            </h2>
            <p className="text-[13px] text-ink-5 mt-1.5 leading-relaxed">
              {canGenerate
                ? 'Generate a fresh batch of slideshows with AI.'
                : 'Head to Settings, paste your OpenRouter API key, and tune the Brain.'}
            </p>
            {canGenerate && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="secondary"
                  icon={generating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  onClick={onGenerate}
                  disabled={generating}
                >
                  {generating ? 'Generating...' : 'Generate now'}
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="grid grid-cols-1 xl:grid-cols-2 items-start gap-4 max-w-6xl mx-auto">
            {slideshows.map((s) => (
              <SlideshowCard
                key={s.id}
                slideshow={s}
                selected={selectedIds.includes(s.id)}
                onToggleSelect={() => onToggleSelect(s.id)}
                onApprove={() => onApprove(s.id)}
                onReject={() => onReject(s.id)}
                onEdit={() => onEdit(s.id)}
                onRewrite={() => {
                  const note = window.prompt('Optional rewrite note', s.qualityFeedback || 'Make this sharper and less generic.');
                  if (note !== null) onRewrite(s.id, note);
                }}
                onQuality={() => onQuality(s.id)}
                onSafeFix={() => onSafeFix(s.id)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

interface CardProps {
  slideshow: Slideshow;
  selected: boolean;
  onToggleSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onRewrite: () => void;
  onQuality: () => Promise<void> | void;
  onSafeFix: () => Promise<void> | void;
}

function scoreLabel(slideshow: Slideshow) {
  const score = slideshow.qualityScore;
  const status = slideshow.qualityStatus || (score === undefined ? null : score >= 8.5 ? 'strong' : score >= 7 ? 'ready' : score >= 5.5 ? 'needs-review' : 'weak');
  if (!status) return null;
  const label = status === 'needs-review' ? 'Needs review' : status[0].toUpperCase() + status.slice(1);
  const className =
    status === 'strong'
      ? 'border-success/40 bg-green-500/10 text-success'
      : status === 'ready'
      ? 'border-accent/40 bg-sky-500/10 text-accent'
      : status === 'weak'
      ? 'border-danger/40 bg-red-500/10 text-danger'
      : 'border-warning/40 bg-amber-500/10 text-warning';
  return { label, className, score };
}

function SlideshowCard({ slideshow, selected, onToggleSelect, onApprove, onReject, onEdit, onRewrite, onQuality, onSafeFix }: CardProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const quality = scoreLabel(slideshow);
  const displayHashtags = normalizeHashtags(slideshow.hashtags);
  return (
    <div className={`self-start bg-surface border rounded-xl p-4 fade-up shadow-main transition-all hover:border-line-2 ${selected ? 'border-accent ring-1 ring-accent' : 'border-line'}`}>
      {/* Slide strip */}
      <div className="relative">
        <label className="absolute top-1.5 left-1.5 z-10 w-7 h-7 rounded-lg bg-[#1b1b1b]/95 border border-line flex items-center justify-center cursor-pointer shadow-main">
          <input type="checkbox" checked={selected} onChange={onToggleSelect} className="cursor-pointer" />
        </label>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(58px,1fr))] gap-1.5">
          {slideshow.slides.map((slide, i) => (
            <SlidePreview
              key={slide.id}
              slide={slide}
              className="rounded-md shadow-none"
              format={slideshow.format}
              notesData={slideshow.notesData}
              slideIndex={i}
            />
          ))}
        </div>
      </div>

      {/* Meta */}
      <div className="mt-4">
        <h3 className="text-[15px] font-semibold text-ink leading-snug mb-1.5">
          {slideshow.hook}
        </h3>
        {slideshow.format === 'notes' && (
          <span className="inline-flex mb-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-accent/40 bg-sky-500/10 text-accent uppercase tracking-wide">
            Notes carousel
          </span>
        )}
        <p className="text-[12px] text-ink-5 leading-relaxed line-clamp-2">
          {slideshow.caption}
        </p>

        <div className="flex flex-wrap gap-1 mt-2">
          {displayHashtags.map((tag) => (
            <span key={tag} className="text-[10px] text-ink-5 px-1.5 py-0.5 rounded-md bg-control border border-line">
              #{tag}
            </span>
          ))}
        </div>

        <QualityReport report={slideshow.qualityReport} onRecheck={onQuality} onFix={onSafeFix} />

        {quality && !slideshow.qualityReport && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setFeedbackOpen((open) => !open)}
              className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-lg border text-[11px] font-medium ${quality.className}`}
            >
              {quality.score !== undefined ? `${quality.score}/10` : 'Score'} {quality.label}
              <ChevronDown size={12} className={feedbackOpen ? 'rotate-180' : ''} />
            </button>
            {feedbackOpen && (
              <div className="mt-2 rounded-lg border border-line bg-[#101010] p-3">
                <p className="text-[12px] text-ink-4 leading-relaxed">
                  {slideshow.qualityFeedback || 'No feedback stored for this post.'}
                </p>
                {slideshow.rewriteAttempts !== undefined && (
                  <p className="text-[10px] text-ink-6 mt-2">Rewrite attempts: {slideshow.rewriteAttempts}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 mt-4 pt-3 border-t border-line">
          <Button variant="secondary" icon={<Pencil size={13} />} onClick={onEdit}>
            Edit
          </Button>
          <Button variant="secondary" icon={<Wand2 size={13} />} onClick={onRewrite}>
            Rewrite
          </Button>
          <Button
            variant="primary"
            icon={<Check size={13} />}
            onClick={onApprove}
            fullWidth
            disabled={slideshow.qualityReport?.status === 'blocked'}
            title={slideshow.qualityReport?.status === 'blocked' ? 'Resolve blocking Quality Gate findings first.' : undefined}
          >
            Approve
          </Button>
          <IconButton
            variant="secondary"
            icon={<X size={13} />}
            label="Reject"
            onClick={onReject}
          />
        </div>
      </div>
    </div>
  );
}
