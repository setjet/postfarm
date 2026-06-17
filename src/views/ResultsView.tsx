import { useCallback, useEffect, useState } from 'react';
import { Eye, Heart, MessageCircle, Share2, Loader2, RefreshCw } from 'lucide-react';
import type { PostResult } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { getResults, syncResults } from '../lib/api';

interface ResultsViewProps {
  configured: boolean;
}

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function ResultsView({ configured }: ResultsViewProps) {
  const [results, setResults] = useState<PostResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!configured) return;
    getResults()
      .then(setResults)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [configured]);

  // Refresh pulls fresh metrics from the platforms (post-bridge sync) first,
  // which is also what backfills cover thumbnails once a post goes live.
  const refresh = useCallback(async () => {
    if (!configured) return;
    setRefreshing(true);
    setError(null);
    try {
      setResults(await syncResults());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [configured]);

  const totalViews = results?.reduce((s, r) => s + r.views, 0) ?? 0;
  const totalLikes = results?.reduce((s, r) => s + r.likes, 0) ?? 0;

  return (
    <>
      <ViewHeader
        title="Results"
        subtitle="Live analytics from post-bridge for everything you've published."
        right={
          configured && (
            <button
              onClick={() => void refresh()}
              disabled={refreshing}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-line bg-control text-[12px] text-ink-4 shadow-main hover:text-ink hover:border-line-2 disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Syncing…' : 'Refresh'}
            </button>
          )
        }
      />
      <div className="flex-1 overflow-y-auto">
        {results && results.length > 0 && (
          <div className="px-4 sm:px-8 py-4 border-b border-line bg-[#101010]">
            <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
              <Stat label="Total views" value={formatNumber(totalViews)} />
              <Stat label="Total likes" value={formatNumber(totalLikes)} />
              <Stat label="Posts tracked" value={String(results.length)} />
            </div>
          </div>
        )}

        <div className="p-4 sm:p-8">
          <div className="max-w-5xl mx-auto flex flex-col gap-3">
            {!configured ? (
              <Empty text="Add your post-bridge API key in Settings to see analytics." />
            ) : error ? (
              <Empty text={error} />
            ) : results === null ? (
              <Loading />
            ) : results.length === 0 ? (
              <Empty text="No analytics yet. Once your posts go live, post-bridge syncs their performance here." />
            ) : (
              results.map((r) => <ResultCard key={r.id} result={r} />)
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-main">
      <div className="text-[10px] text-ink-6 uppercase tracking-[0.12em]">{label}</div>
      <div className="text-[22px] font-semibold text-ink leading-none mt-1">{value}</div>
    </div>
  );
}

function ResultCard({ result }: { result: PostResult }) {
  return (
    <div className="bg-surface border border-line rounded-xl p-4 flex gap-4 shadow-main hover:border-line-2 transition-colors fade-up">
      <div className="shrink-0 w-20 aspect-[9/16] rounded-lg overflow-hidden bg-raised border border-line">
        {result.coverImageUrl && (
          <img src={result.coverImageUrl} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-line bg-control uppercase tracking-wide text-ink-4">
            {result.platform || 'post'}
          </span>
          {result.lastSyncedAt && (
            <span className="text-[11px] text-ink-6">
              synced {new Date(result.lastSyncedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        {result.description && (
          <h3 className="text-[14px] font-semibold text-ink leading-snug mb-2 line-clamp-2">
            {result.description}
          </h3>
        )}
        <div className="flex items-center gap-4 text-[12px] text-ink-4 flex-wrap">
          <Metric icon={Eye} value={formatNumber(result.views)} />
          <Metric icon={Heart} value={formatNumber(result.likes)} />
          <Metric icon={MessageCircle} value={formatNumber(result.comments)} />
          <Metric icon={Share2} value={formatNumber(result.shares)} />
          {result.shareUrl && (
            <a href={result.shareUrl} target="_blank" rel="noreferrer" className="text-accent underline decoration-white/20 hover:text-ink">
              view post
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, value }: { icon: typeof Eye; value: string }) {
  return (
    <span className="flex items-center gap-1">
      <Icon size={11} className="text-ink-6" />
      {value}
    </span>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-ink-5 text-[13px] gap-2">
      <Loader2 size={14} className="animate-spin" /> Loading analytics…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-center py-16 text-[13px] text-ink-5 max-w-md mx-auto leading-relaxed">{text}</div>;
}
