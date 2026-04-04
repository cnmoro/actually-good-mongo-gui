import { X, Terminal, Table, GitBranch, FileJson } from 'lucide-react';
import { cn } from '@/lib/utils';

const TAB_ICONS = {
  shell: Terminal,
  collection: Table,
  aggregation: GitBranch,
  document: FileJson,
};

export default function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab }) {
  return (
    <div className="h-9 bg-secondary/50 border-b border-border flex items-end overflow-x-auto shrink-0">
      {tabs.map((tab) => {
        const Icon = TAB_ICONS[tab.type] || Table;
        const isActive = tab.id === activeTabId;

        return (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={cn(
              'tab-transition group flex items-center gap-1.5 px-3 h-8 cursor-pointer text-xs font-medium border-r border-border max-w-[200px] min-w-[120px]',
              'hover:bg-muted/50 transition-colors',
              isActive
                ? 'bg-background text-foreground border-b-0 relative before:absolute before:bottom-0 before:left-0 before:right-0 before:h-px before:bg-background'
                : 'bg-secondary/30 text-muted-foreground'
            )}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1">
              {tab.title}
              {tab.dirty && <span className="text-primary ml-0.5">●</span>}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              className="opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
      {tabs.length === 0 && (
        <div className="flex items-center px-4 h-8 text-xs text-muted-foreground">
          No open tabs — browse the explorer to get started
        </div>
      )}
    </div>
  );
}