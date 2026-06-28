import { useEffect, useState } from 'react';
import { X, Loader2, CalendarClock, Info, CheckCircle2, ExternalLink, Film } from 'lucide-react';
import type { QualityReport as QualityReportType, Slideshow, SocialAccount, VideoAsset } from '../types';
import { getScheduledPosts, getVideos } from '../lib/api';
import { Button } from './Button';
import { SlidePreview } from './SlidePreview';
import { QualityReport } from './QualityReport';

// Default gap after the last thing already scheduled (or after now, if nothing
// is queued) so the user isn't forced to pick a time from a blank field.
const DEFAULT_GAP_HOURS = 3;

// post-bridge dashboard — where the user reviews what we just sent over.
const PB_SCHEDULED_URL = 'https://www.post-bridge.com/dashboard/posts/scheduled';
const PB_DRAFTS_URL = 'https://www.post-bridge.com/dashboard/posts/drafts';

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ScheduleModalProps {
  slideshow: Slideshow;
  accounts: SocialAccount[];
  defaults: { socialAccountIds: number[]; mode: 'draft' | 'schedule' };
  onClose: () => void;
  onConfirm: (opts: {
    format: 'carousel' | 'video';
    socialAccounts: number[];
    mode: 'draft' | 'schedule';
    scheduledAt: string | null;
    videoId?: string;
    duration?: number;
    textPosition?: 'center' | 'top';
    watermark?: boolean;
    timezone?: string;
    warningsAcknowledged?: boolean;
  }) => Promise<void>;
}

