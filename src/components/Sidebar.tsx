import { useState } from 'react';
import {
  Brain, CalendarClock, Check, ChevronLeft, ChevronsUpDown, Images, LayoutGrid,
  Lightbulb, LineChart, Menu, Plus, Settings, Sparkles, TrendingUp, X,
} from 'lucide-react';
import type { ViewKey, Project } from '../types';
import type { PlannerJobState } from '../lib/plannerJobController';

interface SidebarProps {
  activeView: ViewKey;
  onSelectView: (view: ViewKey) => void;
  queueCount: number;
  scheduledCount: number;
  projects: Project[];
  activeProjectId: string;
  onSwitchProject: (id: string) => void;
  onNewProject: () => void;
  plannerJob: PlannerJobState;
  onOpenPlannerJob: () => void;
}

const nav: { key: ViewKey; label: string; icon: typeof LayoutGrid; badge?: 'queue' | 'scheduled' }[] = [
  { key: 'queue', label: 'Queue', icon: LayoutGrid, badge: 'queue' },
  { key: 'trends', label: 'Trends', icon: TrendingUp },
  { key: 'library', label: 'Library', icon: Images },
  { key: 'schedule', label: 'Schedule', icon: CalendarClock, badge: 'scheduled' },
  { key: 'results', label: 'Results', icon: LineChart },
  { key: 'learning', label: 'Learning', icon: Lightbulb },
  { key: 'brain', label: 'Brain', icon: Brain },
];

function initials(name: string) {
  return (name || 'P').slice(0, 2).toUpperCase();
}

export function Sidebar({
  activeView,
  onSelectView,
  queueCount,
  scheduledCount,
  projects,
  activeProjectId,
  onSwitchProject,
  onNewProject,
  plannerJob,
  onOpenPlannerJob,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const active = projects.find((project) => project.id === activeProjectId) ?? projects[0];

  const selectView = (view: ViewKey) => {
    onSelectView(view);
    setMobileOpen(false);
    setProjectOpen(false);
  };

  const content = (
    <div className="flex h-full flex-col">
      <div className={`flex h-16 items-center ${collapsed ? 'justify-center' : 'justify-between px-5'}`}>
        {!collapsed && (
          <div>
            <div className="text-sm font-semibold tracking-tight text-ink">Postfarm</div>
            <div className="text-[10px] text-ink-6">Social content studio</div>
          </div>
        )}
        <button
          type="button"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="hidden rounded-lg p-2 text-ink-6 hover:bg-white/[.05] hover:text-ink md:block"
          onClick={() => {
            setProjectOpen(false);
            setCollapsed((value) => !value);
          }}
        >
          <ChevronLeft size={15} className={collapsed ? 'rotate-180' : ''} />
        </button>
        <button type="button" aria-label="Close navigation" className="rounded-lg p-2 text-ink-6 md:hidden" onClick={() => setMobileOpen(false)}>
          <X size={18} />
        </button>
      </div>

      <div className="relative px-3 pb-2">
        <button
          type="button"
          onClick={() => setProjectOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={projectOpen}
          title={collapsed ? active.name : undefined}
          className={`flex h-10 w-full items-center rounded-lg border border-line bg-raised/60 text-left hover:bg-raised ${collapsed ? 'justify-center' : 'gap-2.5 px-2.5'}`}
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-control text-[9px] font-semibold text-accent">{initials(active.name)}</span>
          {!collapsed && <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-3">{active.name}</span>}
          {!collapsed && <ChevronsUpDown size={12} className="text-ink-6" />}
        </button>
        {projectOpen && (
          <div role="menu" className={`absolute top-11 z-[60] overflow-hidden rounded-xl border border-line bg-raised p-1 shadow-main ${collapsed ? 'left-3 w-56' : 'left-3 right-3'}`}>
            {projects.map((project) => (
              <button
                key={project.id}
                role="menuitem"
                type="button"
                onClick={() => {
                  setProjectOpen(false);
                  if (project.id !== activeProjectId) onSwitchProject(project.id);
                }}
                className="flex h-9 w-full items-center rounded-lg px-2.5 text-left text-[12px] text-ink-3 hover:bg-white/[.05]"
              >
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {project.id === activeProjectId && <Check size={13} className="text-accent" />}
              </button>
            ))}
            <div className="mt-1 border-t border-line pt-1">
              <button type="button" onClick={onNewProject} className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] text-ink-5 hover:bg-white/[.05] hover:text-ink-2">
                <Plus size={13} /> New project
              </button>
            </div>
          </div>
        )}
      </div>

      <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {nav.map(({ key, label, icon: Icon, badge }) => {
          const count = badge === 'queue' ? queueCount : badge === 'scheduled' ? scheduledCount : 0;
          const selected = activeView === key;
          return (
            <button
              key={key}
              type="button"
              title={collapsed ? label : undefined}
              onClick={() => selectView(key)}
              className={`flex h-10 w-full items-center rounded-lg text-[12px] ${collapsed ? 'justify-center' : 'gap-3 px-3'} ${selected ? 'bg-white/[.08] text-ink' : 'text-ink-5 hover:bg-white/[.04] hover:text-ink-2'}`}
            >
              <Icon size={16} strokeWidth={1.8} />
              <span className={collapsed ? 'sr-only' : ''}>{label}</span>
              {!collapsed && count > 0 && <span className="ml-auto rounded-full bg-control px-2 py-0.5 text-[10px] text-ink-4">{count}</span>}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        {plannerJob.status !== 'idle' && (
          <button
            type="button"
            onClick={onOpenPlannerJob}
            title="Open content planner"
            className={`mb-1.5 flex min-h-10 w-full items-center rounded-lg border border-accent/15 bg-sky-500/[.06] text-accent hover:bg-sky-500/[.1] ${collapsed ? 'justify-center' : 'gap-2.5 px-3 py-2 text-left'}`}
          >
            <Sparkles size={14} className={plannerJob.status === 'running' ? 'animate-pulse' : ''} />
            {!collapsed && (
              <span role="status" aria-live="polite" className="text-[10px] leading-4">
                {plannerJob.status === 'running'
                  ? `${plannerJob.stage === 'generation' ? 'Generating' : 'Scheduling'} ${plannerJob.done} of ${plannerJob.total}`
                  : 'Content plan complete'}
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => selectView('settings')}
          title={collapsed ? 'Settings' : undefined}
          className={`flex h-10 w-full items-center rounded-lg text-[12px] ${collapsed ? 'justify-center' : 'gap-3 px-3'} ${activeView === 'settings' ? 'bg-white/[.08] text-ink' : 'text-ink-5 hover:bg-white/[.04] hover:text-ink-2'}`}
        >
          <Settings size={16} strokeWidth={1.8} />
          <span className={collapsed ? 'sr-only' : ''}>Settings</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center border-b border-line bg-surface/95 px-4 backdrop-blur md:hidden">
        <button type="button" aria-label="Open navigation" className="rounded-lg p-2 text-ink-4" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
        <span className="ml-2 text-sm font-semibold tracking-tight">Postfarm</span>
        <span className="ml-auto max-w-[45vw] truncate text-[11px] text-ink-6">{active.name}</span>
      </div>
      {mobileOpen && <button type="button" aria-label="Close navigation overlay" className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[250px] border-r border-line bg-surface transition-[transform,width] duration-150 md:relative md:z-10 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'md:w-[72px]' : 'md:w-[232px]'}`}>
        {content}
      </aside>
    </>
  );
}
