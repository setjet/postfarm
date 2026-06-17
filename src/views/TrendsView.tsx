import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Loader2, Search, Trash2, Sparkles, X } from 'lucide-react';
import type { TrendItem } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { clearTrends, deleteTrend, getTrends, scrapeTrends } from '../lib/api';

interface TrendsViewProps {
  hasApify: boolean;
  canGenerate: boolean;
  generating: boolean;
  onGenerateFromTrends: (trendIds?: string[]) => void;
}

type SortKey = 'views' | 'likes' | 'comments' | 'date' | 'platform' | 'query';

function metric(value: number | null) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n ? String(n) : '-';
}

function sortValue(item: TrendItem, key: SortKey) {
  if (key === 'date') return new Date(item.uploadDate || item.scrapedAt || 0).getTime();
  if (key === 'platform') return item.platform || '';
  if (key === 'query') return item.query || '';
  return Number(item[key] || 0);
}

export function TrendsView({ hasApify, canGenerate, generating, onGenerateFromTrends }: TrendsViewProps) {
  const [trends, setTrends] = useState<TrendItem[] | null>(null);
  const [queries, setQueries] = useState('');
  const [count, setCount] = useState(20);
  const [actor, setActor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>('views');
  const [filter, setFilter] = useState('');

  const load = () => getTrends().then(setTrends).catch((e) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = trends || [];
    const visible = needle
      ? list.filter((item) =>
          [item.hook, item.caption, item.platform, item.query, item.author, item.hashtags.join(' ')]
            .join(' ')
            .toLowerCase()
            .includes(needle)
        )
      : list;
    return visible.slice().sort((a, b) => {
      const av = sortValue(a, sort);
      const bv = sortValue(b, sort);
      return typeof av === 'string' || typeof bv === 'string'
        ? String(av).localeCompare(String(bv))
        : Number(bv) - Number(av);
    });
  }, [trends, filter, sort]);

  const scrape = async () => {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const terms = queries.split(',').map((q) => q.trim()).filter(Boolean);
      const r = await scrapeTrends(terms, count, actor.trim() || undefined);
      setTrends(r.trends);
      setNote(`Added ${r.added} trend item${r.added === 1 ? '' : 's'} from ${r.found} found.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setSelectedIds((ids) => ids.filter((x) => x !== id));
    setTrends(await deleteTrend(id));
  };

  const clearAll = async () => {
    if (!window.confirm('Clear all stored trends for this project?')) return;
    setSelectedIds([]);
    setTrends(await clearTrends());
  };

  const toggle = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <>
      <ViewHeader
        title="Trends"
        subtitle="Mine public content patterns as research, then generate original posts from the signals."
        right={
          <>
            {selectedIds.length > 0 && (
              <Button
                variant="secondary"
                icon={<Sparkles size={13} />}
                onClick={() => onGenerateFromTrends(selectedIds)}
                disabled={!canGenerate || generating}
              >
                Generate selected
              </Button>
            )}
            <Button
              variant="primary"
              icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              onClick={() => onGenerateFromTrends(undefined)}
              disabled={!canGenerate || generating || !trends?.length}
            >
              Generate from all
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-8 py-4">
          <div className="max-w-6xl mx-auto space-y-3">
            <div className="flex items-start gap-2 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <label className="text-[11px] text-ink-5 mb-1 block">Queries, hashtags, profiles, or URLs</label>
                <input
                  value={queries}
                  onChange={(e) => setQueries(e.target.value)}
                  placeholder="#saas, @creator, AI tools, TikTok URL"
                  disabled={!hasApify || busy}
                  className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2 disabled:opacity-50"
                />
              </div>
              <div className="w-24">
                <label className="text-[11px] text-ink-5 mb-1 block">Max</label>
                <input
                  type="number"
                  value={count}
                  min={1}
                  max={100}
                  onChange={(e) => setCount(Number(e.target.value))}
                  onBlur={() => setCount((c) => Math.min(Math.max(c || 1, 1), 100))}
                  disabled={!hasApify || busy}
                  className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-line-2 disabled:opacity-50"
                />
              </div>
              <div className="w-56">
                <label className="text-[11px] text-ink-5 mb-1 block">Actor</label>
                <input
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                  placeholder="clockworks/tiktok-scraper"
                  disabled={!hasApify || busy}
                  className="w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2 disabled:opacity-50"
                />
              </div>
              <Button
                variant="primary"
                size="lg"
                className="mt-5"
                icon={busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                onClick={scrape}
                disabled={!hasApify || busy || !queries.trim()}
              >
                {busy ? 'Mining...' : 'Mine trends'}
              </Button>
            </div>
            {!hasApify && <p className="text-[12px] text-ink-5">Add your Apify API key in Settings to mine trends.</p>}
            {note && <p className="text-[12px] text-success">{note}</p>}
            {error && <p className="text-[12px] text-danger">{error}</p>}
          </div>
        </div>

        <div className="px-4 sm:px-8 pb-4">
          <div className="max-w-6xl mx-auto flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-6" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter stored trends"
                className="w-full h-9 bg-raised border border-line rounded-lg pl-8 pr-3 text-[12px] text-ink placeholder:text-ink-6 outline-none focus:border-line-2"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-9 bg-raised border border-line rounded-lg px-3 text-[12px] text-ink outline-none focus:border-line-2"
            >
              <option value="views">Views</option>
              <option value="likes">Likes</option>
              <option value="comments">Comments</option>
              <option value="date">Date</option>
              <option value="platform">Platform</option>
              <option value="query">Query</option>
            </select>
            {selectedIds.length > 0 && (
              <Button variant="ghost" icon={<X size={13} />} onClick={() => setSelectedIds([])}>
                Clear selection
              </Button>
            )}
            {!!trends?.length && (
              <Button variant="danger-ghost" icon={<Trash2 size={13} />} onClick={clearAll}>
                Clear all
              </Button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-8 pt-0">
          <div className="max-w-6xl mx-auto">
            {trends === null ? (
              <div className="flex items-center justify-center py-16 text-ink-5 text-[13px] gap-2">
                <Loader2 size={14} className="animate-spin text-accent" /> Loading trends...
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-[13px] text-ink-5">
                No trend items yet. Mine a niche query or hashtag to start.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filtered.map((item) => (
                  <TrendCard
                    key={item.id}
                    item={item}
                    selected={selectedIds.includes(item.id)}
                    onToggle={() => toggle(item.id)}
                    onDelete={() => void remove(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function TrendCard({
  item,
  selected,
  onToggle,
  onDelete,
}: {
  item: TrendItem;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`rounded-xl border bg-surface p-4 shadow-main fade-up ${selected ? 'border-accent ring-1 ring-accent' : 'border-line'}`}>
      <div className="flex items-start gap-3">
        <label className="w-7 h-7 rounded-lg bg-raised border border-line flex items-center justify-center cursor-pointer shrink-0">
          <input type="checkbox" checked={selected} onChange={onToggle} />
        </label>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-line bg-control uppercase tracking-wide text-ink-4">
              {item.platform || 'source'}
            </span>
            <span className="text-[11px] text-ink-6">{item.query}</span>
            {item.author && <span className="text-[11px] text-ink-6">@{item.author.replace(/^@/, '')}</span>}
          </div>
          <h3 className="text-[14px] text-ink font-semibold leading-snug mt-2 line-clamp-2">
            {item.hook || item.caption || '(no hook)'}
          </h3>
          {item.caption && <p className="text-[12px] text-ink-5 leading-relaxed mt-1 line-clamp-2">{item.caption}</p>}
          <div className="flex items-center gap-3 text-[11px] text-ink-5 mt-3 flex-wrap">
            <span>{metric(item.views)} views</span>
            <span>{metric(item.likes)} likes</span>
            <span>{metric(item.comments)} comments</span>
            <span>{metric(item.shares)} shares</span>
          </div>
          {!!item.hashtags?.length && (
            <div className="flex flex-wrap gap-1 mt-2">
              {item.hashtags.slice(0, 5).map((tag) => (
                <span key={tag} className="text-[10px] text-ink-5 px-1.5 py-0.5 rounded-md bg-control border border-line">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {item.postUrl && (
            <a
              href={item.postUrl}
              target="_blank"
              rel="noreferrer"
              className="w-8 h-8 rounded-lg text-ink-5 hover:text-ink hover:bg-white/[0.055] flex items-center justify-center"
              aria-label="Open trend"
            >
              <ExternalLink size={14} />
            </a>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete trend"
            className="w-8 h-8 rounded-lg text-ink-5 hover:text-danger hover:bg-red-500/10 flex items-center justify-center"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
