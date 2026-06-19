import { lazy, Suspense, useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { Sidebar } from './components/Sidebar';
import { ScheduleModal } from './components/ScheduleModal';
import { BulkScheduleModal } from './components/BulkScheduleModal';
import { GenerateModal } from './components/GenerateModal';
import { GenerationLoadingCard } from './components/GenerationLoadingCard';
import { SlideshowEditorModal } from './components/SlideshowEditorModal';
import { ContentPlannerModal } from './components/ContentPlannerModal';
import { QueueView } from './views/QueueView';
import { renderSlideshow } from './lib/render';
import { captionWithHashtags } from './lib/hashtags';
import { PlannerJobController } from './lib/plannerJobController';
import * as api from './lib/api';
import type { GenerateOptions } from './lib/api';
import type { AppConfig, Project, Slideshow, Slide, SocialAccount, BrainState, ViewKey, NotesData } from './types';

const TrendsView = lazy(() => import('./views/TrendsView').then((module) => ({ default: module.TrendsView })));
const LibraryView = lazy(() => import('./views/LibraryView').then((module) => ({ default: module.LibraryView })));
const ScheduleView = lazy(() => import('./views/ScheduleView').then((module) => ({ default: module.ScheduleView })));
const ResultsView = lazy(() => import('./views/ResultsView').then((module) => ({ default: module.ResultsView })));
const LearningView = lazy(() => import('./views/LearningView').then((module) => ({ default: module.LearningView })));
const BrainView = lazy(() => import('./views/BrainView').then((module) => ({ default: module.BrainView })));
const SettingsView = lazy(() => import('./views/SettingsView').then((module) => ({ default: module.SettingsView })));

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('queue');
  const [queue, setQueue] = useState<Slideshow[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [generating, setGenerating] = useState(false);
  const [scheduling, setScheduling] = useState<Slideshow | null>(null);
  const [editing, setEditing] = useState<Slideshow | null>(null);
  const [selectedIdCandidates, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerPlanId, setPlannerPlanId] = useState<string | null>(null);
  const [plannerJobs] = useState(() => new PlannerJobController({
    generateSlot: api.generateContentPlanSlot,
    getPlan: api.getContentPlan,
    renderSlot: async (slot) => slot.format === 'video' || !slot.post ? undefined : renderSlideshow(slot.post),
    scheduleSlot: (plan, slot, slides) => api.scheduleContentPlanSlot(plan.id, slot.id, {
      slides,
      videoId: plan.config.videoId || undefined,
      duration: 12,
      textPosition: 'center',
      watermark: true,
    }),
  }));
  const plannerJob = useSyncExternalStore(plannerJobs.subscribe, plannerJobs.getSnapshot, plannerJobs.getSnapshot);
  const [generationRun, setGenerationRun] = useState<{ count: number; options: GenerateOptions } | null>(null);
  const [failedGeneration, setFailedGeneration] = useState<{ count: number; options: GenerateOptions } | null>(null);
  const [generatePreset, setGeneratePreset] = useState<GenerateOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeAiProvider = config?.aiProvider || 'openrouter';
  const hasActiveAiKey = activeAiProvider === 'deepseek' ? !!config?.keys.deepseek : !!config?.keys.openrouter;
  const hasPostbridge = !!config?.keys.postbridge;
  const hasApify = !!config?.keys.apify;
  const activeProject: Project | undefined = config?.projects.find(
    (p) => p.id === config.activeProjectId
  ) ?? config?.projects[0];
  const selectedIds = selectedIdCandidates.filter((id) => queue.some((show) => show.id === id));

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await api.getAccounts());
    } catch {
      setAccounts([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.getConfig();
        setConfig(cfg);
        setQueue(await api.getQueue());
        const hasAiKey = cfg.aiProvider === 'deepseek' ? !!cfg.keys.deepseek : !!cfg.keys.openrouter;
        if (!hasAiKey && !cfg.keys.postbridge) setActiveView('settings');
        if (cfg.keys.postbridge) loadAccounts();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reach the Slidesmith server.');
      }
    })();
  }, [loadAccounts]);

  useEffect(() => {
    const refreshLibraryReferences = () => {
      void api.getQueue().then(setQueue).catch(() => {});
      void api.getConfig().then(setConfig).catch(() => {});
    };
    window.addEventListener('slidesmith:library-changed', refreshLibraryReferences);
    return () => window.removeEventListener('slidesmith:library-changed', refreshLibraryReferences);
  }, []);

  const generate = async (count: number, options: GenerateOptions = {}) => {
    setError(null);
    setGeneratePreset(null);
    setGenerationRun({ count, options });
    setGenerating(true);
    setGenerateOpen(false);
    try {
      await api.generate(count, options);
      setQueue(await api.getQueue());
      setFailedGeneration(null);
      setGenerateOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFailedGeneration({ count, options });
      setGenerateOpen(true);
    } finally {
      setGenerating(false);
      setGenerationRun(null);
    }
  };

  const generateFromTrends = async (trendIds?: string[]) => {
    await generate(3, {
      packs: activeProject?.imagePacks || [],
      useTrends: !trendIds,
      trendIds,
      useLearning: true,
      qualityMode: 'normal',
      minScore: 7,
      maxRewriteAttempts: 1,
    });
    setActiveView('queue');
  };

  const reject = async (id: string) => {
    setQueue(await api.removeFromQueue(id));
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const openGenerate = () => {
    setError(null);
    setFailedGeneration(null);
    setGeneratePreset(null);
    setGenerateOpen(true);
  };

  const openLearningIdea = useCallback((topic: string) => {
    setError(null);
    setFailedGeneration(null);
    setGeneratePreset({ topicMode: 'custom', topic });
    setGenerateOpen(true);
  }, []);

  const closeGenerate = () => {
    setFailedGeneration(null);
    setGeneratePreset(null);
    setGenerateOpen(false);
  };

  const bulkDone = async () => {
    setBulkOpen(false);
    setSelectedIds([]);
    setQueue(await api.getQueue());
    setActiveView('schedule');
  };

  const saveEdits = async (patch: {
    slides: Slide[];
    caption: string;
    hashtags: string[];
    hook?: string;
    notesData?: NotesData;
    format?: Slideshow['format'];
  }) => {
    if (!editing) return;
    setQueue(await api.updateSlideshow(editing.id, patch));
    setEditing(null);
  };

  const rewriteQueued = async (id: string, note?: string) => {
    setError(null);
    try {
      setQueue(await api.rewriteSlideshow(id, note));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const checkQueuedQuality = async (id: string) => {
    setQueue(await api.checkQueueQuality(id));
  };

  const fixQueuedQuality = async (id: string) => {
    setQueue(await api.fixQueueQuality(id));
  };

  const confirmSchedule = async (opts: {
    format: 'carousel' | 'video';
    socialAccounts: number[];
    mode: 'draft' | 'schedule';
    scheduledAt: string | null;
    videoId?: string;
    duration?: number;
    textPosition?: 'center' | 'top';
    watermark?: boolean;
    timezone?: string;
    warningsAcknowledged?: boolean;
  }) => {
    if (!scheduling) return;
    const scheduledId = scheduling.id;
    const caption = captionWithHashtags(scheduling.caption, scheduling.hashtags);
    if (opts.format === 'video') {
      if (!opts.videoId) throw new Error('Select a background video.');
      await api.scheduleVideo({
        id: scheduledId,
        caption,
        socialAccounts: opts.socialAccounts,
        scheduledAt: opts.scheduledAt,
        mode: opts.mode,
        videoId: opts.videoId,
        duration: opts.duration ?? 12,
        textPosition: opts.textPosition ?? 'center',
        watermark: opts.watermark ?? true,
        timezone: opts.timezone,
        warningsAcknowledged: opts.warningsAcknowledged,
      });
    } else {
      const slides = await renderSlideshow(scheduling);
      await api.schedule({
        id: scheduledId,
        caption,
        slides,
        socialAccounts: opts.socialAccounts,
        scheduledAt: opts.scheduledAt,
        mode: opts.mode,
        timezone: opts.timezone,
        warningsAcknowledged: opts.warningsAcknowledged,
      });
    }
    // Drop the now-scheduled slideshow from the queue immediately (optimistic),
    // then reconcile with the server. The modal stays open showing its success
    // state with a link to post-bridge instead of us jumping to the Schedule tab.
    setQueue((q) => q.filter((s) => s.id !== scheduledId));
    setQueue(await api.getQueue());
  };

  // Global settings (keys/model) + per-project edits (name/defaults), in one call.
  const saveSettings = async (patch: {
    keys?: AppConfig['keys'];
    aiProvider?: AppConfig['aiProvider'];
    model?: string;
    models?: AppConfig['models'];
    pinterestActor?: string;
    name?: string;
    defaults?: Project['defaults'];
    imagePacks?: string[];
  }) => {
    if (patch.keys || patch.model !== undefined || patch.models || patch.aiProvider !== undefined || patch.pinterestActor !== undefined) {
      await api.saveConfig({
        keys: patch.keys,
        aiProvider: patch.aiProvider,
        model: patch.model,
        models: patch.models,
        pinterestActor: patch.pinterestActor,
      });
    }
    if (activeProject && (patch.name !== undefined || patch.defaults || patch.imagePacks)) {
      await api.updateProject(activeProject.id, {
        name: patch.name,
        defaults: patch.defaults,
        imagePacks: patch.imagePacks,
      });
    }
    setConfig(await api.getConfig());
  };

  const saveBrain = async (brain: BrainState) => {
    if (!activeProject) return;
    // Optimistic local update so typing stays snappy, then persist.
    setConfig((c) =>
      c
        ? { ...c, projects: c.projects.map((p) => (p.id === activeProject.id ? { ...p, brain } : p)) }
        : c
    );
    await api.updateProject(activeProject.id, { brain });
  };

  const switchProject = async (id: string) => {
    setConfig(await api.activateProject(id));
    setQueue(await api.getQueue());
  };

  const newProject = async () => {
    setConfig(await api.createProject());
    setQueue(await api.getQueue());
    setActiveView('settings');
  };

  const removeProject = async (id: string) => {
    setConfig(await api.deleteProject(id));
    setQueue(await api.getQueue());
  };

  if (!config || !activeProject) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-bg text-ink-5 text-[13px]">
        <div className="glass-panel rounded-xl px-4 py-3">
          {error ? <span className="text-danger max-w-sm text-center block">{error}</span> : 'Loading...'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-bg text-ink">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        queueCount={queue.length}
        scheduledCount={0}
        projects={config.projects}
        activeProjectId={config.activeProjectId}
        onSwitchProject={switchProject}
        onNewProject={newProject}
        plannerJob={plannerJob}
        onOpenPlannerJob={() => {
          setPlannerPlanId(plannerJob.planId);
          setPlannerOpen(true);
        }}
      />
      <main className="flex-1 h-full overflow-hidden flex flex-col app-main">
        {error && activeView !== 'settings' && (
          <div className="px-4 sm:px-8 py-2 bg-red-500/10 border-b border-red-500/20 text-[12px] text-danger">
            {error}
          </div>
        )}

        {activeView === 'queue' && (
          <QueueView
            slideshows={queue}
            generating={generating}
            canGenerate={hasActiveAiKey}
            onGenerate={openGenerate}
            selectedIds={selectedIds}
            onApprove={(id) => setScheduling(queue.find((s) => s.id === id) || null)}
            onReject={reject}
            onEdit={(id) => setEditing(queue.find((s) => s.id === id) || null)}
            onRewrite={rewriteQueued}
            onToggleSelect={toggleSelect}
            onSelectAll={() => setSelectedIds(queue.map((s) => s.id))}
            onClearSelection={() => setSelectedIds([])}
            onBulkSchedule={() => setBulkOpen(true)}
            onQuality={checkQueuedQuality}
            onSafeFix={fixQueuedQuality}
          />
        )}
        <Suspense fallback={<ViewLoading />}>
          {activeView === 'trends' && (
            <TrendsView
              hasApify={hasApify}
              canGenerate={hasActiveAiKey}
              generating={generating}
              onGenerateFromTrends={generateFromTrends}
            />
          )}
          {activeView === 'library' && <LibraryView hasApify={hasApify} />}
          {activeView === 'schedule' && (
            <ScheduleView
              configured={hasPostbridge}
              accounts={accounts}
              onPlanContent={() => {
                setPlannerPlanId(plannerJob.status === 'running' ? plannerJob.planId : null);
                setPlannerOpen(true);
              }}
            />
          )}
          {activeView === 'results' && <ResultsView configured={hasPostbridge} />}
          {activeView === 'learning' && <LearningView key={activeProject.id} configured={hasPostbridge} onUseIdea={openLearningIdea} />}
          {activeView === 'brain' && <BrainView brain={activeProject.brain} onChange={saveBrain} />}
          {activeView === 'settings' && (
            <SettingsView
              key={activeProject.id}
              config={config}
              project={activeProject}
              accounts={accounts}
              canDelete={config.projects.length > 1}
              onSave={saveSettings}
              onDeleteProject={() => removeProject(activeProject.id)}
              onReloadAccounts={loadAccounts}
            />
          )}
        </Suspense>
      </main>

      {scheduling && (
        <ScheduleModal
          slideshow={scheduling}
          accounts={accounts}
          defaults={activeProject.defaults}
          onClose={() => setScheduling(null)}
          onConfirm={confirmSchedule}
        />
      )}

      {editing && (
        <SlideshowEditorModal
          slideshow={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdits}
        />
      )}

      {bulkOpen && selectedIds.length > 0 && (
        <BulkScheduleModal
          slideshows={queue.filter((s) => selectedIds.includes(s.id))}
          accounts={accounts}
          defaults={activeProject.defaults}
          // Closing via the X/backdrop must still drop any now-scheduled items
          // from the queue immediately so it does not look stale until reload.
          onClose={async () => {
            setBulkOpen(false);
            setSelectedIds([]);
            setQueue(await api.getQueue());
          }}
          onDone={bulkDone}
        />
      )}

      {generateOpen && (
        <GenerateModal
          defaultPacks={activeProject.imagePacks}
          initialCount={failedGeneration?.count}
          initialOptions={failedGeneration?.options ?? generatePreset ?? undefined}
          generating={generating}
          error={error}
          onClose={closeGenerate}
          onGenerate={generate}
        />
      )}

      {generating && generationRun && (
        <GenerationLoadingCard count={generationRun.count} options={generationRun.options} />
      )}

      {plannerOpen && (
        <ContentPlannerModal
          accounts={accounts}
          onClose={() => setPlannerOpen(false)}
          onScheduled={() => setActiveView('schedule')}
          initialPlanId={plannerPlanId}
          job={plannerJob}
          onGenerate={(plan, slots) => plannerJobs.startGeneration(plan, slots)}
          onSchedule={(plan, slots) => plannerJobs.startScheduling(plan, slots)}
        />
      )}
    </div>
  );
}

function ViewLoading() {
  return <div role="status" aria-live="polite" className="flex flex-1 items-center justify-center text-[12px] text-ink-6">Loading view…</div>;
}

