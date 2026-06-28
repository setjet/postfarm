import { useState } from 'react';
import type { BrainState, HashtagStrategy } from '../types';
import { ViewHeader } from '../components/ViewHeader';

interface BrainViewProps {
  brain: BrainState;
  hashtagStrategy?: HashtagStrategy;
  onChange: (brain: BrainState) => void;
  onHashtagStrategyChange: (strategy: HashtagStrategy) => void;
}

const inputClass =
  'w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink shadow-field ' +
  'placeholder:text-ink-6 outline-none transition-colors ' +
  'focus:border-line-2';

const textareaClass =
  'w-full bg-raised border border-line rounded-lg px-3 py-2.5 text-[13px] text-ink shadow-field ' +
  'placeholder:text-ink-6 outline-none transition-colors resize-none ' +
  'focus:border-line-2';

const DEFAULT_STRATEGY: Required<HashtagStrategy> = {
  preferred: [], required: [], banned: [], brand: [], niche: [], tools: [],
  style: 'balanced', count: 8, trendInfluence: 'balanced', avoidGeneric: true, notes: '',
};

export function BrainView({ brain, hashtagStrategy, onChange, onHashtagStrategyChange }: BrainViewProps) {
  const strategy = { ...DEFAULT_STRATEGY, ...hashtagStrategy };
  const updateStrategy = (patch: Partial<HashtagStrategy>) => onHashtagStrategyChange({ ...strategy, ...patch });
  return (
    <>
      <ViewHeader
        title="Brain"
        subtitle="What the AI knows about this project. Edits apply to all future generations."
      />

      <div className="flex-1 overflow-y-auto">
        <div className="page-content max-w-[1040px] space-y-5">
          {/* Niche & app */}
          <Section title="Account context" description="Rarely changes. Defines who the AI is writing for.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Niche">
                <input
                  value={brain.niche}
                  onChange={(e) => onChange({ ...brain, niche: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Brand or project name">
                <input
                  value={brain.appName}
                  onChange={(e) => onChange({ ...brain, appName: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
              <Field label="Brand or project description">
              <textarea
                value={brain.appDescription}
                onChange={(e) => onChange({ ...brain, appDescription: e.target.value })}
                rows={2}
                className={textareaClass}
              />
            </Field>
            <Field label="Audience">
              <input
                value={brain.audience}
                onChange={(e) => onChange({ ...brain, audience: e.target.value })}
                className={inputClass}
              />
            </Field>
          </Section>

          {/* Style memory */}
          <Section
            title="Style memory"
            description="The voice and patterns that work for you. Describe your hooks, slide structure, and CTAs — the AI follows this closely."
          >
            <textarea
              value={brain.styleMemory}
              onChange={(e) => onChange({ ...brain, styleMemory: e.target.value })}
              rows={16}
              className={`${textareaClass} font-mono text-[12px] leading-relaxed`}
            />
          </Section>

          <Section
            title="Hashtag strategy"
            description="Project-level rules for hashtags in every future generation, rewrite, video, and Planner post."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TagListField label="Preferred hashtags" value={strategy.preferred} placeholder="contenttips, creatorworkflow, yourniche" onCommit={(preferred) => updateStrategy({ preferred })} />
              <TagListField label="Required hashtags" value={strategy.required} placeholder="yourbrand" onCommit={(required) => updateStrategy({ required })} />
              <TagListField label="Banned hashtags" value={strategy.banned} placeholder="fyp, viral, followforfollow" onCommit={(banned) => updateStrategy({ banned })} />
              <TagListField label="Brand hashtags" value={strategy.brand} placeholder="yourbrand" onCommit={(brand) => updateStrategy({ brand })} />
              <TagListField label="Niche hashtags" value={strategy.niche} placeholder="creatortips, contentstrategy" onCommit={(niche) => updateStrategy({ niche })} />
              <TagListField label="Tool / product hashtags" value={strategy.tools} placeholder="aitools, workflows, yourproduct" onCommit={(tools) => updateStrategy({ tools })} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Hashtag style">
                <select value={strategy.style} onChange={(event) => updateStrategy({ style: event.target.value as HashtagStrategy['style'] })} className={inputClass}>
                  <option value="balanced">Balanced</option>
                  <option value="broad">Broad reach</option>
                  <option value="niche">Niche specific</option>
                  <option value="tool">Tool-focused</option>
                  <option value="product">Product-focused</option>
                  <option value="minimal">Minimal</option>
                </select>
              </Field>
              <Field label="Default count">
                <select value={strategy.count} onChange={(event) => updateStrategy({ count: Number(event.target.value) as HashtagStrategy['count'] })} className={inputClass}>
                  {[3, 5, 8, 10].map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </Field>
              <Field label="Trend influence">
                <select value={strategy.trendInfluence} onChange={(event) => updateStrategy({ trendInfluence: event.target.value as HashtagStrategy['trendInfluence'] })} className={inputClass}>
                  <option value="off">Off</option>
                  <option value="light">Light</option>
                  <option value="balanced">Balanced</option>
                  <option value="strong">Strong</option>
                </select>
              </Field>
            </div>

            <label className="flex items-center gap-2.5 rounded-xl border border-line bg-raised px-3 py-2.5 text-[12px] text-ink-3">
              <input type="checkbox" checked={strategy.avoidGeneric} onChange={(event) => updateStrategy({ avoidGeneric: event.target.checked })} />
              Avoid generic tags like #fyp, #viral, and #explorepage
            </label>

            <CommitTextarea
              label="Extra hashtag instructions"
              value={strategy.notes}
              placeholder="Use hashtags that attract your audience. Avoid generic or spammy tags."
              onCommit={(notes) => updateStrategy({ notes })}
            />
          </Section>
        </div>
      </div>
    </>
  );
}

function parseTags(value: string) {
  return [...new Set(value.split(/[\s,]+/).map((tag) => tag.replace(/^#+/, '').trim().toLowerCase()).filter(Boolean))];
}

function TagListField({ label, value, placeholder, onCommit }: { label: string; value: string[]; placeholder: string; onCommit: (tags: string[]) => void }) {
  const [draft, setDraft] = useState(value.join('\n'));
  const commit = () => {
    const tags = parseTags(draft);
    setDraft(tags.join('\n'));
    onCommit(tags);
  };
  return (
    <Field label={label}>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} rows={3} placeholder={placeholder} className={textareaClass} />
    </Field>
  );
}

function CommitTextarea({ label, value, placeholder, onCommit }: { label: string; value: string; placeholder: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    const next = draft.trim();
    setDraft(next);
    onCommit(next);
  };
  return (
    <Field label={label}>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 1000))} onBlur={commit} rows={3} maxLength={1000} placeholder={placeholder} className={textareaClass} />
    </Field>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="fade-up space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-main sm:p-7">
      <div>
        <h2 className="text-[13px] font-medium text-ink-2">{title}</h2>
        <p className="mt-1 text-[11px] leading-5 text-ink-6">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-ink-4">{label}</label>
      {children}
    </div>
  );
}
