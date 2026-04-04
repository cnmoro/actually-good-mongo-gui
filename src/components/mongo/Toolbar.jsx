import { Plug, Database, Settings, Keyboard, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function Toolbar({ onOpenConnections, sidebarCollapsed, onToggleSidebar }) {
  return (
    <div className="h-10 bg-secondary/50 border-b border-border flex items-center px-2 gap-1 shrink-0">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onToggleSidebar}>
              {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Toggle sidebar</TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-border mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onOpenConnections}>
              <Plug className="w-3.5 h-3.5" />
              <span>Connections</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Manage connections</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <span className="text-[10px] font-mono text-muted-foreground mr-2">Actually Good Mongo GUI</span>
        <Database className="w-3.5 h-3.5 text-primary" />
      </div>
    </div>
  );
}