import { useState } from 'react';
import { X, Loader2, Sparkles } from 'lucide-react';
import { Button } from './Button';
import { PackPicker } from './PackPicker';

interface GenerateModalProps {
  defaultPacks: string[];
  generating: boolean;
  onClose: () => void;
  onGenerate: (count: number, packs: string[]) => void;
}

const COUNT_OPTIONS = [1, 3, 5, 10];

export function GenerateModal({ defaultPacks, generating, onClose, onGenerate }: GenerateModalProps) {
  const [count, setCount] = useState(3);
  const [packs, setPacks] = useState<string[]>(defaultPacks);

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
        </div>

        <div className="px-5 py-4 border-t border-line bg-[#101010] flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={generating}>Cancel</Button>
          <Button
            variant="primary"
            icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            onClick={() => onGenerate(count, packs)}
            disabled={generating}
          >
            {generating ? 'Generating…' : `Generate ${count}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
