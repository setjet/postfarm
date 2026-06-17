import { useEffect, useMemo, useState } from 'react';
import { Loader2, Download, Trash2, X } from 'lucide-react';
import type { LibraryImage } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { getLibrary, scrapePinterest, deleteLibraryImage } from '../lib/api';

interface LibraryViewProps {
  hasApify: boolean;
}

export function LibraryView({ hasApify }: LibraryViewProps) {
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [searches, setSearches] = useState('');
  const [count, setCount] = useState(40);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<LibraryImage | null>(null);

  const load = () => getLibrary().then(setImages).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const scrape = async () => {
    setError(null);
    setNote(null);
    setScraping(true);
    try {
      // Pinterest searches are comma-separated phrases (each can contain spaces).
      const queries = searches.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await scrapePinterest(queries, count);
      setNote(`Added ${r.added} image${r.added === 1 ? '' : 's'} from ${r.found} found.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScraping(false);
    }
  };

  const remove = async (id: string) => setImages(await deleteLibraryImage(id));

  // Group by pack, scraped packs first.
  const groups = useMemo(() => {
    const map = new Map<string, LibraryImage[]>();
    for (const img of images || []) {
      if (!map.has(img.pack)) map.set(img.pack, []);
      map.get(img.pack)!.push(img);
    }
    return [...map.entries()];
  }, [images]);

  return (
    <>
      <ViewHeader
        title="Library"
        subtitle="Background images for your slides. Ships with curated aesthetic packs - scrape more from Pinterest with your own Apify key."
      />

      <div className="flex-1 overflow-y-auto">
        {/* Scrape bar */}
        <div className="px-4 sm:px-8 py-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-start gap-2 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <label className="text-[11px] text-ink-5 mb-1 block">Pinterest searches</label>
                <input
                  value={searches}
                  onChange={(e) => setSearches(e.target.value)}
                  placeholder="e.g. dark moody aesthetic, cozy bedroom, foggy mountain"
                  disabled={!hasApify}
                  className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2 disabled:opacity-50"
                />
              </div>
              <div className="w-24">
                <label className="text-[11px] text-ink-5 mb-1 block">Max</label>
                <input
                  type="number"
                  value={count}
                  min={10}
                  max={200}
                  onChange={(e) => setCount(Number(e.target.value))}
                  onBlur={() => setCount((c) => Math.min(Math.max(c || 10, 10), 200))}
                  disabled={!hasApify}
                  className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-line-2 disabled:opacity-50"
                />
                <span className="text-[10px] text-ink-6 mt-1 block">min 10</span>
              </div>
              <Button
                variant="primary"
                size="lg"
                className="mt-5"
                icon={scraping ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                onClick={scrape}
                disabled={!hasApify || scraping || !searches.trim()}
              >
                {scraping ? 'Scraping…' : 'Scrape Pinterest'}
              </Button>
            </div>
            {!hasApify && (
              <p className="text-[12px] text-ink-5 mt-2">
                Add your Apify API key in Settings to scrape Pinterest. The bundled packs below work without it.
              </p>
            )}
            {note && <p className="text-[12px] text-success mt-2">{note}</p>}
            {error && <p className="text-[12px] text-danger mt-2">{error}</p>}
          </div>
        </div>

        {/* Packs */}
        <div className="p-4 sm:p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {images === null ? (
              <div className="flex items-center justify-center py-16 text-ink-5 text-[13px] gap-2">
                <Loader2 size={14} className="animate-spin text-accent" /> Loading library...
              </div>
            ) : (
              groups.map(([pack, imgs]) => (
                <div key={pack} className="fade-up">
                  <div className="flex items-baseline gap-3 mb-3">
                    <h2 className="text-[12px] font-semibold text-ink-3 uppercase tracking-[0.12em]">{pack}</h2>
                    <span className="text-[11px] text-ink-6">{imgs.length} images</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 xl:grid-cols-9 gap-2">
                    {imgs.map((img) => (
                      <div
                        key={img.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setPreview(img)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setPreview(img);
                        }}
                        className="group relative aspect-[9/16] cursor-zoom-in rounded-lg overflow-hidden bg-raised border border-line shadow-main transition-all hover:-translate-y-0.5 hover:border-line-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        {img.source === 'scraped' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(img.id);
                            }}
                            aria-label="Remove image"
                            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/70 text-white border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative max-h-[92vh] max-w-[92vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={preview.url}
              alt=""
              className="max-h-[92vh] max-w-[92vw] rounded-xl border border-line bg-raised object-contain shadow-main"
            />
            <button
              type="button"
              aria-label="Close preview"
              onClick={() => setPreview(null)}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/70 text-white hover:bg-black"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
