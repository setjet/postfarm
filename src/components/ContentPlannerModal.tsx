import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, Clock,
  Eye, Image, Loader2, MoreHorizontal, Pencil, Play, RefreshCw, ShieldAlert, Sparkles, Trash2, X,
} from 'lucide-react';
import type {
  ContentPlan, ContentPlanConfig, ContentPlanSlot, PlannerFormat, QualityFinding, SocialAccount, VideoAsset,
} from '../types';
import type { PlannerJobState } from '../lib/plannerJobController';
import {
  approveContentPlanSlot, approveReadyContentPlanSlots, confirmAutomaticContentPlan,
  checkContentPlanSlot, createContentPlan, deleteContentPlan, fixContentPlanSlot,
  getContentPlan, getContentPlans, getVideos, previewContentPlan,
  updateContentPlanSlot,
} from '../lib/api';
import { Button } from './Button';
import { PackPicker } from './PackPicker';
import { SlidePreview } from './SlidePreview';
import { TextBlink } from './TextBlink';
import { PostPreviewModal } from './PostPreviewModal';
import { latestPlannerSnapshot, latestPreviewSlot, plannerPreviewAvailability } from '../lib/postPreview';

type Stage = 'list' | 'configure' | 'preview' | 'manage';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FORMATS: Array<{ id: PlannerFormat; label: string }> = [
  { id: 'standard', label: 'Standard carousel' }, { id: 'notes', label: 'Notes-style' },
  { id: 'image', label: 'Image post' }, { id: 'video', label: 'Video post' },
];

