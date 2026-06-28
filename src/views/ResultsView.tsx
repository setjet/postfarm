import { useCallback, useEffect, useState } from 'react';
import {
  ExternalLink, Eye, Heart, ImageOff, Loader2, MessageCircle,
  RefreshCw, Share2,
} from 'lucide-react';
import type { PostResult } from '../types';
import { getResults, syncResults } from '../lib/api';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';

interface ResultsViewProps {
  configured: boolean;
}

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return includeTime
    ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ResultsView({ configured }: ResultsViewProps) {
  const [results, setResults] = useState<PostResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!configured) return;
    getResults()
      .then(setResults)
      .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, [configured]);

  // Refresh pulls fresh metrics from the platforms (post-bridge sync) first,
  // which is also what backfills cover thumbnails once a post goes live.
  const refresh = useCallback(async () => {
    if (!configured || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      setResults(await syncResults());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRefreshing(false);
    }
  }, [configured, refreshing]);

  const totalViews = results?.reduce((sum, result) => sum + result.views, 0) ?? 0;
  const totalLikes = results?.reduce((sum, result) => sum + result.likes, 0) ?? 0;
  const latestSync = results?.reduce<string | null>((latest, result) => {
    if (!result.lastSyncedAt || Number.isNaN(new Date(result.lastSyncedAt).getTime())) return latest;
    if (!latest || new Date(result.lastSyncedAt) > new Date(latest)) return result.lastSyncedAt;
    return latest;
  }, null) ?? null;
  const hasResults = !!results?.length;

  return (
    <>
      <ViewHeader
        title="Results"
        subtitle="Live performance analytics for your published posts."
        right={configured ? <>
          {latestSync && <span className="hidden text-[10px] text-ink-6 lg:block">Last synced {formatDate(latestSync, true)}</span>}
          <Button
            variant="secondary"
            icon={<RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />}
            onClick={() => void refresh()}
            disabled={refreshing}
            aria-busy={refreshing}
            aria-live="polite"
          >
            {refreshing ? 'Syncing…' : 'Refresh'}
          </Button>
        </> : undefined}
      />

      <div className="flex-1 overflow-y-auto">
        <main className="page-content">
          {error && results !== null && (
            <div role="alert" className="mb-5 border-l-2 border-danger bg-red-500/[0.06] px-3 py-2 text-[12px] text-danger">
              Analytics could not be refreshed. Showing the last loaded data. {error}
            </div>
          )}

          {!configured ? (
            <Empty text="Add your post-bridge API key in Settings to see published-post analytics." />
          ) : results === null ? (
            error ? <Empty text={error} error /> : <Loading />
          ) : !hasResults ? (
            <Empty text="No analytics yet. Once published posts are synced from Postbridge, their performance will appear here." />
          ) : (
            <>
              <section aria-labelledby="performance-overview">
                <h2 id="performance-overview" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-5">Performance overview</h2>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-3 sm:gap-x-10">
                  <Stat label="Total views" value={formatNumber(totalViews)} />
                  <Stat label="Total likes" value={formatNumber(totalLikes)} />
                  <Stat label="Posts tracked" value={String(results.length)} />
                </dl>
              </section>

              <section className="mt-8" aria-labelledby="published-posts">
                <div className="mb-3 flex items-end justify-between gap-4">
                  <div>
                    <h2 id="published-posts" className="text-[16px] font-semibold text-ink">Published posts</h2>
                    <p className="mt-1 text-[11px] text-ink-6">{results.length} tracked post{results.length === 1 ? '' : 's'}</p>
                  </div>
                </div>
                <div className="divide-y divide-line border-y border-line">
                  {results.map((result) => <ResultRow key={result.id} result={result} />)}
                </div>
              </section>

            </>
          )}
        </main>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-6">{label}</dt>
      <dd className="mt-1 text-[24px] font-semibold leading-none tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function ResultRow({ result }: { result: PostResult }) {
  const [imageFailed, setImageFailed] = useState(false);
  const synced = formatDate(result.lastSyncedAt);
  return (
    <article className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-3 py-4 lg:grid-cols-[64px_minmax(12rem,1fr)_repeat(4,minmax(52px,72px))_auto] lg:items-center lg:gap-x-4">
      <div className="h-[112px] w-16 shrink-0 overflow-hidden rounded-lg bg-raised">
        {result.coverImageUrl && !imageFailed ? (
          <img src={result.coverImageUrl} alt="" width={64} height={112} loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-7" aria-label="Thumbnail unavailable"><ImageOff size={18} /></div>
        )}
      </div>

      <div className="min-w-0 self-start pt-0.5 lg:self-center lg:pt-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-line bg-control px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-4">{result.platform || 'post'}</span>
          {synced && <span className="text-[10px] text-ink-6">Synced {synced}</span>}
        </div>
        <p className={`mt-2 line-clamp-2 break-words text-[12px] leading-relaxed ${result.description ? 'text-ink-3' : 'text-ink-6'}`}>{result.description || 'No caption available.'}</p>
      </div>

      <div className="col-span-2 grid grid-cols-4 gap-2 lg:contents">
        <Metric icon={Eye} label="Views" value={formatNumber(result.views)} />
        <Metric icon={Heart} label="Likes" value={formatNumber(result.likes)} />
        <Metric icon={MessageCircle} label="Comments" value={formatNumber(result.comments)} />
        <Metric icon={Share2} label="Shares" value={formatNumber(result.shares)} />
      </div>

      <div className="col-span-2 min-w-0 lg:col-span-1 lg:text-right">
        {result.shareUrl ? (
          <a href={result.shareUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-accent hover:bg-white/5 hover:text-ink">
            View post <ExternalLink size={11} />
          </a>
        ) : <span className="text-[10px] text-ink-7">No link</span>}
      </div>
    </article>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-ink-6"><Icon size={11} /><span className="sr-only sm:not-sr-only sm:truncate">{label}</span></div>
      <div className="mt-1 text-[13px] font-semibold tabular-nums text-ink-3">{value}</div>
    </div>
  );
}

function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 py-20 text-[13px] text-ink-5">
      <Loader2 size={14} className="animate-spin" /> Loading analytics…
    </div>
  );
}

function Empty({ text, error = false }: { text: string; error?: boolean }) {
  return <div role={error ? 'alert' : 'status'} className={`mx-auto max-w-md py-20 text-center text-[13px] leading-relaxed ${error ? 'text-danger' : 'text-ink-5'}`}>{text}</div>;
}
