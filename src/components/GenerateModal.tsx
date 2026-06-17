import { useEffect, useState } from 'react';
import { X, Loader2, Sparkles } from 'lucide-react';
import { Button } from './Button';
import { PackPicker } from './PackPicker';
import { getLibraryFolders } from '../lib/api';
import type { GenerateOptions } from '../lib/api';
import type { LibraryFolder } from '../types';

interface GenerateModalProps {
  defaultPacks: string[];
  generating: boolean;
  error?: string | null;
  onClose: () => void;
  onGenerate: (count: number, options: GenerateOptions) => void;
}

const COUNT_OPTIONS = [1, 3, 5, 10];

export function GenerateModal({ defaultPacks, generating, error, onClose, onGenerate }: GenerateModalProps) {
  const [count, setCount] = useState(3);
  const [postFormat, setPostFormat] = useState<'standard' | 'notes'>('standard');
  const [packs, setPacks] = useState<string[]>(defaultPacks);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [useTrends, setUseTrends] = useState(false);
  const [useLearning, setUseLearning] = useState(false);
  const [qualityMode, setQualityMode] = useState<'off' | 'normal' | 'strict'>('off');
  const [minScore, setMinScore] = useState(7);
  const [maxRewriteAttempts, setMaxRewriteAttempts] = useState(1);
  const [contentBucket, setContentBucket] = useState('');
  const [ctaKeyword, setCtaKeyword] = useState('');
  const [topicMode, setTopicMode] = useState<'general' | 'custom'>('general');
  const [topic, setTopic] = useState('');
  const [topicError, setTopicError] = useState<string | null>(null);

  useEffect(() => {
    getLibraryFolders().then(setFolders).catch(() => setFolders([]));
  }, []);

  const toggleFolder = (id: string) =>
    setFolderIds((current) => (current.includes(id) ? current.filter((folderId) => folderId !== id) : [...current, id]));

  const submit = () => {
    const cleanTopic = topic.trim();
    if (topicMode === 'custom' && !cleanTopic) {
      setTopicError('Enter a topic, or switch back to General.');
      return;
    }
    setTopicError(null);
    onGenerate(count, {
      postFormat,
      packs,
      folderIds,
      useTrends,
      useLearning,
      qualityMode,
      minScore,
      maxRewriteAttempts,
      contentBucket: contentBucket.trim() || undefined,
      ctaKeyword: ctaKeyword.trim() || undefined,
      topicMode,
      topic: topicMode === 'custom' ? cleanTopic : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4" onClick={generating ? undefined : onClose}>
      <div className="bg-surface border border-line rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-main fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-raised border border-line flex items-center justify-center text-accent">
              <Sparkles size={15} />
            </span>
            Generate slideshows
          </h2>
          {!generating && <button onClick={onClose} className="w-8 h-8 rounded-lg text-ink-5 hover:text-ink hover:bg-white/[0.055] flex items-center justify-center"><X size={18} /></button>}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Count */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">How many?</label>
            <div className="flex items-center gap-2">
              {COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  disabled={generating}
                  className={`w-12 h-9 rounded-lg border text-[13px] font-medium transition-colors disabled:opacity-50 ${
                    count === n ? 'border-accent bg-accent text-bg' : 'border-line bg-raised text-ink-5 hover:border-line-2 hover:text-ink'
                  }`}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={100}
                value={count}
                disabled={generating}
                onChange={(e) => setCount(Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))))}
                className="flex-1 h-9 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink text-center tabular-nums outline-none focus:border-line-2 disabled:opacity-50"
              />
            </div>
            <p className="text-[11px] text-ink-6 mt-1">1–100. Large batches take a while — they generate in chunks.</p>
          </div>

          {/* Packs */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Background packs</label>
            <PackPicker selected={packs} onChange={setPacks} disabled={generating} />
          </div>

          {/* Format */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Format</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPostFormat('standard')}
                disabled={generating}
                className={`h-10 rounded-lg border text-[12px] font-medium transition-colors disabled:opacity-50 ${
                  postFormat === 'standard'
                    ? 'border-accent bg-accent text-bg'
                    : 'border-line bg-raised text-ink-5 hover:border-line-2 hover:text-ink'
                }`}
              >
                Standard carousel
              </button>
              <button
                type="button"
                onClick={() => setPostFormat('notes')}
                disabled={generating}
                className={`h-10 rounded-lg border text-[12px] font-medium transition-colors disabled:opacity-50 ${
                  postFormat === 'notes'
                    ? 'border-accent bg-accent text-bg'
                    : 'border-line bg-raised text-ink-5 hover:border-line-2 hover:text-ink'
                }`}
              >
                Notes-style
              </button>
            </div>
            {postFormat === 'notes' && (
              <p className="text-[11px] text-ink-6 mt-1">
                Creates a 2-slide lifestyle hook + iPhone Notes carousel.
              </p>
            )}
          </div>

          {/* Topic */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Topic</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTopicMode('general');
                  setTopicError(null);
                }}
                disabled={generating}
                className={`h-10 rounded-lg border text-[12px] font-medium transition-colors disabled:opacity-50 ${
                  topicMode === 'general'
                    ? 'border-accent bg-accent text-bg'
                    : 'border-line bg-raised text-ink-5 hover:border-line-2 hover:text-ink'
                }`}
              >
                General
              </button>
              <button
                type="button"
                onClick={() => setTopicMode('custom')}
                disabled={generating}
                className={`h-10 rounded-lg border text-[12px] font-medium transition-colors disabled:opacity-50 ${
                  topicMode === 'custom'
                    ? 'border-accent bg-accent text-bg'
                    : 'border-line bg-raised text-ink-5 hover:border-line-2 hover:text-ink'
                }`}
              >
                Custom topic
              </button>
            </div>
            {topicMode === 'custom' ? (
              <input
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  if (topicError) setTopicError(null);
                }}
                placeholder="What should these posts be about?"
                disabled={generating}
                className="mt-2 w-full h-9 bg-raised border border-line rounded-lg px-3 text-[12px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2 disabled:opacity-50"
              />
            ) : (
              <p className="text-[11px] text-ink-6 mt-1">
                Uses the Brain, trends, learning, and buckets to pick what is most likely to perform.
              </p>
            )}
            {topicError && <p className="text-[11px] text-danger mt-1">{topicError}</p>}
          </div>

          {/* Growth settings */}
          <div className="rounded-xl border border-line bg-[#101010] p-3 space-y-3">
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold block">Growth options</label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 text-[12px] text-ink-4">
                <input
                  type="checkbox"
                  checked={useTrends}
                  onChange={(e) => setUseTrends(e.target.checked)}
                  disabled={generating}
                />
                Use stored trends
              </label>
              <label className="flex items-center gap-2 text-[12px] text-ink-4">
                <input
                  type="checkbox"
                  checked={useLearning}
                  onChange={(e) => setUseLearning(e.target.checked)}
                  disabled={generating}
                />
                Use learning
              </label>
            </div>

            <div>
              <label className="text-[10px] text-ink-6 uppercase tracking-wider mb-1 block">Quality mode</label>
              <select
                value={qualityMode}
                onChange={(e) => setQualityMode(e.target.value as 'off' | 'normal' | 'strict')}
                disabled={generating}
                className="w-full h-9 bg-raised border border-line rounded-lg px-3 text-[12px] text-ink outline-none focus:border-line-2 disabled:opacity-50"
              >
                <option value="off">Off</option>
                <option value="normal">Normal - include weak posts as Needs review</option>
                <option value="strict">Strict - drop posts below threshold</option>
              </select>
            </div>

            {qualityMode !== 'off' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-ink-6 uppercase tracking-wider mb-1 block">Minimum score</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={minScore}
                    onChange={(e) => setMinScore(Number(e.target.value))}
                    onBlur={() => setMinScore((s) => Math.min(Math.max(s || 1, 1), 10))}
                    disabled={generating}
                    className="w-full h-9 bg-raised border border-line rounded-lg px-3 text-[12px] text-ink outline-none focus:border-line-2 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-ink-6 uppercase tracking-wider mb-1 block">Rewrite attempts</label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={maxRewriteAttempts}
                    onChange={(e) => setMaxRewriteAttempts(Number(e.target.value))}
                    onBlur={() => setMaxRewriteAttempts((a) => Math.min(Math.max(a || 0, 0), 5))}
                    disabled={generating}
                    className="w-full h-9 bg-raised border border-line rounded-lg px-3 text-[12px] text-ink outline-none focus:border-line-2 disabled:opacity-50"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <input
                value={contentBucket}
                onChange={(e) => setContentBucket(e.target.value)}
                placeholder="Bucket, e.g. mistakes"
                disabled={generating}
                className="w-full h-9 bg-raised border border-line rounded-lg px-3 text-[12px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2 disabled:opacity-50"
              />
              <input
                value={ctaKeyword}
                onChange={(e) => setCtaKeyword(e.target.value)}
                placeholder="CTA, e.g. save"
                disabled={generating}
                className="w-full h-9 bg-raised border border-line rounded-lg px-3 text-[12px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2 disabled:opacity-50"
              />
            </div>
          </div>

          {!!folders.length && (
            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Background folders</label>
              <div className="flex flex-wrap gap-1.5">
                {folders
                  .filter((folder) => folder.id !== 'folder:bundled' && folder.type !== 'video')
                  .slice(0, 10)
                  .map((folder) => {
                    const on = folderIds.includes(folder.id);
                    return (
                      <button
                        type="button"
                        key={folder.id}
                        onClick={() => toggleFolder(folder.id)}
                        disabled={generating}
                        className={`h-8 rounded-lg border px-2.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                          on ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-raised text-ink-5 hover:border-line-2 hover:text-ink'
                        }`}
                      >
                        {folder.name}
                      </button>
                    );
                  })}
              </div>
              <p className="text-[11px] text-ink-6 mt-1">Optional. Selected folders are added to the background pool.</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-line bg-[#101010] space-y-3">
          {error && !generating && (
            <p className="text-[12px] text-danger leading-snug">{error}</p>
          )}
          <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={generating}>Cancel</Button>
          <Button
            variant="primary"
            icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            onClick={submit}
            disabled={generating}
          >
            {generating ? 'Generating…' : `Generate ${count}`}
          </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