function dateInput(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function initialConfig(accounts: SocialAccount[]): ContentPlanConfig {
  return {
    name: 'New content plan', goal: 'growth', rangePreset: '7', startDate: dateInput(), endDate: dateInput(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', postingDays: [1, 2, 3, 4, 5],
    postsPerDay: 1, preferredTimeMode: 'ai', preferredTimes: ['10:00'], socialAccountIds: accounts.map((account) => account.id),
    topicMode: 'general', topics: [], contentPillars: [{ name: 'Education', percentage: 50 }, { name: 'Engagement', percentage: 50 }],
    formats: ['standard', 'notes'], backgroundSelections: [], generationNotes: '', productEmphasis: '',
    videoId: null, approvalMode: 'manual', useTrends: true,
  };
}

export function ContentPlannerModal({ accounts, onClose, onScheduled, initialPlanId, job, onGenerate, onSchedule }: {
  accounts: SocialAccount[];
  onClose: () => void;
  onScheduled: () => void;
  initialPlanId: string | null;
  job: PlannerJobState;
  onGenerate: (plan: ContentPlan, slots: ContentPlanSlot[]) => Promise<ContentPlan>;
  onSchedule: (plan: ContentPlan, slots: ContentPlanSlot[]) => Promise<ContentPlan>;
}) {
  const [stage, setStage] = useState<Stage>(initialPlanId ? 'manage' : 'list');
  const [plans, setPlans] = useState<ContentPlan[] | null>(null);
  const [config, setConfig] = useState<ContentPlanConfig>(() => initialConfig(accounts));
  const [preview, setPreview] = useState<Pick<ContentPlan, 'config' | 'slots' | 'progress'> | null>(null);
  const [storedPlan, setPlan] = useState<ContentPlan | null>(null);
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewSlotId, setPreviewSlotId] = useState<string | null>(null);
  const [previewTrigger, setPreviewTrigger] = useState<HTMLElement | null>(null);
  const mounted = useRef(true);
  const currentPlanId = storedPlan?.id || initialPlanId;
  const matchingJobPlan = job.plan?.id === currentPlanId ? job.plan : null;
  const plan = latestPlannerSnapshot(storedPlan, matchingJobPlan);
  const jobBusy = job.status === 'running' && job.planId === plan?.id;
  const generatingSlotIds = new Set(job.stage === 'generation' && job.planId === plan?.id ? job.activeSlotIds : []);
  const previewSlot = latestPreviewSlot(previewSlotId, plan?.slots || []);
  const previewVideo = previewSlot?.format === 'video' ? videos.find((video) => video.id === plan?.config.videoId) || null : null;
  const previewReady = previewSlot ? plannerPreviewAvailability(previewSlot, previewSlot.format !== 'video' || !!previewVideo) : null;
  const closePostPreview = useCallback(() => setPreviewSlotId(null), []);

  useEffect(() => {
    Promise.all([getContentPlans(), getVideos().catch(() => [])]).then(([items, videoItems]) => {
      setPlans(items); setVideos(videoItems);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!initialPlanId) return;
    if (job.plan?.id === initialPlanId) return;
    void getContentPlan(initialPlanId).then((current) => {
      if (!mounted.current) return;
      setPlan(current);
      setStage('manage');
    }).catch((caught) => mounted.current && setError(caught instanceof Error ? caught.message : String(caught)));
  }, [initialPlanId, job.plan?.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !previewSlotId) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, previewSlotId]);

  useEffect(() => {
    if (!previewSlotId || (previewSlot && previewReady?.enabled)) return;
    const frame = window.requestAnimationFrame(closePostPreview);
    return () => window.cancelAnimationFrame(frame);
  }, [closePostPreview, previewReady?.enabled, previewSlot, previewSlotId]);

  const mutateConfig = <K extends keyof ContentPlanConfig,>(key: K, value: ContentPlanConfig[K]) =>
    setConfig((current) => ({ ...current, [key]: value }));

  const openPlan = async (id: string) => {
    setBusy(true); setError(null);
    try { setPlan(await getContentPlan(id)); setStage('manage'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };

  const makePreview = async () => {
    setBusy(true); setError(null);
    try { setPreview(await previewContentPlan(config)); setStage('preview'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };

  const persistPlan = async () => {
    setBusy(true); setError(null);
    try { const created = await createContentPlan(config); setPlan(created); setStage('manage'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };

  const runBatch = async (kind: 'generate' | 'retry' | 'approve' | 'schedule') => {
    if (!plan || busy || job.status === 'running') return;
    setError(null);
    try {
      if (kind === 'generate') return void onGenerate(plan, plan.slots.filter((slot) => slot.status === 'planned'));
      if (kind === 'retry') return void onGenerate(plan, plan.slots.filter((slot) => slot.status === 'failed' && !slot.post && !slot.scheduleUncertain));
      if (kind === 'approve') {
        setBusy(true);
        const warningCount = plan.slots.filter((slot) => slot.status === 'ready_for_review' && slot.qualityReport?.status === 'warnings').length;
        const acknowledge = warningCount > 0
          ? window.confirm(`${warningCount} ready post${warningCount === 1 ? ' has' : 's have'} warnings. Review them, then click OK to acknowledge and approve all ready posts.`)
          : false;
        if (warningCount > 0 && !acknowledge) return;
        setPlan(await approveReadyContentPlanSlots(plan.id, acknowledge));
      }
      if (kind === 'schedule') {
        const slots = plan.slots.filter((slot) => slot.status === 'approved');
        void onSchedule(plan, slots).then(() => { if (mounted.current && slots.length) onScheduled(); });
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };

  const updateSlot = async (slot: ContentPlanSlot, patch: Record<string, unknown>) => {
    if (!plan) return;
    setError(null);
    try { setPlan(await updateContentPlanSlot(plan.id, slot.id, patch)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };

  const editSlot = async (slot: ContentPlanSlot) => {
    const topic = window.prompt('Topic', slot.topic);
    if (topic === null) return;
    const pillar = window.prompt('Content pillar', slot.pillar);
    if (pillar === null) return;
    const format = window.prompt('Format (standard, notes, image, or video)', slot.format);
    if (format === null) return;
    if (!FORMATS.some((item) => item.id === format)) return setError('Use standard, notes, image, or video for the slot format.');
    const localDate = window.prompt('Date (YYYY-MM-DD)', slot.localDate);
    if (localDate === null) return;
    const localTime = window.prompt('Time (HH:mm)', slot.localTime);
    if (localTime === null) return;
    await updateSlot(slot, { topic: topic.trim(), pillar: pillar.trim(), format, localDate, localTime });
  };

  const approveSlot = async (slot: ContentPlanSlot) => {
    if (!plan) return;
    const acknowledge = slot.qualityReport?.status === 'warnings'
      ? window.confirm('This post has Quality Gate warnings. Review them, then click OK to acknowledge and approve.')
      : false;
    if (slot.qualityReport?.status === 'warnings' && !acknowledge) return;
    setPlan(await approveContentPlanSlot(plan.id, slot.id, acknowledge));
  };

  const removePlan = async () => {
    if (!plan || !window.confirm(`Delete “${plan.name}”? Generated Queue posts and Postbridge posts are not affected.`)) return;
    await deleteContentPlan(plan.id);
    setPlans(await getContentPlans()); setPlan(null); setStage('list');
  };

  const confirmAutomatic = async () => {
    if (!plan) return;
    const ok = window.confirm('Automatic scheduling will schedule every generated post that passes the Quality Gate without another per-post confirmation. Continue?');
    if (!ok) return;
    setPlan(await confirmAutomaticContentPlan(plan.id));
  };

  const runSingle = async (action: () => Promise<unknown>) => {
    if (busy || job.status === 'running') return;
    setBusy(true); setError(null);
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            {stage !== 'list' && <button type="button" onClick={() => setStage(stage === 'manage' ? 'list' : stage === 'preview' ? 'configure' : 'list')} disabled={busy || jobBusy} className="text-ink-5 hover:text-ink"><ChevronLeft size={17} /></button>}
            <div><h2 className="text-[15px] font-semibold text-ink">Autopilot Content Planner</h2><p className="text-[11px] text-ink-6">Plan, review, and schedule your content calendar.</p></div>
          </div>
          <button type="button" aria-label="Close planner" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-5 hover:bg-white/5 hover:text-ink"><X size={17} /></button>
        </div>

        {error && <div role="alert" className="border-b border-danger/20 bg-red-500/10 px-5 py-2.5 text-[11px] text-danger">{error}</div>}

        <div className="flex-1 overflow-y-auto">
          {stage === 'list' && <PlanList plans={plans} busy={busy} onOpen={openPlan} onNew={() => { setConfig(initialConfig(accounts)); setStage('configure'); }} />}
          {stage === 'configure' && <ConfigurePlan config={config} accounts={accounts} videos={videos} disabled={busy} mutate={mutateConfig} onPreview={() => void makePreview()} />}
          {stage === 'preview' && preview && <PreviewPlan preview={preview} busy={busy} onCreate={() => void persistPlan()} />}
          {stage === 'manage' && plan && (
            <ManagePlan
              plan={plan} videos={videos} busy={busy || job.status === 'running'} generatingSlotIds={generatingSlotIds} onBatch={runBatch} onEdit={editSlot}
              onGenerate={(slot) => { if (job.status !== 'running') void onGenerate(plan, [slot]); }}
              onRemove={(slot) => updateSlot(slot, { removed: true })}
              onApprove={(slot) => runSingle(() => approveSlot(slot))}
              onSchedule={(slot) => { if (job.status !== 'running') void onSchedule(plan, [slot]).then(() => { if (mounted.current) onScheduled(); }); }}
              onFix={(slot) => runSingle(async () => setPlan(await fixContentPlanSlot(plan.id, slot.id)))}
              onRecheck={(slot) => runSingle(async () => setPlan(await checkContentPlanSlot(plan.id, slot.id)))}
              onConfirmAutomatic={() => void runSingle(confirmAutomatic)}
              onDelete={() => void runSingle(removePlan)}
              onPreview={(slot, trigger) => { setPreviewTrigger(trigger); setPreviewSlotId(slot.id); }}
            />
          )}
        </div>
      </div>
    </div>
    {previewSlot?.post && previewReady?.enabled && (
      <PostPreviewModal slideshow={previewSlot.post} video={previewVideo} onClose={closePostPreview} returnFocus={previewTrigger} />
    )}
    </>
  );
}

function PlanList({ plans, busy, onOpen, onNew }: { plans: ContentPlan[] | null; busy: boolean; onOpen: (id: string) => void; onNew: () => void }) {
  return <div className="p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-[14px] font-semibold text-ink">Saved plans</h3><p className="text-[11px] text-ink-6">Progress is stored locally and survives restarts.</p></div><Button variant="primary" icon={<CalendarDays size={14} />} onClick={onNew}>New plan</Button></div>
    {plans === null ? <div className="py-16 text-center text-[12px] text-ink-5"><Loader2 size={14} className="mx-auto mb-2 animate-spin" /> Loading plans…</div> : plans.length === 0 ? <div className="rounded-xl border border-dashed border-line py-16 text-center text-[12px] text-ink-5">No content plans yet.</div> : <div className="grid gap-3 sm:grid-cols-2">{plans.map((plan) => <button key={plan.id} type="button" disabled={busy} onClick={() => onOpen(plan.id)} className="rounded-xl border border-line bg-raised p-4 text-left hover:border-line-2"><div className="flex items-center justify-between"><span className="text-[13px] font-semibold text-ink">{plan.name}</span><span className="text-[10px] text-ink-6">{plan.progress.complete}/{plan.progress.total}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30"><div className="h-full bg-accent" style={{ width: `${plan.progress.total ? plan.progress.complete / plan.progress.total * 100 : 0}%` }} /></div><p className="mt-2 text-[10px] capitalize text-ink-6">{plan.config.goal} · {plan.config.approvalMode} approval · {plan.config.timezone}</p></button>)}</div>}
  </div>;
}

function ConfigurePlan({ config, accounts, videos, disabled, mutate, onPreview }: { config: ContentPlanConfig; accounts: SocialAccount[]; videos: VideoAsset[]; disabled: boolean; mutate: <K extends keyof ContentPlanConfig>(key: K, value: ContentPlanConfig[K]) => void; onPreview: () => void }) {
  const toggle = <T,>(values: T[], value: T) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  const manualFallbacks = ['09:00', '12:00', '15:00', '18:00', '20:00', '22:00'];
  const changePostsPerDay = (count: number) => {
    const next = Math.min(Math.max(count || 1, 1), 6);
    mutate('postsPerDay', next);
    if (config.preferredTimeMode === 'manual') {
      mutate('preferredTimes', Array.from({ length: next }, (_, index) => config.preferredTimes[index] || manualFallbacks[index]));
    }
  };
  const changePreferredTime = (index: number, value: string) => {
    const next = Array.from({ length: config.postsPerDay }, (_, itemIndex) => config.preferredTimes[itemIndex] || manualFallbacks[itemIndex]);
    next[index] = value;
    mutate('preferredTimes', next);
  };
  return <div className="space-y-6 p-5 sm:p-6">
    <section className="grid gap-3 sm:grid-cols-2"><Field label="Plan name"><input value={config.name} onChange={(event) => mutate('name', event.target.value)} className="input" /></Field><Field label="Goal"><select value={config.goal} onChange={(event) => mutate('goal', event.target.value as ContentPlanConfig['goal'])} className="input">{['growth','engagement','education','promotion','traffic'].map((goal) => <option key={goal}>{goal}</option>)}</select></Field></section>
    <section><Label>Range and timezone</Label><div className="mb-3 flex flex-wrap gap-2">{(['7','14','30','custom'] as const).map((preset) => <Button key={preset} size="sm" variant={config.rangePreset === preset ? 'primary' : 'secondary'} onClick={() => mutate('rangePreset', preset)}>{preset === 'custom' ? 'Custom' : `${preset} days`}</Button>)}</div><div className="grid gap-3 sm:grid-cols-3"><Field label="Start"><input type="date" value={config.startDate} onChange={(event) => mutate('startDate', event.target.value)} className="input" /></Field><Field label="End"><input type="date" value={config.endDate} onChange={(event) => mutate('endDate', event.target.value)} disabled={config.rangePreset !== 'custom'} className="input disabled:opacity-50" /></Field><Field label="Timezone"><input value={config.timezone} onChange={(event) => mutate('timezone', event.target.value)} className="input" /></Field></div></section>
    <section>
      <Label>Posting cadence</Label>
      <div className="mb-3 flex flex-wrap gap-1.5">{DAYS.map((day, index) => <button key={day} type="button" onClick={() => mutate('postingDays', toggle(config.postingDays, index))} className={`h-8 rounded-lg border px-2.5 text-[11px] ${config.postingDays.includes(index) ? 'border-accent bg-accent text-bg' : 'border-line text-ink-5'}`}>{day}</button>)}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Posts per day"><input type="number" min={1} max={6} value={config.postsPerDay} onChange={(event) => changePostsPerDay(Number(event.target.value))} className="input" /></Field>
        <div>
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-6">Posting times</div>
          <div className="flex gap-2">
            <Button size="sm" variant={config.preferredTimeMode === 'ai' ? 'primary' : 'secondary'} onClick={() => mutate('preferredTimeMode', 'ai')}>Let AI choose</Button>
            <Button size="sm" variant={config.preferredTimeMode === 'manual' ? 'primary' : 'secondary'} onClick={() => mutate('preferredTimeMode', 'manual')}>Choose times</Button>
          </div>
        </div>
      </div>
      {config.preferredTimeMode === 'ai' ? (
        <p className="mt-3 rounded-lg border border-accent/20 bg-sky-500/10 px-3 py-2 text-[11px] text-ink-4">AI will spread posts across goal-appropriate engagement windows. The exact times appear in the calendar preview.</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: config.postsPerDay }, (_, index) => <Field key={index} label={`Post ${index + 1}`}><input type="time" value={config.preferredTimes[index] || manualFallbacks[index]} onChange={(event) => changePreferredTime(index, event.target.value)} className="input" /></Field>)}
        </div>
      )}
    </section>
    <section><Label>Target accounts</Label><div className="grid gap-2 sm:grid-cols-2">{accounts.map((account) => <label key={account.id} className="flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-[11px] text-ink-3"><input type="checkbox" checked={config.socialAccountIds.includes(account.id)} onChange={() => mutate('socialAccountIds', toggle(config.socialAccountIds, account.id))} /><span className="font-medium">@{account.username.replace(/^@/,'')}</span><span className="ml-auto uppercase text-ink-6">{account.platform}</span></label>)}</div></section>
    <section><Label>Topics and content pillars</Label><div className="mb-3 flex gap-2"><Button size="sm" variant={config.topicMode === 'general' ? 'primary' : 'secondary'} onClick={() => mutate('topicMode','general')}>General + trends</Button><Button size="sm" variant={config.topicMode === 'custom' ? 'primary' : 'secondary'} onClick={() => mutate('topicMode','custom')}>Custom topics</Button></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Topics (one per line)"><textarea rows={4} value={config.topics.join('\n')} onChange={(event) => mutate('topics', event.target.value.split('\n').map((value) => value.trim()).filter(Boolean))} placeholder={config.topicMode === 'custom' ? 'Enter exact topics' : 'Optional proposed topics'} className="textarea" /></Field><Field label="Pillars (Name: percentage)"><textarea rows={4} value={config.contentPillars.map((pillar) => `${pillar.name}: ${pillar.percentage}`).join('\n')} onChange={(event) => mutate('contentPillars', event.target.value.split('\n').map((line) => { const [name, value] = line.split(':'); return { name: name?.trim(), percentage: Number(value) || 0 }; }).filter((item) => item.name))} className="textarea" /></Field></div></section>
    <section><Label>Format mix</Label><div className="flex flex-wrap gap-2">{FORMATS.map((format) => <Button key={format.id} size="sm" variant={config.formats.includes(format.id) ? 'primary' : 'secondary'} onClick={() => mutate('formats', toggle(config.formats, format.id))}>{format.label}</Button>)}</div>{config.formats.includes('video') && <div className="mt-3"><Field label="Background video"><select value={config.videoId || ''} onChange={(event) => mutate('videoId', event.target.value || null)} className="input"><option value="">Select a video</option>{videos.map((video) => <option key={video.id} value={video.id}>{video.pack}{video.duration ? ` (${Math.round(video.duration)}s)` : ''}</option>)}</select></Field></div>}</section>
    <section><Label>Library folders and background packs</Label><PackPicker selected={config.backgroundSelections} onChange={(value) => mutate('backgroundSelections', value)} disabled={disabled} /></section>
    <section className="grid gap-3 sm:grid-cols-2"><Field label="Generation notes"><textarea rows={4} maxLength={2000} value={config.generationNotes} onChange={(event) => mutate('generationNotes', event.target.value)} placeholder="e.g. no emojis; avoid income claims" className="textarea" /></Field><Field label="Required product or offer (optional)"><textarea rows={4} value={config.productEmphasis} onChange={(event) => mutate('productEmphasis', event.target.value)} placeholder="Leave blank unless every post must mention it" className="textarea" /></Field></section>
    <section><Label>Approval</Label><div className="flex gap-2"><Button variant={config.approvalMode === 'manual' ? 'primary' : 'secondary'} onClick={() => mutate('approvalMode','manual')}>Manual approval</Button><Button variant={config.approvalMode === 'automatic' ? 'primary' : 'secondary'} onClick={() => mutate('approvalMode','automatic')}>Automatic scheduling</Button></div>{config.approvalMode === 'automatic' && <div className="mt-3 flex gap-2 rounded-lg border border-warning/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-ink-3"><AlertTriangle size={15} className="shrink-0 text-warning" /> Passing posts will be scheduled after generation. A second explicit confirmation is required before anything is sent to Postbridge.</div>}</section>
    <div className="flex justify-end border-t border-line pt-5"><Button variant="primary" icon={disabled ? <Loader2 size={13} className="animate-spin" /> : <CalendarDays size={13} />} onClick={onPreview} disabled={disabled}>Preview calendar</Button></div>
  </div>;
}

function PreviewPlan({ preview, busy, onCreate }: { preview: Pick<ContentPlan,'config'|'slots'|'progress'>; busy: boolean; onCreate: () => void }) {
  const conflicts = preview.slots.filter((slot) => slot.conflicts.length).length;
  return <div className="p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-[14px] font-semibold text-ink">Calendar preview</h3><p className="text-[11px] text-ink-6">No AI calls have been made. Review {preview.slots.length} proposed slots first.</p></div><Button variant="primary" icon={busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} onClick={onCreate} disabled={busy}>Confirm plan</Button></div>{conflicts > 0 && <div className="mb-4 rounded-lg border border-danger/25 bg-red-500/10 px-3 py-2 text-[11px] text-danger">{conflicts} slot{conflicts === 1 ? '' : 's'} conflict with the current Postbridge schedule. Move them before scheduling.</div>}<div className="space-y-2">{preview.slots.map((slot) => <SlotSummary key={slot.id} slot={slot} accounts={[]} />)}</div></div>;
}

function ManagePlan({ plan, videos, busy, generatingSlotIds, onBatch, onEdit, onGenerate, onRemove, onApprove, onSchedule, onFix, onRecheck, onConfirmAutomatic, onDelete, onPreview }: { plan: ContentPlan; videos: VideoAsset[]; busy: boolean; generatingSlotIds: Set<string>; onBatch: (kind:'generate'|'retry'|'approve'|'schedule') => void; onEdit:(slot:ContentPlanSlot)=>void; onGenerate:(slot:ContentPlanSlot)=>Promise<void>|void; onRemove:(slot:ContentPlanSlot)=>void; onApprove:(slot:ContentPlanSlot)=>void; onSchedule:(slot:ContentPlanSlot)=>void; onFix:(slot:ContentPlanSlot)=>Promise<void>|void; onRecheck:(slot:ContentPlanSlot)=>Promise<void>|void; onConfirmAutomatic:()=>void; onDelete:()=>void; onPreview:(slot:ContentPlanSlot, trigger:HTMLElement)=>void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const planned = plan.slots.filter((slot) => slot.status === 'planned').length;
  const failed = plan.slots.filter((slot) => slot.status === 'failed' && !slot.post && !slot.scheduleUncertain).length;
  const approved = plan.slots.filter((slot) => slot.status === 'approved').length;
  const ready = plan.slots.filter((slot) => slot.status === 'ready_for_review' && slot.qualityReport?.status !== 'blocked').length;
  const visibleSlots = plan.slots.filter((slot) => slot.status !== 'removed').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const results = visibleSlots.reduce((summary, slot) => {
    if (slot.status === 'failed') summary.failed++;
    else if (slot.status === 'needs_attention' || slot.qualityReport?.status === 'blocked') summary.attention++;
    else if (slot.qualityReport?.status === 'warnings') summary.warnings++;
    else if (slot.qualityReport?.status === 'passed') summary.ready++;
    return summary;
  }, { ready: 0, warnings: 0, attention: 0, failed: 0 });
  const hasResults = Object.values(results).some(Boolean);

  return <div className="p-4 sm:p-6">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 className="text-[17px] font-semibold text-ink">{plan.name}</h3>
        <p className="mt-1 text-[11px] text-ink-6">{plan.config.startDate}–{plan.config.endDate} · {plan.config.timezone} · <span className="capitalize">{plan.config.approvalMode} approval</span></p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Sparkles size={12} />} disabled={busy || !planned} onClick={() => onBatch('generate')}>Generate remaining ({planned})</Button>
        <Button size="sm" disabled={busy || !ready} onClick={() => onBatch('approve')}>Approve ready ({ready})</Button>
        <Button size="sm" variant="primary" disabled={busy || !approved} onClick={() => onBatch('schedule')}>Schedule approved ({approved})</Button>
        {failed > 0 && <Button size="sm" icon={<RefreshCw size={12} />} disabled={busy} onClick={() => onBatch('retry')}>Retry failed ({failed})</Button>}
      </div>
    </div>

    {hasResults && <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-5" aria-label="Quality summary">
      <span><strong className="font-semibold text-success">{results.ready}</strong> Ready</span>
      <span><strong className="font-semibold text-warning">{results.warnings}</strong> Warnings</span>
      <span><strong className="font-semibold text-danger">{results.attention}</strong> Needs attention</span>
      <span><strong className="font-semibold text-danger">{results.failed}</strong> Failed</span>
    </div>}

    {plan.config.approvalMode === 'automatic' && !plan.automaticSchedulingConfirmedAt && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-warning/20 bg-amber-500/[0.07] px-3 py-2.5"><p className="text-[11px] leading-relaxed text-ink-3">Automatic scheduling needs one explicit confirmation. Posts with blockers will remain in Needs attention.</p><Button size="sm" variant="primary" onClick={onConfirmAutomatic}>Confirm automatic scheduling</Button></div>}

    <div className="border-y border-line">
      {visibleSlots.map((slot) => <PlanSlotRow
        key={slot.id}
        slot={slot}
        busy={busy}
        generating={
          slot.status === 'generating'
          || (generatingSlotIds.has(slot.id) && slot.status !== 'quality_check')
        }
        expanded={expandedId === slot.id}
        menuOpen={menuId === slot.id}
        videoAvailable={slot.format !== 'video' || videos.some((video) => video.id === plan.config.videoId)}
        onToggle={() => { setExpandedId((current) => current === slot.id ? null : slot.id); setMenuId(null); }}
        onToggleMenu={() => setMenuId((current) => current === slot.id ? null : slot.id)}
        onEdit={() => { setMenuId(null); onEdit(slot); }}
        onGenerate={() => { setMenuId(null); void onGenerate(slot); }}
        onRemove={() => { setMenuId(null); onRemove(slot); }}
        onApprove={() => onApprove(slot)}
        onSchedule={() => onSchedule(slot)}
        onFix={() => onFix(slot)}
        onRecheck={() => onRecheck(slot)}
        onPreview={(trigger) => onPreview(slot, trigger)}
      />)}
    </div>
    <div className="mt-5 flex justify-end"><Button variant="danger-ghost" icon={<Trash2 size={13} />} disabled={busy} onClick={onDelete}>Delete plan</Button></div>
  </div>;
}

function slotBadge(slot: ContentPlanSlot) {
  if (slot.conflicts.length) return { label: 'Needs attention', className: 'border-danger/30 bg-red-500/10 text-danger' };
  if (slot.status === 'failed') return { label: 'Failed', className: 'border-danger/30 bg-red-500/10 text-danger' };
  if (['generating', 'quality_check', 'scheduling'].includes(slot.status)) return { label: slot.status === 'scheduling' ? 'Scheduling' : 'Processing', className: 'border-accent/30 bg-sky-500/10 text-accent' };
  if (slot.status === 'scheduled') return { label: 'Scheduled', className: 'border-success/30 bg-green-500/10 text-success' };
  if (slot.status === 'approved') return { label: 'Approved', className: 'border-accent/30 bg-sky-500/10 text-accent' };
  if (slot.status === 'needs_attention' || slot.qualityReport?.status === 'blocked') return { label: 'Needs attention', className: 'border-danger/30 bg-red-500/10 text-danger' };
  if (slot.qualityReport?.status === 'warnings') return { label: `Ready · ${slot.qualityReport.summary.warnings} warning${slot.qualityReport.summary.warnings === 1 ? '' : 's'}`, className: 'border-warning/30 bg-amber-500/10 text-warning' };
  if (slot.qualityReport?.status === 'passed') return { label: 'Ready', className: 'border-success/30 bg-green-500/10 text-success' };
  return { label: 'Planned', className: 'border-line bg-white/[0.03] text-ink-5' };
}

function PlanSlotRow({ slot, busy, generating, expanded, menuOpen, videoAvailable, onToggle, onToggleMenu, onEdit, onGenerate, onRemove, onApprove, onSchedule, onFix, onRecheck, onPreview }: { slot: ContentPlanSlot; busy:boolean; generating:boolean; expanded:boolean; menuOpen:boolean; videoAvailable:boolean; onToggle:()=>void; onToggleMenu:()=>void; onEdit:()=>void; onGenerate:()=>void; onRemove:()=>void; onApprove:()=>void; onSchedule:()=>void; onFix:()=>Promise<void>|void; onRecheck:()=>Promise<void>|void; onPreview:(trigger:HTMLElement)=>void }) {
  const canEdit = !['scheduling','scheduled'].includes(slot.status);
  const preview = plannerPreviewAvailability(slot, videoAvailable);
  const badge = slotBadge(slot);
  const date = new Date(slot.scheduledAt).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const regionId = `planner-slot-${slot.id}`;
  return <article className="relative border-b border-line last:border-b-0">
    <div className="flex items-center gap-2 py-3">
      <button type="button" aria-label={`Preview ${slot.topic}`} title={preview.reason || 'Preview post'} disabled={!preview.enabled} onClick={(event) => onPreview(event.currentTarget)} className="relative h-[72px] w-[48px] shrink-0 overflow-hidden rounded-md bg-black/25 outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-50">
          {slot.post?.slides[0] ? <SlidePreview slide={slot.post.slides[0]} format={slot.post.format} notesData={slot.post.notesData} slideIndex={0} showText={false} className="h-full w-full rounded-md" /> : <div className="flex h-full items-center justify-center text-ink-6"><Image size={16} /></div>}
          {!!slot.post?.slides.length && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[8px] text-white">{slot.post.slides.length}</span>}
      </button>
      <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={regionId} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/70 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-[12px] font-semibold text-ink">{date}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${badge.className}`}>{badge.label}</span><span className="inline-flex h-4 w-[66px] shrink-0 items-center">{generating && <TextBlink className="text-[10px] font-medium text-accent" />}</span></div>
          <p className="mt-1 truncate text-[12px] font-medium text-ink-3">{slot.topic} <span className="font-normal text-ink-6">· {slot.pillar}</span></p>
          <p className="mt-1 line-clamp-1 text-[10px] leading-relaxed text-ink-5">{slot.post?.caption || 'Not generated yet'}</p>
        </div>
        <ChevronDown size={14} className={`hidden shrink-0 text-ink-6 transition-transform sm:block ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <Button size="sm" variant="secondary" icon={<Eye size={11} />} onClick={(event) => onPreview(event.currentTarget)} disabled={!preview.enabled} title={preview.reason || 'Preview post'} className="hidden sm:inline-flex">Preview</Button>
      {slot.status === 'ready_for_review' && <Button size="sm" variant="primary" icon={<Check size={11} />} onClick={onApprove} disabled={busy || slot.qualityReport?.status === 'blocked'} className="hidden sm:inline-flex">Approve</Button>}
      {slot.status === 'approved' && <Button size="sm" variant="primary" icon={<Play size={11} />} onClick={onSchedule} disabled={busy || slot.conflicts.length > 0} className="hidden sm:inline-flex">Schedule</Button>}

      <div className="relative shrink-0">
        <button type="button" aria-label={`Actions for ${slot.topic}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={onToggleMenu} disabled={busy || !canEdit} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-5 hover:bg-white/5 hover:text-ink disabled:opacity-40"><MoreHorizontal size={16} /></button>
        {menuOpen && <div role="menu" className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-2xl">
          <button role="menuitem" type="button" onClick={onEdit} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-ink-3 hover:bg-white/5"><Pencil size={12} /> Edit</button>
          <button role="menuitem" type="button" onClick={onGenerate} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-ink-3 hover:bg-white/5"><Sparkles size={12} /> {slot.post ? 'Regenerate' : 'Generate'}</button>
          <button role="menuitem" type="button" onClick={onRemove} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-danger hover:bg-red-500/10"><Trash2 size={12} /> Remove</button>
        </div>}
      </div>
    </div>

    {expanded && <div id={regionId} className="pb-4 pl-[60px] pr-1 sm:pl-16">
      <div className="grid gap-4 text-[11px] sm:grid-cols-[minmax(0,1fr)_minmax(16rem,1.2fr)]">
        <div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-ink-5">
            <div><dt className="text-[9px] uppercase tracking-wide text-ink-6">Format</dt><dd className="mt-0.5 capitalize text-ink-3">{slot.format}</dd></div>
            <div><dt className="text-[9px] uppercase tracking-wide text-ink-6">Accounts</dt><dd className="mt-0.5 text-ink-3">{slot.socialAccountIds.length}</dd></div>
            <div className="col-span-2"><dt className="text-[9px] uppercase tracking-wide text-ink-6">Background folder</dt><dd className="mt-0.5 truncate text-ink-3">{slot.backgroundSelection || 'Automatic selection'}</dd></div>
          </dl>
          {slot.post?.slides.length ? <p className="mt-3 text-[10px] text-ink-6">{slot.post.slides.length} rendered slide{slot.post.slides.length === 1 ? '' : 's'} · Open Preview to inspect full media.</p> : null}
        </div>
        <div>
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-ink-4">{slot.post?.caption || 'Generate this slot to review its caption and quality.'}</p>
          {slot.error && <p className="mt-3 border-l-2 border-danger pl-2 text-[10px] text-danger">{slot.error}</p>}
          {slot.post && <PlannerQuality report={slot.qualityReport} busy={busy} onFix={onFix} onRecheck={onRecheck} />}
          <div className="mt-3 flex flex-wrap gap-2 sm:hidden"><Button size="sm" variant="secondary" icon={<Eye size={11} />} onClick={(event) => onPreview(event.currentTarget)} disabled={!preview.enabled} title={preview.reason || 'Preview post'}>Preview</Button>{slot.status === 'ready_for_review' && <Button size="sm" variant="primary" onClick={onApprove} disabled={busy || slot.qualityReport?.status === 'blocked'}>Approve</Button>}{slot.status === 'approved' && <Button size="sm" variant="primary" onClick={onSchedule} disabled={busy || slot.conflicts.length > 0}>Schedule</Button>}</div>
          {!preview.enabled && preview.reason && <p className="mt-2 text-[10px] text-ink-6">{preview.reason}</p>}
        </div>
      </div>
    </div>}
  </article>;
}

function PlannerQuality({ report, busy, onFix, onRecheck }: { report: ContentPlanSlot['qualityReport']; busy: boolean; onFix:()=>Promise<void>|void; onRecheck:()=>Promise<void>|void }) {
  const blockers = report?.findings.filter((finding) => finding.severity === 'blocking') || [];
  const warnings = report?.findings.filter((finding) => finding.severity === 'warning') || [];
  const hasSafeFix = report?.findings.some((finding) => finding.fix === 'safe');
  const Icon = !report || blockers.length ? ShieldAlert : warnings.length ? AlertTriangle : CheckCircle2;
  const label = !report ? 'Not checked' : blockers.length ? `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}` : warnings.length ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : 'Ready to publish';
  const color = !report ? 'text-ink-5' : blockers.length ? 'text-danger' : warnings.length ? 'text-warning' : 'text-success';
  return <div className="mt-4 border-t border-line pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className={`flex items-center gap-1.5 text-[11px] font-medium ${color}`}><Icon size={13} /> {label}</span><div className="flex gap-1.5"><Button size="sm" disabled={busy} onClick={() => void onRecheck()} icon={<RefreshCw size={11} />}>Recheck</Button>{hasSafeFix && <Button size="sm" disabled={busy} onClick={() => void onFix()} icon={<Sparkles size={11} />}>Fix safe issues</Button>}</div></div>
    {blockers.length > 0 && <FindingGroup label="Blockers" findings={blockers} className="text-danger" />}
    {warnings.length > 0 && <FindingGroup label="Warnings" findings={warnings} className="text-warning" />}
    {report && !report.findings.length && <p className="mt-2 text-[10px] text-ink-6">No blocking issues or warnings detected.</p>}
  </div>;
}

function FindingGroup({ label, findings, className }: { label: string; findings: QualityFinding[]; className: string }) {
  return <div className="mt-3"><h4 className={`text-[9px] font-semibold uppercase tracking-wider ${className}`}>{label}</h4><ul className="mt-1 divide-y divide-line">{findings.map((finding) => <li key={finding.id} className="py-2"><p className="text-[10px] font-medium text-ink-3">{finding.check}{finding.slideIndex !== undefined ? ` · Slide ${finding.slideIndex + 1}` : ''}</p><p className="mt-0.5 text-[10px] leading-relaxed text-ink-5">{finding.explanation}</p></li>)}</ul></div>;
}

function SlotSummary({ slot }: { slot: ContentPlanSlot; accounts: SocialAccount[] }) {
  return <div className="grid gap-2 rounded-lg border border-line bg-raised px-3 py-2.5 sm:grid-cols-[9rem_1fr_auto]"><div className="text-[11px] text-ink-3"><Clock size={11} className="mr-1 inline" /> {slot.localDate} · {slot.localTime}</div><div className="min-w-0"><div className="truncate text-[11px] font-medium text-ink-3">{slot.topic}</div><div className="text-[9px] capitalize text-ink-6">{slot.pillar} · {slot.format} · {slot.backgroundSelection || 'automatic background'}</div></div><div className="text-[9px] uppercase tracking-wide text-ink-6">{slot.conflicts.length ? <span className="text-danger">Conflict</span> : 'Planned'}</div></div>;
}

function Label({ children }: { children: React.ReactNode }) { return <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-5">{children}</h3>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-[10px] font-medium uppercase tracking-wider text-ink-6">{label}{children}</label>; }
