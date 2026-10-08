import React from 'react';
import { ActiveTab } from './Navigation';

const TABS: { id: ActiveTab; label: string; icon: string }[] = [
  { id: 'feed', label: 'Feed', icon: 'dynamic_feed' },
  { id: 'radar', label: 'Radar', icon: 'radar' },
  { id: 'horizon', label: 'Horizon', icon: 'timeline' },
  { id: 'enforcement', label: 'Enforcement', icon: 'gavel' },
  { id: 'alert-rules', label: 'Alerts', icon: 'notifications_active' }
];

interface BottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

// Section tabs for phones, where the top tab row is hidden
export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => (
  <nav
    aria-label="Sections"
    className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-panel/95 backdrop-blur-md border-t border-line pb-[env(safe-area-inset-bottom)]"
  >
    <div className="grid grid-cols-5">
      {TABS.map(tab => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-current={active ? 'page' : undefined}
            className={`h-14 flex flex-col items-center justify-center gap-0.5 font-['Inter'] text-[10px] font-semibold transition-colors ${
              active ? 'text-accent' : 'text-muted hover:text-ink'
            }`}
          >
            <span className={`material-symbols-outlined text-[22px] ${active ? 'bg-accent-tint rounded-full px-3' : 'px-3'}`} aria-hidden="true">
              {tab.icon}
            </span>
            {tab.label}
          </button>
        );
      })}
    </div>
  </nav>
);
