import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Trash2, Shuffle, Image as ImageIcon } from 'lucide-react';
import type { Slideshow, Slide, LibraryImage, NotesData } from '../types';
import { Button } from './Button';
import { PostPreviewStage } from './PostPreviewModal';
import { getLibrary } from '../lib/api';
import { normalizeHashtags } from '../lib/hashtags';

interface SlideshowEditorModalProps {
  slideshow: Slideshow;
  onClose: () => void;
  onSave: (patch: { slides: Slide[]; caption: string; hashtags: string[]; hook?: string; notesData?: NotesData; format?: Slideshow['format'] }) => Promise<void>;
}

type Tab = 'post' | 'slide';

function defaultNotesData(slideshow: Slideshow): NotesData {
  return slideshow.notesData || {
    hookText: slideshow.hook || slideshow.slides[0]?.text || '',
    noteTitle: 'quick notes',
    noteDate: 'today',
    points: [
      { heading: 'start with the hook', body: 'make people curious before explaining the takeaway.' },
      { heading: 'keep it skimmable', body: 'use short points that feel easy to save and revisit.' },
      { heading: 'make it useful', body: 'give them one thing they can try today.' },
    ],
  };
}

export function SlideshowEditorModal({ slideshow, onClose, onSave }: SlideshowEditorModalProps) {
  const [slides, setSlides] = useState<Slide[]>(slideshow.slides.map((s) => ({ ...s })));
  const isNotes = slideshow.format === 'notes';
  const [notesData, setNotesData] = useState<NotesData>(() => defaultNotesData(slideshow));
  const [caption, setCaption] = useState(slideshow.caption);
  const [hashtags, setHashtags] = useState(slideshow.hashtags.join(' '));
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<Tab>('post');
  const [library, setLibrary] = useState<LibraryImage[] | null>(null);
  const [pack, setPack] = useState('all');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getLibrary().then(setLibrary).catch(() => setLibrary([]));
  }, []);

  const packs = useMemo(
    () => ['all', ...Array.from(new Set((library || []).map((i) => i.pack)))],
    [library]
  );
  const filtered = useMemo(
    () => (library || []).filter((i) => pack === 'all' || i.pack === pack),
    [library, pack]
  );

  const total = slides.length;
  const current = slides[index];

  const patchSlide = (patch: Partial<Slide>) =>
    setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const patchNotes = (patch: Partial<NotesData>) =>
    setNotesData((prev) => ({ ...prev, ...patch }));

  const patchPoint = (pointIndex: number, patch: Partial<NotesData['points'][number]>) =>
    setNotesData((prev) => ({
      ...prev,
      points: prev.points.map((point, i) => (i === pointIndex ? { ...point, ...patch } : point)),
    }));

  const removePoint = (pointIndex: number) =>
    setNotesData((prev) => ({
      ...prev,
      points: prev.points.length <= 1 ? prev.points : prev.points.filter((_, i) => i !== pointIndex),
    }));

  const addPoint = () =>
    setNotesData((prev) => ({
      ...prev,
      points: [...prev.points, { heading: 'new point', body: 'short casual explanation.' }].slice(0, 5),
    }));

  const shuffleBackgrounds = () => {
    const pool = filtered;
    if (!pool.length) return;
    setSlides((prev) => prev.map((s) => {
      const asset = pool[Math.floor(Math.random() * pool.length)];
      return {
        ...s,
        imageUrl: asset.url,
        imageAssetId: asset.id,
        imageFolderId: asset.folderId,
        imageUnavailable: false,
      };
    }));
  };

  const deleteSlide = () => {
    if (total <= 1) return;
    setSlides((prev) => prev.filter((_, i) => i !== index));
    setIndex((i) => Math.max(0, Math.min(i, total - 2)));
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        slides,
        caption,
        hashtags: normalizeHashtags(hashtags, { max: 20, includeFyp: false }),
        hook: isNotes ? notesData.hookText : undefined,
        notesData: isNotes ? notesData : undefined,
        format: slideshow.format,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop !p-2 sm:!p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit slideshow"
        className="modal-shell fade-up flex h-[96vh] max-h-[96vh] w-[96vw] max-w-[1400px] flex-col sm:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Preview */}
        <PostPreviewStage slideshow={{ ...slideshow, slides, notesData }} index={index} onIndexChange={setIndex} />

        {/* Editor panel */}
        <div className="w-full sm:w-96 flex flex-col border-t sm:border-t-0 sm:border-l border-line min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <div className="flex gap-1">
              {(['post', 'slide'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                    tab === t ? 'bg-raised text-ink shadow-main' : 'text-ink-5 hover:text-ink-3 hover:bg-white/[0.055]'
                  }`}
                >
                  {t === 'post' ? 'Post' : `Slide ${index + 1}`}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg text-ink-5 hover:text-ink hover:bg-white/[0.055] flex items-center justify-center">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {tab === 'post' ? (
              <>
                <div>
                  <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">Caption</label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={5}
                    className="w-full bg-raised border border-line rounded-lg px-3 py-2 text-[13px] text-ink resize-none outline-none focus:border-line-2"
                  />
                  <span className="text-[10px] text-ink-6">{caption.length} chars</span>
                </div>
                <div>
                  <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">Hashtags</label>
                  <input
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                    placeholder="#aitools #aiprompts #contentcreator"
                    className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-line-2"
                  />
                  <span className="text-[10px] text-ink-6">Space or comma separated. # is fine; tags are cleaned on save.</span>
                </div>
              </>
            ) : (
              <>
                {isNotes && index === 1 ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">Note title</label>
                      <input
                        value={notesData.noteTitle || ''}
                        onChange={(e) => patchNotes({ noteTitle: e.target.value })}
                        placeholder="quick notes"
                        className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-line-2"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">Note date</label>
                      <input
                        value={notesData.noteDate || ''}
                        onChange={(e) => patchNotes({ noteDate: e.target.value })}
                        placeholder="today, 9:41 am"
                        className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-line-2"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold">Points</label>
                        {notesData.points.length < 5 && (
                          <button onClick={addPoint} className="text-[11px] text-accent hover:text-ink">
                            Add point
                          </button>
                        )}
                      </div>
                      {notesData.points.map((point, pointIndex) => (
                        <div key={pointIndex} className="rounded-lg border border-line bg-[#101010] p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-ink-6 uppercase tracking-widest">Point {pointIndex + 1}</span>
                            {notesData.points.length > 1 && (
                              <button onClick={() => removePoint(pointIndex)} className="text-[10px] text-ink-6 hover:text-danger flex items-center gap-1">
                                <Trash2 size={11} /> Remove
                              </button>
                            )}
                          </div>
                          <input
                            value={point.heading}
                            onChange={(e) => patchPoint(pointIndex, { heading: e.target.value })}
                            placeholder="short heading"
                            className="w-full h-9 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-line-2"
                          />
                          <textarea
                            value={point.body}
                            onChange={(e) => patchPoint(pointIndex, { body: e.target.value })}
                            rows={2}
                            placeholder="short casual explanation"
                            className="w-full bg-raised border border-line rounded-lg px-3 py-2 text-[13px] text-ink resize-none outline-none focus:border-line-2"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold">
                        {isNotes ? 'Hook text' : `Slide ${index + 1} text`}
                      </label>
                      {!isNotes && total > 1 && (
                        <button onClick={deleteSlide} className="text-[10px] text-ink-6 hover:text-danger flex items-center gap-1">
                          <Trash2 size={11} /> Delete slide
                        </button>
                      )}
                    </div>
                    <textarea
                      value={isNotes ? notesData.hookText : current.text}
                      onChange={(e) => {
                        if (isNotes) {
                          patchNotes({ hookText: e.target.value });
                          patchSlide({ text: e.target.value });
                        } else {
                          patchSlide({ text: e.target.value });
                        }
                      }}
                      rows={3}
                      className="w-full bg-raised border border-line rounded-lg px-3 py-2 text-[13px] text-ink resize-none outline-none focus:border-line-2"
                    />
                  </div>
                )}

                {(!isNotes || index === 0) && (
                <div>
                  <div className="grid grid-cols-[auto_1fr] items-center gap-3 mb-1.5">
                    <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold">Background</label>
                    <div className="min-w-0">
                      <select
                        value={pack}
                        onChange={(e) => setPack(e.target.value)}
                        className="h-8 w-full min-w-0 bg-raised border border-line rounded-md px-1.5 text-[11px] text-ink outline-none"
                      >
                        {packs.map((p) => (
                          <option key={p} value={p}>{p === 'all' ? 'All packs' : p}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Button variant="ghost" size="sm" icon={<ImageIcon size={12} />} onClick={() => patchSlide({ imageUrl: undefined, imageAssetId: undefined, imageFolderId: undefined, imageUnavailable: false })}>
                      Gradient
                    </Button>
                    <Button variant="ghost" size="sm" icon={<Shuffle size={12} />} onClick={shuffleBackgrounds}>
                      Shuffle all
                    </Button>
                  </div>
                  {library === null ? (
                    <div className="flex items-center justify-center py-6 text-ink-5 text-[12px] gap-2">
                      <Loader2 size={13} className="animate-spin" /> Loading…
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5 max-h-64 overflow-y-auto">
                      {filtered.map((img) => (
                        <button
                          key={img.id}
                          onClick={() => patchSlide({ imageUrl: img.url, imageAssetId: img.id, imageFolderId: img.folderId, imageUnavailable: false })}
                          className={`aspect-[9/16] rounded-md overflow-hidden bg-raised transition-all ${
                            current.imageUrl === img.url ? 'ring-2 ring-accent' : 'hover:ring-2 hover:ring-line-2'
                          }`}
                        >
                          <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button
              variant="primary"
              icon={saving ? <Loader2 size={13} className="animate-spin" /> : undefined}
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
