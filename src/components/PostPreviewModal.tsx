import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Film, X } from 'lucide-react';
import type { Slideshow, VideoAsset } from '../types';
import { captionTextStyle, SIDE_PAD_PCT, SLIDE_CONTAINER_STYLE } from '../lib/captionStyle';
import { clampPreviewIndex, navigatePreview } from '../lib/postPreview';
import { normalizeHashtags } from '../lib/hashtags';
import { SlidePreview } from './SlidePreview';

interface PreviewStageProps {
  slideshow: Slideshow;
  index: number;
  onIndexChange: (index: number) => void;
  video?: VideoAsset | null;
  thumbnails?: boolean;
}

const VIDEO_PREVIEW_SECONDS = 12;

export function PostPreviewStage({ slideshow, index, onIndexChange, video, thumbnails = false }: PreviewStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const slides = slideshow.slides || [];
  const total = slides.length;
  const current = slides[clampPreviewIndex(index, total)];

  useEffect(() => {
    const element = videoRef.current;
    return () => {
      if (!element) return;
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, [video?.url]);

  const select = (next: number) => {
    const safe = clampPreviewIndex(next, total);
    onIndexChange(safe);
    if (videoRef.current && total > 0) videoRef.current.currentTime = safe * VIDEO_PREVIEW_SECONDS / total;
  };

  return (
    <div className="sm:flex-1 bg-[#101010] flex flex-col items-center justify-center p-6 gap-3 min-w-0">
      <div className="h-[calc(96vh-8.5rem)] max-h-[860px] max-w-full aspect-[9/16]">
        {video ? (
          <div data-testid="post-video-preview" className="relative h-full w-full aspect-[9/16] overflow-hidden rounded-lg border border-white/10 bg-black shadow-main" style={SLIDE_CONTAINER_STYLE}>
            <video
              ref={videoRef}
              src={video.url}
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full object-cover"
              onTimeUpdate={(event) => {
                if (!total) return;
                const elapsed = event.currentTarget.currentTime % VIDEO_PREVIEW_SECONDS;
                const next = clampPreviewIndex(Math.floor(elapsed / (VIDEO_PREVIEW_SECONDS / total)), total);
                if (next !== index) onIndexChange(next);
              }}
            />
            <div className="pointer-events-none absolute inset-0 bg-black/20" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ paddingLeft: `${SIDE_PAD_PCT}%`, paddingRight: `${SIDE_PAD_PCT}%` }}>
              <span style={{ ...captionTextStyle(), fontSize: '3.85cqh' }}>{current?.text || slideshow.hook}</span>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-[5.5%] text-center text-[1.8cqh] font-semibold text-white/70 [text-shadow:0_1px_2px_#000]">Zara Tech</div>
          </div>
        ) : current ? (
          <SlidePreview slide={current} className="w-full h-full" format={slideshow.format} notesData={slideshow.notesData} slideIndex={index} />
        ) : null}
      </div>

      <div className="flex max-w-full items-center gap-3">
        <button type="button" aria-label="Previous slide" onClick={() => select(navigatePreview(index, -1, total))} disabled={index === 0} className="w-9 h-9 rounded-lg bg-control border border-line text-ink-4 shadow-main hover:text-ink disabled:opacity-30 flex items-center justify-center">
          <ChevronLeft size={16} />
        </button>
        {thumbnails ? (
          <div className="flex max-w-[min(56vw,30rem)] gap-1.5 overflow-x-auto py-1" aria-label="Slide thumbnails">
            {slides.map((slide, itemIndex) => (
              <button key={slide.id} type="button" aria-label={`Show slide ${itemIndex + 1}`} aria-current={itemIndex === index ? 'true' : undefined} onClick={() => select(itemIndex)} className={`w-10 shrink-0 overflow-hidden rounded-md transition-all ${itemIndex === index ? 'ring-2 ring-accent' : 'opacity-65 hover:opacity-100'}`}>
                <SlidePreview slide={slide} format={slideshow.format} notesData={slideshow.notesData} slideIndex={itemIndex} showText={false} className="w-full rounded-md shadow-none" />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-1.5">
            {slides.map((slide, itemIndex) => (
              <button key={slide.id} type="button" onClick={() => select(itemIndex)} className={`h-1.5 rounded-full transition-all ${itemIndex === index ? 'w-5 bg-accent' : 'w-1.5 bg-line-2'}`} aria-label={`Slide ${itemIndex + 1}`} />
            ))}
          </div>
        )}
        <button type="button" aria-label="Next slide" onClick={() => select(navigatePreview(index, 1, total))} disabled={index === total - 1} className="w-9 h-9 rounded-lg bg-control border border-line text-ink-4 shadow-main hover:text-ink disabled:opacity-30 flex items-center justify-center">
          <ChevronRight size={16} />
        </button>
      </div>
      <span aria-live="polite" className="text-[11px] text-ink-6 tabular-nums">{index + 1} / {total}</span>
    </div>
  );
}

export function PostPreviewModal({ slideshow, video, onClose, returnFocus }: { slideshow: Slideshow; video?: VideoAsset | null; onClose: () => void; returnFocus?: HTMLElement | null }) {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const hashtags = normalizeHashtags(slideshow.hashtags);
  const safeIndex = clampPreviewIndex(index, slideshow.slides.length);

  useEffect(() => {
    const dialog = dialogRef.current;
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        setIndex((current) => navigatePreview(current, event.key === 'ArrowLeft' ? -1 : 1, slideshow.slides.length));
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), video[controls], [href], [tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown, true);
      returnFocus?.focus();
    };
  }, [onClose, returnFocus, slideshow.slides.length]);

  return createPortal(
    <div data-testid="post-preview-backdrop" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="post-preview-title" className="bg-surface border border-line rounded-2xl w-[96vw] max-w-[1400px] h-[96vh] max-h-[96vh] flex flex-col sm:flex-row overflow-hidden shadow-main fade-up">
        <PostPreviewStage slideshow={slideshow} index={safeIndex} onIndexChange={setIndex} video={video} thumbnails />
        <div className="w-full sm:w-96 flex flex-col border-t sm:border-t-0 sm:border-l border-line min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <div className="min-w-0">
              <h2 id="post-preview-title" className="truncate text-[14px] font-semibold text-ink">Post preview</h2>
              <p className="mt-0.5 flex items-center gap-1 text-[10px] capitalize text-ink-6">{video && <Film size={10} />} {video ? 'Video' : slideshow.format === 'notes' ? 'Notes carousel' : slideshow.slides.length === 1 ? 'Single image' : 'Carousel'}</p>
            </div>
            <button ref={closeRef} type="button" aria-label="Close preview" onClick={onClose} className="w-8 h-8 rounded-lg text-ink-5 hover:text-ink hover:bg-white/[0.055] flex items-center justify-center"><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-ink-6">Caption</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-3">{slideshow.caption || 'No caption'}</p>
            </section>
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-ink-6">Hashtags</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">{hashtags.length ? hashtags.map((tag) => <span key={tag} className="rounded-md border border-line bg-control px-1.5 py-0.5 text-[11px] text-ink-4">#{tag}</span>) : <span className="text-[12px] text-ink-6">No hashtags</span>}</div>
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
