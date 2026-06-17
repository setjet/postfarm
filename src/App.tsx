import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ScheduleModal } from './components/ScheduleModal';
import { BulkScheduleModal } from './components/BulkScheduleModal';
import { GenerateModal } from './components/GenerateModal';
import { GenerationLoadingCard } from './components/GenerationLoadingCard';
import { SlideshowEditorModal } from './components/SlideshowEditorModal';
import { QueueView } from './views/QueueView';
import { TrendsView } from './views/TrendsView';
import { LibraryView } from './views/LibraryView';
import { ScheduleView } from './views/ScheduleView';
import { ResultsView } from './views/ResultsView';
import { BrainView } from './views/BrainView';
import { SettingsView } from './views/SettingsView';
import { renderSlideshow } from './lib/render';
import { captionWithHashtags } from './lib/hashtags';
import * as api from './lib/api';
import type { GenerateOptions } from './lib/api';
import type { AppConfig, Project, Slideshow, Slide, SocialAccount, BrainState, ViewKey, NotesData } from './types';

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('queue');
  const [queue, setQueue] = useState<Slideshow[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [generating, setGenerating] = useState(false);
  const [scheduling, setScheduling] = useState<Slideshow | null>(null);
  const [editing, setEditing] = useState<Slideshow | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generationRun, setGenerationRun] = useState<{ count: number; options: GenerateOptions } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeAiProvider = config?.aiProvider || 'openrouter';
  const hasActiveAiKey = activeAiProvider === 'deepseek' ? !!config?.keys.deepseek : !!config?.keys.openrouter;
  const hasPostbridge = !!config?.keys.postbridge;
  const hasApify = !!config?.keys.apify;
  const activeProject: Project | undefined = config?.projects.find(
    (p) => p.id === config.activeProjectId
  ) ?? config?.projects[0];

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

  const generate = async (count: number, options: GenerateOptions = {}) => {
    setError(null);
    setGenerationRun({ count, options });
    setGenerating(true);
    setGenerateOpen(false);
    try {
      await api.generate(count, options);
      setQueue(await api.getQueue());
      setGenerateOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  // Keep the multi-select in sync as queue items come and go.
  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => queue.some((s) => s.id === id)));
  }, [queue]);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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

  const confirmSchedule = async (opts: {
    format: 'carousel' | 'video';
    socialAccounts: number[];
    mode: 'draft' | 'schedule';
    scheduledAt: string | null;
    videoId?: string;
    duration?: number;
    textPosition?: 'center' | 'top';
    watermark?: boolean;
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
            onGenerate={() => setGenerateOpen(true)}
            selectedIds={selectedIds}
            onApprove={(id) => setScheduling(queue.find((s) => s.id === id) || null)}
            onReject={reject}
            onEdit={(id) => setEditing(queue.find((s) => s.id === id) || null)}
            onRewrite={rewriteQueued}
            onToggleSelect={toggleSelect}
            onSelectAll={() => setSelectedIds(queue.map((s) => s.id))}
            onClearSelection={() => setSelectedIds([])}
            onBulkSchedule={() => setBulkOpen(true)}
          />
        )}
        {activeView === 'trends' && (
          <TrendsView
            hasApify={hasApify}
            canGenerate={hasActiveAiKey}
            generating={generating}
            onGenerateFromTrends={generateFromTrends}
          />
        )}
        {activeView === 'library' && <LibraryView hasApify={hasApify} />}
        {activeView === 'schedule' && <ScheduleView configured={hasPostbridge} />}
        {activeView === 'results' && <ResultsView configured={hasPostbridge} />}
        {activeView === 'brain' && <BrainView brain={activeProject.brain} onChange={saveBrain} />}
        {activeView === 'settings' && (
          <SettingsView
            config={config}
            project={activeProject}
            accounts={accounts}
            canDelete={config.projects.length > 1}
            onSave={saveSettings}
            onDeleteProject={() => removeProject(activeProject.id)}
            onReloadAccounts={loadAccounts}
          />
        )}
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
          generating={generating}
          error={error}
          onClose={() => setGenerateOpen(false)}
          onGenerate={generate}
        />
      )}

      {generating && generationRun && (
        <GenerationLoadingCard count={generationRun.count} options={generationRun.options} />
      )}
    </div>
  );
}

