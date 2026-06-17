import { useEffect, useState } from 'react';
import { Check, X, Loader2, KeyRound, Trash2, Info } from 'lucide-react';
import type { AppConfig, Project, SocialAccount, ModelOption } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { testKeys, getModels, getDeepSeekModels } from '../lib/api';
import { PackPicker } from '../components/PackPicker';

interface SettingsViewProps {
  config: AppConfig;
  project: Project;
  accounts: SocialAccount[];
  canDelete: boolean;
  onSave: (patch: {
    keys?: AppConfig['keys'];
    aiProvider?: AppConfig['aiProvider'];
    model?: string;
    models?: AppConfig['models'];
    pinterestActor?: string;
    name?: string;
    defaults?: Project['defaults'];
    imagePacks?: string[];
  }) => Promise<void>;
  onDeleteProject: () => void;
  onReloadAccounts: () => void;
}

const POSTBRIDGE_URL = 'https://post-bridge.com?atp=clip-factory';

const PostBridgeLink = ({ children }: { children: React.ReactNode }) => (
  <a href={POSTBRIDGE_URL} target="_blank" rel="noreferrer" className="text-accent underline decoration-white/20 hover:text-ink">
    {children}
  </a>
);

const inputClass =
  'w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink shadow-field ' +
  'placeholder:text-ink-6 outline-none transition-colors ' +
  'focus:border-line-2';

