import { Database, Clock, Wifi, WifiOff } from 'lucide-react';

export default function StatusBar({ activeConnections, activeTab }) {
  const connCount = activeConnections.length;

  return (
    <div className="h-6 bg-secondary border-t border-border flex items-center px-3 text-[11px] font-mono text-muted-foreground gap-4 shrink-0">
      <div className="flex items-center gap-1.5">
        {connCount > 0 ? (
          <Wifi className="w-3 h-3 text-primary" />
        ) : (
          <WifiOff className="w-3 h-3 text-destructive" />
        )}
        <span>{connCount} connection{connCount !== 1 ? 's' : ''}</span>
      </div>

      {activeTab && (
        <>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5">
            <Database className="w-3 h-3" />
            <span>{activeTab.database}.{activeTab.collection}</span>
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <Clock className="w-3 h-3" />
        <span>MongoDB</span>
      </div>
    </div>
  );
}