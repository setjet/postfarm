import type { BrainState } from '../types';
import { ViewHeader } from '../components/ViewHeader';

interface BrainViewProps {
  brain: BrainState;
  onChange: (brain: BrainState) => void;
}

const inputClass =
  'w-full h-10 bg-raised border border-line rounded-lg px-3 text-[13px] text-ink shadow-field ' +
  'placeholder:text-ink-6 outline-none transition-colors ' +
  'focus:border-line-2';

const textareaClass =
  'w-full bg-raised border border-line rounded-lg px-3 py-2.5 text-[13px] text-ink shadow-field ' +
  'placeholder:text-ink-6 outline-none transition-colors resize-none ' +
  'focus:border-line-2';

export function BrainView({ brain, onChange }: BrainViewProps) {
  return (
    <>
      <ViewHeader
        title="Brain"
        subtitle="What the AI knows about this project. Edits apply to all future generations."
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-5">
          {/* Niche & app */}
          <Section title="Account context" description="Rarely changes. Defines who the AI is writing for.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Niche">
                <input
                  value={brain.niche}
                  onChange={(e) => onChange({ ...brain, niche: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="App name">
                <input
                  value={brain.appName}
                  onChange={(e) => onChange({ ...brain, appName: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="App description">
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
        </div>
      </div>
    </>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-ink-5 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
