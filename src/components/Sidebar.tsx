import { useState } from 'react';
import { LayoutGrid, CalendarClock, LineChart, Brain, Settings, ChevronsUpDown, Plus, Check, Images, PanelLeftClose, PanelLeftOpen, TrendingUp } from 'lucide-react';
import type { ViewKey, Project } from '../types';

interface SidebarProps {
  activeView: ViewKey;
  onSelectView: (view: ViewKey) => void;
  queueCount: number;
  scheduledCount: number;
  projects: Project[];
  activeProjectId: string;
  onSwitchProject: (id: string) => void;
  onNewProject: () => void;
}

const nav: { key: ViewKey; label: string; icon: typeof LayoutGrid; badge?: 'queue' | 'scheduled' }[] = [
  { key: 'queue', label: 'Queue', icon: LayoutGrid, badge: 'queue' },
  { key: 'trends', label: 'Trends', icon: TrendingUp },
  { key: 'library', label: 'Library', icon: Images },
  { key: 'schedule', label: 'Schedule', icon: CalendarClock, badge: 'scheduled' },
  { key: 'results', label: 'Results', icon: LineChart },
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
}: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const active = projects.find((p) => p.id === activeProjectId) ?? projects[0];

  return (
    <aside className={`${collapsed ? 'w-[64px]' : 'w-[216px]'} shrink-0 flex flex-col bg-surface border-r border-line h-full transition-[width] duration-150 ease-out`}>
      {/* Brand */}
      <div className="relative px-2 sm:px-3 py-3 border-b border-line">
        <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : 'justify-start'}`}>
          <div className="w-9 h-9 rounded-lg bg-raised border border-line flex items-center justify-center shadow-main">
            <img src="/android-chrome-192x192.png" alt="Slidesmith" className="w-7 h-7 rounded-[7px] shrink-0" />
          </div>
          <div className={`${collapsed ? 'hidden' : 'flex'} flex-col leading-none min-w-0`}>
            <span className="text-[14px] font-semibold text-ink">SlideSmith</span>
            <span className="text-[10px] text-ink-6 mt-1 uppercase tracking-[0.12em]">AI slideshow studio</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setCollapsed((value) => !value);
            }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`${collapsed ? 'absolute right-1 top-1 z-20 h-6 w-6' : 'ml-auto h-8 w-8'} rounded-lg text-ink-5 hover:text-ink hover:bg-white/[0.055] flex items-center justify-center`}
          >
            {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>
      </div>

      {/* Project switcher */}
      <div className="px-2 sm:px-3 py-3 border-b border-line relative">
        <span className={`${collapsed ? 'hidden' : 'block'} text-[10px] font-medium text-ink-6 uppercase tracking-[0.12em] px-1`}>Project</span>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className={`mt-0 ${collapsed ? '' : 'mt-2'} w-full h-9 flex items-center ${collapsed ? 'justify-center px-0' : 'justify-start px-2'} gap-2.5 rounded-lg bg-raised border border-line hover:bg-control hover:border-line-2 outline-none`}
        >
          <div className="w-6 h-6 rounded-md bg-control border border-line text-accent flex items-center justify-center text-[10px] font-bold shrink-0">
            {initials(active.name)}
          </div>
          <span className={`${collapsed ? 'hidden' : 'block'} text-[13px] font-medium text-ink-3 truncate flex-1 text-left`}>{active.name}</span>
          <ChevronsUpDown size={13} className={`${collapsed ? 'hidden' : 'block'} text-ink-6 shrink-0`} />
        </button>

        {menuOpen && (
          <>
            {/* click-away */}
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className={`absolute ${collapsed ? 'left-2 top-[58px] w-[240px]' : 'left-3 top-[72px] w-[calc(100%-1.5rem)]'} z-20 bg-raised border border-line rounded-xl shadow-main overflow-hidden p-1`}>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setMenuOpen(false);
                    if (p.id !== activeProjectId) onSwitchProject(p.id);
                  }}
                  className="w-full h-8 flex items-center gap-2 px-2.5 text-left rounded-lg hover:bg-white/[0.055] transition-colors"
                >
                  <span className="text-[13px] text-ink-3 truncate flex-1">{p.name}</span>
                  {p.id === activeProjectId && <Check size={13} className="text-accent shrink-0" />}
                </button>
              ))}
              <div className="border-t border-line mt-1 pt-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onNewProject();
                  }}
                  className="w-full h-8 flex items-center gap-2 px-2.5 text-left rounded-lg text-ink-5 hover:bg-white/[0.055] hover:text-ink transition-colors"
                >
                  <Plus size={13} className="shrink-0" />
                  <span className="text-[13px]">New project</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-3 px-2">
        <div className="flex flex-col gap-0.5">
          {nav.map(({ key, label, icon: Icon, badge }) => {
            const isActive = activeView === key;
            const count = badge === 'queue' ? queueCount : badge === 'scheduled' ? scheduledCount : undefined;
            return (
              <button
                key={key}
                onClick={() => onSelectView(key)}
                className={`w-full h-9 flex items-center ${collapsed ? 'justify-center px-0' : 'justify-start px-2.5'} gap-2.5 rounded-lg text-left border transition-colors outline-none ${
                  isActive ? 'bg-raised text-ink border-line shadow-main' : 'text-ink-5 border-transparent hover:bg-white/[0.055] hover:text-ink-3'
                }`}
              >
                <Icon size={15} className={`shrink-0 ${isActive ? 'text-accent' : ''}`} />
                <span className={`${collapsed ? 'hidden' : 'block'} text-[13px] font-medium flex-1 truncate`}>{label}</span>
                {count !== undefined && count > 0 && (
                  <span className={`${collapsed ? 'hidden' : 'inline-flex'} text-[10px] font-medium leading-none px-1.5 h-[18px] items-center rounded-md border ${
                    isActive ? 'bg-accent text-bg border-accent' : 'bg-control text-ink-5 border-line'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-line p-2">
        <button
          onClick={() => onSelectView('settings')}
          className={`w-full h-9 flex items-center ${collapsed ? 'justify-center px-0' : 'justify-start px-2.5'} gap-2.5 rounded-lg border transition-colors outline-none ${
            activeView === 'settings' ? 'bg-raised text-ink border-line shadow-main' : 'text-ink-6 border-transparent hover:text-ink-3 hover:bg-white/[0.055]'
          }`}
        >
          <Settings size={15} className={`shrink-0 ${activeView === 'settings' ? 'text-accent' : ''}`} />
          <span className={`${collapsed ? 'hidden' : 'block'} text-[13px]`}>Settings</span>
        </button>
      </div>
    </aside>
  );
}
