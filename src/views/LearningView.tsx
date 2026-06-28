import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, FileText, Lightbulb, Loader2, MessageSquareQuote,
  RefreshCw, ShieldAlert, Tags, Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { LearningMemory, PostResult } from '../types';
import { Button } from '../components/Button';
import { ViewHeader } from '../components/ViewHeader';
import { clearLearning, getLearning, getResults, rebuildLearning } from '../lib/api';

interface LearningViewProps {
  configured: boolean;
  onUseIdea: (topic: string) => void;
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return includeTime
    ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function confidenceFor(postCount: number, platformCount: number) {
  if (postCount <= 2) return 'Limited data';
  if (postCount <= 7) return 'Early signals';
  if (postCount < 20 || platformCount < 2) return 'Moderate confidence';
  return 'Strong confidence';
}

function syncCoverage(results: PostResult[]) {
  const dates = results
    .map((result) => result.lastSyncedAt ? new Date(result.lastSyncedAt) : null)
    .filter((date): date is Date => !!date && !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (!dates.length) return '—';
  const first = formatDate(dates[0].toISOString());
  const last = formatDate(dates[dates.length - 1].toISOString());
  return first === last ? first : `${first}–${last}`;
}

export function LearningView({ configured, onUseIdea }: LearningViewProps) {
  const [memory, setMemory] = useState<LearningMemory | null>(null);
  const [analytics, setAnalytics] = useState<PostResult[]>([]);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const rebuildingRef = useRef(false);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    Promise.allSettled([getLearning(), getResults()]).then(([memoryResult, analyticsResult]) => {
      if (cancelled) return;
      if (memoryResult.status === 'fulfilled') setMemory(memoryResult.value);
      else setError(memoryResult.reason instanceof Error ? memoryResult.reason.message : String(memoryResult.reason));
      if (analyticsResult.status === 'fulfilled') {
        setAnalytics(analyticsResult.value);
        setAnalyticsError(false);
      } else {
        setAnalyticsError(true);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [configured]);

  const rebuild = useCallback(async () => {
    if (!configured || rebuildingRef.current) return;
    rebuildingRef.current = true;
    setRebuilding(true);
    setError(null);
    try {
      setMemory(await rebuildLearning());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      rebuildingRef.current = false;
      setRebuilding(false);
    }
  }, [configured]);

  const clear = useCallback(async () => {
    if (rebuildingRef.current || clearing) return;
    const confirmed = window.confirm('Clear Learning Memory for this project? This removes saved insights only. Published analytics, Account Context, and Style Memory will not be changed.');
    if (!confirmed) return;
    setClearing(true);
    setError(null);
    try {
      await clearLearning();
      setMemory(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setClearing(false);
    }
  }, [clearing]);

  const platformCount = new Set(analytics.map((result) => result.platform.trim().toLowerCase()).filter(Boolean)).size;
  const postCount = memory?.sourcePostCount || 0;
  const confidence = confidenceFor(postCount, platformCount);
  const limited = postCount < 8;

  return (
    <>
      <ViewHeader
        title="Learning"
        subtitle="Patterns from your published content that guide future generations."
        right={<>
          {memory?.generatedAt && <span className="hidden text-[10px] text-ink-6 lg:block">Last rebuilt {formatDate(memory.generatedAt, true)}</span>}
          {configured && <Button variant="primary" icon={rebuilding ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} onClick={() => void rebuild()} disabled={rebuilding || clearing} aria-busy={rebuilding} aria-live="polite">{rebuilding ? 'Rebuilding…' : 'Rebuild insights'}</Button>}
        </>}
      />

      <div className="flex-1 overflow-y-auto">
        <main className="page-content">
          {!configured ? <EmptyState text="Add your Postbridge API key in Settings to build insights from published content." /> : loading ? <Loading /> : (
            <>
              {error && <p role="alert" className="mb-5 border-l-2 border-danger bg-red-500/[0.06] px-3 py-2 text-[12px] text-danger">{error}</p>}
              {analyticsError && <p role="status" className="mb-5 border-l-2 border-warning bg-amber-500/[0.06] px-3 py-2 text-[12px] text-warning">Current analytics context could not be loaded. Saved insights remain available.</p>}

              <section aria-labelledby="learning-confidence">
                <h2 id="learning-confidence" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-5">Learning confidence</h2>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-4 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-8">
                  <SummaryMetric label="Posts analysed" value={String(postCount)} />
                  <SummaryMetric label="Platforms represented" value={analyticsError ? '—' : String(platformCount)} />
                  <SummaryMetric label="Sync coverage" value={analyticsError ? '—' : syncCoverage(analytics)} compact />
                  <SummaryMetric label="Confidence" value={confidence} compact />
                  <SummaryMetric label="Last rebuilt" value={memory?.generatedAt ? formatDate(memory.generatedAt) : 'Not yet'} compact />
                </dl>
                {limited && <p className="mt-3 text-[11px] leading-relaxed text-ink-5">Early signals only. Publish more posts before treating these patterns as reliable.</p>}
              </section>

              {!memory ? <EmptyMemory onRebuild={() => void rebuild()} rebuilding={rebuilding} /> : (
                <>
                  <section className="mt-9" aria-labelledby="key-insights">
                    <h2 id="key-insights" className="text-[17px] font-semibold text-ink">Key insights</h2>
                    <div className="mt-4 grid gap-x-10 gap-y-7 md:grid-cols-2">
                      <InsightList icon={CheckCircle2} title="What is working" items={memory.working} />
                      <InsightList icon={ShieldAlert} title="What to avoid" items={memory.avoid} />
                      <InsightList icon={MessageSquareQuote} title="Best hook formulas" items={memory.bestHookFormulas} />
                      <InsightList icon={Lightbulb} title="Best CTA keywords" items={memory.bestCtas} />
                      <InsightList icon={Tags} title="Suggested content buckets" items={memory.suggestedBuckets} />
                    </div>
                  </section>

                  <section className="mt-10 border-t border-line pt-8" aria-labelledby="recommended-posts">
                    <div>
                      <h2 id="recommended-posts" className="text-[17px] font-semibold text-ink">Recommended next posts</h2>
                      <p className="mt-1 text-[12px] text-ink-5">Turn a learned opportunity into a pre-filled generation draft.</p>
                    </div>
                    {memory.recommendedNextPosts.length ? <div className="mt-4 divide-y divide-line border-y border-line">{memory.recommendedNextPosts.map((idea, index) => <div key={`${idea}-${index}`} className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center"><div className="flex min-w-0 gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised text-[10px] font-semibold text-ink-5">{index + 1}</span><p className="min-w-0 text-[12px] leading-relaxed text-ink-3">{idea}</p></div><Button size="sm" onClick={() => onUseIdea(idea)}>Use this idea</Button></div>)}</div> : <p className="mt-4 text-[12px] text-ink-6">No recommendations are available yet.</p>}
                  </section>

                  <section className="mt-10 border-t border-line pt-6" aria-labelledby="full-analysis">
                    <details className="group">
                      <summary id="full-analysis" className="cursor-pointer list-none rounded text-[12px] font-medium text-ink-3 outline-none hover:text-ink focus-visible:ring-1 focus-visible:ring-focus">Full analysis</summary>
                      <p className="mt-3 max-w-3xl whitespace-pre-wrap text-[12px] leading-6 text-ink-4">{memory.summary}</p>
                    </details>
                  </section>

                  <section className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-line pt-6 sm:flex-row sm:items-center" aria-labelledby="learning-controls">
                    <div>
                      <h2 id="learning-controls" className="text-[12px] font-semibold text-ink-3">Learning controls</h2>
                      <p className="mt-1 text-[11px] leading-relaxed text-ink-6">Built from {memory.sourcePostCount} post{memory.sourcePostCount === 1 ? '' : 's'} on {formatDate(memory.generatedAt, true)}. Clearing removes these insights only.</p>
                    </div>
                    <Button variant="danger-ghost" icon={clearing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} onClick={() => void clear()} disabled={rebuilding || clearing} aria-busy={clearing}>{clearing ? 'Clearing…' : 'Clear Learning Memory'}</Button>
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

function SummaryMetric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <div><dt className="text-[9px] uppercase tracking-[0.12em] text-ink-6">{label}</dt><dd className={`mt-1 font-semibold text-ink ${compact ? 'text-[13px] leading-snug' : 'text-[22px] leading-none tabular-nums'}`}>{value}</dd></div>;
}

function InsightList({ icon: Icon, title, items }: { icon: LucideIcon; title: string; items: string[] }) {
  return <section className="border-t border-line pt-3"><h3 className="flex items-center gap-2 text-[11px] font-semibold text-ink-3"><Icon size={13} className="text-accent" /> {title}</h3>{items.length ? <ul className="mt-3 space-y-2">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-[12px] leading-relaxed text-ink-4"><span aria-hidden="true" className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-ink-6" /><span>{item}</span></li>)}</ul> : <p className="mt-2 text-[12px] text-ink-6">Not enough signal yet.</p>}</section>;
}

function EmptyMemory({ onRebuild, rebuilding }: { onRebuild: () => void; rebuilding: boolean }) {
  return <section className="mt-10 border-y border-line py-10 text-center"><FileText size={20} className="mx-auto text-ink-6" /><h2 className="mt-3 text-[15px] font-semibold text-ink">Learning Memory has not been built yet</h2><p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-ink-5">Build insights from your published-post analytics. This does not generate or schedule content.</p><Button className="mt-4" variant="primary" icon={rebuilding ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} onClick={onRebuild} disabled={rebuilding}>{rebuilding ? 'Rebuilding…' : 'Rebuild insights'}</Button></section>;
}

function Loading() {
  return <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 py-20 text-[13px] text-ink-5"><Loader2 size={14} className="animate-spin" /> Loading learning insights…</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div role="status" className="mx-auto max-w-md py-20 text-center text-[13px] leading-relaxed text-ink-5">{text}</div>;
}
