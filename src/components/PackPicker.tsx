import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { LibraryPack } from '../types';
import { getPacks } from '../lib/api';

interface PackPickerProps {
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  layout?: 'default' | 'generation';
}

// Background-pack picker shared by Generate and Settings. Bundled packs use
// their legacy names as ids; Library packs use stable folder ids.
export function PackPicker({ selected, onChange, disabled, layout = 'default' }: PackPickerProps) {
  const [packs, setPacks] = useState<LibraryPack[] | null>(null);

  useEffect(() => {
    getPacks().then(setPacks).catch(() => setPacks([]));
  }, []);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);

  const availableIds = (packs || []).filter((pack) => pack.count > 0).map((pack) => pack.id);
  const generationLayout = layout === 'generation';
  const selectionText = selected.length ? `${selected.length} of ${availableIds.length} selected` : 'None — plain gradients';

  return (
    <div>
      <div className={generationLayout ? 'sticky top-0 z-10 -mx-1 mb-3 flex flex-wrap items-center justify-between gap-2 bg-surface px-1 pb-2' : 'mb-2 flex items-center justify-between'}>
        <div>
          {generationLayout && <h3 className="text-[12px] font-semibold text-ink">Background packs</h3>}
          <span className="text-[11px] text-ink-6">{selectionText}</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange(availableIds)} disabled={disabled} className={generationLayout ? 'h-7 rounded-md px-2 text-[11px] text-ink-5 hover:bg-white/[0.055] hover:text-ink disabled:opacity-50' : 'text-[11px] text-ink-5 hover:text-accent disabled:opacity-50'}>All</button>
          <button type="button" onClick={() => onChange([])} disabled={disabled} className={generationLayout ? 'h-7 rounded-md px-2 text-[11px] text-ink-5 hover:bg-white/[0.055] hover:text-ink disabled:opacity-50' : 'text-[11px] text-ink-5 hover:text-accent disabled:opacity-50'}>None</button>
        </div>
      </div>

      {packs === null ? (
        <div className="text-[12px] text-ink-5 py-6 text-center">Loading packs…</div>
      ) : (
        <div className={generationLayout ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(112px,1fr))]' : 'grid grid-cols-2 gap-2 sm:grid-cols-3'}>
          {packs.map((pack) => {
            const on = selected.includes(pack.id);
            const empty = pack.count === 0;
            return (
              <button
                key={pack.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(pack.id)}
                disabled={disabled || (empty && !on)}
                className={generationLayout
                  ? `relative overflow-hidden rounded-lg border text-left transition-[border-color,background-color] duration-150 motion-reduce:transition-none disabled:opacity-50 ${on ? 'border-accent bg-white/[0.035] ring-1 ring-accent' : 'border-line bg-raised hover:border-line-2'}`
                  : `relative overflow-hidden rounded-lg border text-left transition-all disabled:opacity-50 ${on ? 'border-accent ring-1 ring-accent shadow-main' : 'border-line hover:-translate-y-0.5 hover:border-line-2'}`}
              >
                <div className={`${generationLayout ? 'aspect-[16/10]' : 'aspect-[4/5]'} grid grid-cols-2 grid-rows-2 bg-raised`}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="overflow-hidden bg-raised">
                      {pack.covers[i] && (
                        <img src={pack.covers[i]} alt="" width={96} height={60} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
                {generationLayout ? (
                  <div className="min-h-[56px] border-t border-line bg-[#202020] px-2 py-1.5">
                    <div className="line-clamp-2 min-h-[28px] text-[11px] font-semibold leading-[14px] text-ink-2">{pack.name}</div>
                    <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-ink-5">
                      <span>{empty ? 'No images' : `${pack.count} images`}</span>
                      <span>{pack.source === 'library' ? 'Library' : 'Bundled'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pt-5 pb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="text-[11px] font-semibold text-white truncate leading-tight">{pack.name}</div>
                      <span className="shrink-0 rounded bg-white/15 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white/70">
                        {pack.source === 'library' ? 'Library' : 'Bundled'}
                      </span>
                    </div>
                    <div className="text-[10px] text-white/70">{empty ? 'No images' : `${pack.count} images`}</div>
                  </div>
                )}
                {on && (
                  <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-accent text-bg flex items-center justify-center shadow-main">
                    <Check size={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