export function ScheduleModal({ slideshow, accounts, defaults, onClose, onConfirm }: ScheduleModalProps) {
  const [selected, setSelected] = useState<number[]>(defaults.socialAccountIds);
  const [mode, setMode] = useState<'draft' | 'schedule'>(defaults.mode);
  const [format, setFormat] = useState<'carousel' | 'video'>('carousel');
  const [videos, setVideos] = useState<VideoAsset[] | null>(null);
  const [videoId, setVideoId] = useState('');
  const [duration, setDuration] = useState(12);
  const [textPosition, setTextPosition] = useState<'center' | 'top'>('center');
  const [watermark, setWatermark] = useState(true);
  const [videoLoadError, setVideoLoadError] = useState<string | null>(null);
  // Seed with now + gap immediately so the field is never blank; refine to
  // "after the last scheduled post" once post-bridge responds.
  const [when, setWhen] = useState(() =>
    toLocalInput(new Date(Date.now() + DEFAULT_GAP_HOURS * 3600_000))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which mode succeeded, or null while still on the form. Drives the success screen.
  const [doneMode, setDoneMode] = useState<'draft' | 'schedule' | null>(null);
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);
  const [gateReport, setGateReport] = useState<QualityReportType | null>(slideshow.qualityReport || null);

  useEffect(() => {
    getScheduledPosts()
      .then((posts) => {
        const future = posts
          .map((p) => (p.scheduledAt ? new Date(p.scheduledAt).getTime() : 0))
          .filter((t) => t > Date.now());
        const base = future.length ? Math.max(...future) : Date.now();
        setWhen(toLocalInput(new Date(base + DEFAULT_GAP_HOURS * 3600_000)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getVideos()
      .then((items) => {
        setVideos(items);
        setVideoId((current) => current || items[0]?.id || '');
      })
      .catch((e) => {
        setVideos([]);
        setVideoLoadError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  const toggle = (id: number) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const confirm = async () => {
    setError(null);
    if (gateReport?.status === 'blocked') return setError('Resolve the blocking Quality Gate findings before publishing.');
    if (gateReport?.status === 'warnings' && !warningsAcknowledged) return setError('Review and acknowledge the Quality Gate warnings first.');
    if (!selected.length) return setError('Pick at least one account.');
    if (mode === 'schedule' && !when) return setError('Pick a date & time, or save as a draft.');
    if (format === 'video' && !videoId) {
      return setError(videoLoadError || 'Add or select a background video in Library first.');
    }
    setBusy(true);
    try {
      await onConfirm({
        format,
        socialAccounts: selected,
        mode,
        scheduledAt: mode === 'schedule' ? new Date(when).toISOString() : null,
        videoId: format === 'video' ? videoId : undefined,
        duration,
        textPosition,
        watermark,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        warningsAcknowledged,
      });
      setBusy(false);
      setDoneMode(mode); // show the success screen instead of closing
    } catch (e) {
      const report = (e as Error & { qualityReport?: QualityReportType }).qualityReport;
      if (report) setGateReport(report);
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (doneMode) {
    const scheduled = doneMode === 'schedule';
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scheduling complete"
          className="modal-shell fade-up w-full max-w-sm p-6 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <CheckCircle2 size={32} className="text-success mx-auto" />
          <h2 className="text-[16px] font-semibold text-ink mt-3">
            {scheduled ? 'Scheduled' : 'Saved as draft'}
          </h2>
          <p className="text-[13px] text-ink-5 mt-1.5 leading-snug">
            {scheduled
              ? 'post-bridge will publish it at the time you picked.'
              : 'It’s waiting in your post-bridge drafts to post by hand.'}
          </p>
          <div className="flex flex-col gap-2 mt-5">
            <a
              href={scheduled ? PB_SCHEDULED_URL : PB_DRAFTS_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 h-9 rounded-lg bg-ink text-bg text-[13px] font-medium shadow-main hover:opacity-90"
            >
              View on post-bridge <ExternalLink size={13} />
            </a>
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Schedule post"
        className="modal-shell fade-up max-h-[90vh] w-full max-w-lg overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold text-ink">Schedule slideshow</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-ink-5 hover:text-ink hover:bg-white/[0.055] flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Preview */}
          <div>
            <div className="grid grid-cols-6 gap-1.5">
              {slideshow.slides.map((s, i) => (
                <SlidePreview
                  key={s.id}
                  slide={s}
                  format={slideshow.format}
                  notesData={slideshow.notesData}
                  slideIndex={i}
                />
              ))}
            </div>
            <p className="text-[12px] text-ink-4 mt-2 line-clamp-2">{slideshow.caption}</p>
            <QualityReport report={gateReport} />
            {gateReport?.status === 'warnings' && (
              <label className="mt-3 flex items-start gap-2 rounded-lg border border-warning/25 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-ink-3">
                <input type="checkbox" checked={warningsAcknowledged} onChange={(event) => setWarningsAcknowledged(event.target.checked)} className="mt-0.5" />
                I reviewed the Quality Gate warnings and want to continue.
              </label>
            )}
          </div>

          {/* Format */}
          <div>
            <label className="text-[11px] text-ink-5 mb-1.5 block uppercase tracking-widest font-semibold">
              Format
            </label>
            <div className="flex gap-2">
              <Button variant={format === 'carousel' ? 'primary' : 'secondary'} onClick={() => setFormat('carousel')}>
                Carousel
              </Button>
              <Button
                variant={format === 'video' ? 'primary' : 'secondary'}
                icon={<Film size={13} />}
                onClick={() => setFormat('video')}
              >
                Video
              </Button>
            </div>

            {format === 'video' && (
              <div className="mt-3 rounded-lg border border-line bg-[#101010] p-3 space-y-3">
                <div>
                  <label className="text-[10px] text-ink-6 uppercase tracking-wider mb-1 block">
                    Background video
                  </label>
                  {videos === null ? (
                    <div className="flex items-center gap-2 text-[12px] text-ink-5">
                      <Loader2 size={13} className="animate-spin text-accent" /> Loading videos...
                    </div>
                  ) : videos.length === 0 ? (
                    <p className="text-[12px] text-ink-5">
                      Add a background video in Library before scheduling as video.
                    </p>
                  ) : (
                    <select
                      value={videoId}
                      onChange={(e) => setVideoId(e.target.value)}
                      className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-line-2"
                    >
                      {videos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.pack} - {v.source}{v.duration ? ` (${Math.round(v.duration)}s)` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-ink-6 uppercase tracking-wider mb-1 block">
                      Duration
                    </label>
                    <input
                      type="number"
                      min={8}
                      max={15}
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      onBlur={() => setDuration((d) => Math.min(Math.max(d || 8, 8), 15))}
                      className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-line-2"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-6 uppercase tracking-wider mb-1 block">
                      Text
                    </label>
                    <select
                      value={textPosition}
                      onChange={(e) => setTextPosition(e.target.value === 'top' ? 'top' : 'center')}
                      className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-line-2"
                    >
                      <option value="center">Centered</option>
                      <option value="top">Top centered</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-[12px] text-ink-4">
                  <input
                    type="checkbox"
                    checked={watermark}
                    onChange={(e) => setWatermark(e.target.checked)}
                  />
                  Add neutral watermark
                </label>
              </div>
            )}
          </div>

          {/* Accounts */}
          <div>
            <label className="text-[11px] text-ink-5 mb-1.5 block uppercase tracking-widest font-semibold">
              Post to
            </label>
            {accounts.length === 0 ? (
              <p className="text-[12px] text-ink-5">
                No connected accounts. Add your post-bridge key in Settings and connect accounts at{' '}
                <a
                href="https://post-bridge.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline decoration-white/20 hover:text-ink"
                >
                  post-bridge.com
                </a>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {accounts.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-line bg-raised cursor-pointer hover:border-line-2"
                  >
                    <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
                    <span className="text-[13px] text-ink font-medium">{a.username}</span>
                    <span className="text-[11px] text-ink-5 uppercase tracking-wide">{a.platform}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Mode */}
          <div>
            <label className="text-[11px] text-ink-5 mb-1.5 block uppercase tracking-widest font-semibold">
              When
            </label>
            <div className="flex gap-2 mb-2">
              <Button variant={mode === 'draft' ? 'primary' : 'secondary'} onClick={() => setMode('draft')}>
                Save as draft
              </Button>
              <Button variant={mode === 'schedule' ? 'primary' : 'secondary'} onClick={() => setMode('schedule')}>
                Schedule
              </Button>
            </div>
            {mode === 'schedule' && (
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-line-2"
              />
            )}

            <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-[#101010] border border-line">
              <Info size={13} className="text-accent mt-0.5 shrink-0" />
              <p className="text-[11px] text-ink-4 leading-snug">
                {mode === 'draft' ? (
                  <>
                    Saves to your post-bridge inbox to post by hand. No analytics come back on
                    drafts (TikTok only reports content it posts itself) — but posting manually
                    avoids automation detection, so reach potential is often higher.
                  </>
                ) : (
                  <>post-bridge publishes this automatically at the chosen time and reports its analytics back to Results.</>
                )}
              </p>
            </div>
          </div>

          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={busy ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
            onClick={confirm}
            disabled={busy || gateReport?.status === 'blocked'}
            aria-disabled={gateReport?.status === 'blocked'}
          >
            {busy
              ? format === 'video'
                ? 'Rendering...'
                : 'Uploading...'
              : format === 'video'
              ? mode === 'schedule'
                ? 'Schedule video'
                : 'Save video draft'
              : mode === 'schedule'
              ? 'Schedule it'
              : 'Save draft'}
          </Button>
        </div>
      </div>
    </div>
  );
}