export function SettingsView({
  config,
  project,
  accounts,
  canDelete,
  onSave,
  onDeleteProject,
  onReloadAccounts,
}: SettingsViewProps) {
  const [postbridge, setPostbridge] = useState(config.keys.postbridge);
  const [openrouter, setOpenrouter] = useState(config.keys.openrouter);
  const [deepseek, setDeepseek] = useState(config.keys.deepseek || '');
  const [aiProvider, setAiProvider] = useState<AppConfig['aiProvider']>(config.aiProvider || 'openrouter');
  const [apify, setApify] = useState(config.keys.apify);
  const [pinterestActor, setPinterestActor] = useState(config.pinterestActor);
  const [openrouterModel, setOpenrouterModel] = useState(config.models?.openrouter || config.model);
  const [deepseekModel, setDeepseekModel] = useState(config.models?.deepseek || 'deepseek-v4-flash');
  const [name, setName] = useState(project.name);
  const [mode, setMode] = useState(project.defaults.mode);
  const [selected, setSelected] = useState<number[]>(project.defaults.socialAccountIds);
  const [imagePacks, setImagePacks] = useState<string[]>(project.imagePacks);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [deepseekModels, setDeepseekModels] = useState<ModelOption[]>([
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
  ]);
  const [modelFilter, setModelFilter] = useState('');
  const [deepseekCustom, setDeepseekCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [test, setTest] = useState<{ postbridge: boolean; openrouter: boolean; deepseek: boolean; apify: boolean; errors: Record<string, string> } | null>(null);

  // Re-sync editable fields when the active project changes (switching projects).
  useEffect(() => {
    setName(project.name);
    setMode(project.defaults.mode);
    setSelected(project.defaults.socialAccountIds);
    setImagePacks(project.imagePacks);
  }, [project.id, project.name, project.defaults.mode, project.defaults.socialAccountIds, project.imagePacks]);

  useEffect(() => {
    getModels().then(setModels).catch(() => setModels([]));
    getDeepSeekModels().then(setDeepseekModels).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSave({
        keys: { postbridge, openrouter, deepseek, apify },
        aiProvider,
        model: openrouterModel,
        models: { openrouter: openrouterModel, deepseek: deepseekModel },
        pinterestActor,
        name,
        defaults: { socialAccountIds: selected, mode },
        imagePacks,
      });
      onReloadAccounts();
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      await save();
      setTest(await testKeys());
      onReloadAccounts();
    } finally {
      setTesting(false);
    }
  };

  const toggleAccount = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const filtered = modelFilter
    ? models.filter(
        (m) =>
          m.id.toLowerCase().includes(modelFilter.toLowerCase()) ||
          m.name.toLowerCase().includes(modelFilter.toLowerCase())
      )
    : models;
  const activeProviderLabel = aiProvider === 'deepseek' ? 'DeepSeek' : 'OpenRouter';
  const deepseekModelIsListed = deepseekModels.some((m) => m.id === deepseekModel);

  return (
    <>
      <ViewHeader
        title="Settings"
        subtitle="Your own API keys, stored locally on this machine — never sent anywhere but the services they belong to."
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-5">
          {/* Project */}
          <Section
            title="Project"
            description="A project is one brand/account. Its Brain and default posting accounts are separate — your API keys and model are shared across all projects."
          >
            <Field label="Project name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            {canDelete && (
              <Button variant="danger-ghost" icon={<Trash2 size={13} />} onClick={onDeleteProject}>
                Delete this project
              </Button>
            )}
          </Section>

          {/* Keys (global) */}
          <Section
            title="API keys"
            description="Shared across all projects. Stored in ~/.slidesmith/config.json on your computer."
          >
            <Field
              label="post-bridge API key"
              hint={<>Handles scheduling, posting &amp; analytics. Get one at <PostBridgeLink>post-bridge.com</PostBridgeLink>.</>}
            >
              <input
                value={postbridge}
                onChange={(e) => setPostbridge(e.target.value)}
                placeholder="pb_..."
                className={`${inputClass} font-mono`}
              />
              <TestBadge ok={test?.postbridge} error={test?.errors?.postbridge} />
            </Field>
            <Field label="AI provider" hint={`${activeProviderLabel} is used for generation, scoring, rewrites, trends, and learning.`}>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAiProvider('openrouter')}
                  className={`h-10 rounded-lg border px-3 text-[12px] font-semibold transition-colors ${
                    aiProvider === 'openrouter'
                      ? 'border-accent/70 bg-accent/15 text-ink'
                      : 'border-line bg-raised text-ink-4 hover:border-line-2 hover:text-ink'
                  }`}
                >
                  OpenRouter
                </button>
                <button
                  type="button"
                  onClick={() => setAiProvider('deepseek')}
                  className={`h-10 rounded-lg border px-3 text-[12px] font-semibold transition-colors ${
                    aiProvider === 'deepseek'
                      ? 'border-accent/70 bg-accent/15 text-ink'
                      : 'border-line bg-raised text-ink-4 hover:border-line-2 hover:text-ink'
                  }`}
                >
                  DeepSeek
                </button>
              </div>
            </Field>
            <Field label="OpenRouter API key" hint="Runs the AI that writes your slideshows — one key, any model. Get one at openrouter.ai/keys.">
              <input
                value={openrouter}
                onChange={(e) => setOpenrouter(e.target.value)}
                placeholder="sk-or-..."
                className={`${inputClass} font-mono`}
              />
              <TestBadge ok={test?.openrouter} error={test?.errors?.openrouter} />
            </Field>
            <Field label="DeepSeek API key" hint="Used when DeepSeek is the selected AI provider.">
              <input
                value={deepseek}
                onChange={(e) => setDeepseek(e.target.value)}
                placeholder="sk-..."
                className={`${inputClass} font-mono`}
              />
              <TestBadge ok={test?.deepseek} error={test?.errors?.deepseek} />
            </Field>
            <Field label="Apify API key (optional)" hint="Only needed to scrape MORE Pinterest images. The bundled aesthetic packs work without it. Get one at console.apify.com.">
              <input
                value={apify}
                onChange={(e) => setApify(e.target.value)}
                placeholder="apify_api_..."
                className={`${inputClass} font-mono`}
              />
              <TestBadge ok={test?.apify} error={test?.errors?.apify} />
            </Field>
            <Field label="Pinterest Apify actor" hint="The Apify actor used for scraping. Change only if you prefer a different one.">
              <input
                value={pinterestActor}
                onChange={(e) => setPinterestActor(e.target.value)}
                placeholder="fatihtahta/pinterest-scraper-search"
                className={`${inputClass} font-mono`}
              />
            </Field>
            {aiProvider === 'openrouter' ? (
              <Field label="OpenRouter model" hint={`Pick any model OpenRouter offers${models.length ? ` (${models.length} available)` : ''}.`}>
              <input
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                placeholder="Filter models... e.g. claude, gpt, llama"
                className={`${inputClass} mb-2`}
              />
              <select value={openrouterModel} onChange={(e) => setOpenrouterModel(e.target.value)} className={inputClass}>
                {openrouterModel && !filtered.some((m) => m.id === openrouterModel) && <option value={openrouterModel}>{openrouterModel}</option>}
                {filtered.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              </Field>
            ) : (
              <Field label="DeepSeek model" hint="Choose a DeepSeek model or enter a custom model ID.">
                <select
                  value={deepseekModelIsListed ? deepseekModel : 'custom'}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setDeepseekModel(deepseekCustom);
                    } else {
                      setDeepseekModel(e.target.value);
                    }
                  }}
                  className={`${inputClass} mb-2`}
                >
                  {deepseekModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                  <option value="custom">Custom model ID</option>
                </select>
                <input
                  value={deepseekModelIsListed ? deepseekCustom : deepseekModel}
                  onChange={(e) => {
                    setDeepseekCustom(e.target.value);
                    setDeepseekModel(e.target.value.trim());
                  }}
                  placeholder="deepseek-v4-flash"
                  className={`${inputClass} font-mono`}
                />
              </Field>
            )}
          </Section>

          {/* Posting defaults (per project) */}
          <Section
            title="Posting defaults"
            description="Which connected accounts this project posts to, and whether to schedule directly or save as a draft in post-bridge."
          >
            {accounts.length === 0 ? (
              <p className="text-[12px] text-ink-5">
                No connected accounts yet. Add your post-bridge key above, hit Test, then connect
                accounts at <PostBridgeLink>post-bridge.com</PostBridgeLink> — they'll appear here.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {accounts.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-line bg-raised cursor-pointer hover:border-line-2"
                  >
                    <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggleAccount(a.id)} />
                    <span className="text-[13px] text-ink font-medium">{a.username}</span>
                    <span className="text-[11px] text-ink-5 uppercase tracking-wide">{a.platform}</span>
                  </label>
                ))}
              </div>
            )}

            <Field label="Default mode">
              <div className="flex gap-2">
                <Button variant={mode === 'draft' ? 'primary' : 'secondary'} onClick={() => setMode('draft')}>
                  Save as draft
                </Button>
                <Button variant={mode === 'schedule' ? 'primary' : 'secondary'} onClick={() => setMode('schedule')}>
                  Schedule directly
                </Button>
              </div>
            </Field>
            <DraftNote />
          </Section>

          {/* Background packs (per project) */}
          <Section
            title="Background packs"
            description="Which image packs new slideshows pull backgrounds from when you hit Generate. Select none to generate with plain gradients."
          >
            <PackPicker selected={imagePacks} onChange={setImagePacks} />
          </Section>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="lg"
              icon={saving ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
            <Button variant="secondary" size="lg" onClick={runTest} disabled={testing || saving}>
              {testing ? <Loader2 size={13} className="animate-spin" /> : null}
              Test connection
            </Button>
            {saved && !saveError && (
              <span className="text-[12px] text-success flex items-center gap-1">
                <Check size={13} /> Saved
              </span>
            )}
            {saveError && (
              <span className="text-[12px] text-danger flex items-center gap-1">
                <X size={13} /> {saveError}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function DraftNote() {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-[#101010] border border-line">
      <Info size={13} className="text-accent mt-0.5 shrink-0" />
      <p className="text-[12px] text-ink-4 leading-snug">
        <span className="font-medium text-ink-3">Drafts vs. scheduling:</span> drafts land in your
        post-bridge inbox to post by hand. You won't get analytics back on drafts — TikTok only
        reports on content it publishes itself — but posting manually avoids automation detection,
        so reach potential is often higher. Scheduling posts automatically and does report analytics.
      </p>
    </div>
  );
}

function TestBadge({ ok, error }: { ok?: boolean; error?: string }) {
  if (ok === undefined) return null;
  return ok ? (
    <p className="text-[11px] text-success mt-1 flex items-center gap-1">
      <Check size={11} /> Connected
    </p>
  ) : (
    <p className="text-[11px] text-danger mt-1 flex items-center gap-1">
      <X size={11} /> {error || 'Failed'}
    </p>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4 shadow-main fade-up">
      <div>
        <h2 className="text-[12px] font-semibold text-ink-3 uppercase tracking-[0.12em]">{title}</h2>
        <p className="text-[12px] text-ink-5 mt-1 leading-relaxed">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-ink-5 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-ink-6 mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}
