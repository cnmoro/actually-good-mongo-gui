import { useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import Toolbar from '@/components/mongo/Toolbar';
import Explorer from '@/components/mongo/Explorer';
import TabBar from '@/components/mongo/TabBar';
import StatusBar from '@/components/mongo/StatusBar';
import ConnectionDialog from '@/components/mongo/ConnectionDialog';
import ShellTab from '@/components/mongo/ShellTab';
import CollectionTab from '@/components/mongo/CollectionTab';
import AggregationTab from '@/components/mongo/AggregationTab';
import IndexesTab from '@/components/mongo/IndexesTab';
import ResizeHandle from '@/components/mongo/ResizeHandle';
import { MongoApi } from '@/lib/mongo-api';

export default function ActuallyGoodMongoGui() {
  const store = useAppStore();
  const [showConnDialog, setShowConnDialog] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleConnect = useCallback((connId, meta) => {
    store.connectToServer(connId, meta);
  }, [store]);

  const handleSaveConnection = useCallback((form) => {
    const existing = store.connections.find(c => c.id === form.id);
    if (existing) {
      return store.updateConnection(form.id, form);
    }
    return store.addConnection(form);
  }, [store]);

  const handleOpenTab = useCallback((tab) => {
    // Check if similar tab already exists
    const existing = store.tabs.find(t =>
      t.type === tab.type && t.database === tab.database && t.collection === tab.collection
    );
    if (existing) {
      store.setActiveTabId(existing.id);
      return;
    }
    store.openTab(tab);
  }, [store]);

  const handleResize = useCallback((delta) => {
    store.setSidebarWidth(prev => {
      const newWidth = Math.max(180, Math.min(500, (typeof prev === 'number' ? prev : 280) + delta));
      return newWidth;
    });
  }, [store]);

  const handleDisconnectConnection = useCallback(async (connectionId) => {
    try {
      await MongoApi.disconnect(connectionId);
    } catch {
      // Ignore API disconnect failures and still clear local active state.
    }
    store.disconnectFromServer(connectionId);
  }, [store]);

  const activeTab = store.tabs.find(t => t.id === store.activeTabId);

  const renderTabContent = () => {
    if (!activeTab) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                <path d="M8 12l3 3 5-5" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Actually Good Mongo GUI</h2>
            <p className="text-xs text-muted-foreground mb-4">Browser-based MongoDB client</p>
            <div className="space-y-2 text-left text-[11px] text-muted-foreground bg-secondary/30 rounded-lg p-4">
              <p>• Connect to a server from the <strong className="text-foreground">Connections</strong> button</p>
              <p>• Expand databases and collections in the sidebar</p>
              <p>• Right-click a collection to open views</p>
              <p>• Use the aggregation builder for pipeline workflows</p>
            </div>
          </div>
        </div>
      );
    }

    switch (activeTab.type) {
      case 'shell':
        return <ShellTab connectionId={activeTab.connectionId} database={activeTab.database} collection={activeTab.collection} />;
      case 'collection':
        return <CollectionTab connectionId={activeTab.connectionId} database={activeTab.database} collection={activeTab.collection} />;
      case 'aggregation':
        return <AggregationTab connectionId={activeTab.connectionId} database={activeTab.database} collection={activeTab.collection} />;
      case 'indexes':
        return <IndexesTab connectionId={activeTab.connectionId} database={activeTab.database} collection={activeTab.collection} />;
      default:
        return <div className="p-4 text-xs text-muted-foreground">Unknown tab type</div>;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      <Toolbar
        onOpenConnections={() => setShowConnDialog(true)}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {!sidebarCollapsed && (
          <>
            <div
              className="shrink-0 overflow-hidden"
              style={{ width: store.sidebarWidth }}
            >
              <Explorer
                activeConnections={store.activeConnections}
                connections={store.connections}
                explorerState={store.explorerState}
                toggleExplorerNode={store.toggleExplorerNode}
                onOpenTab={handleOpenTab}
                onDisconnectConnection={handleDisconnectConnection}
              />
            </div>
            <ResizeHandle onResize={handleResize} />
          </>
        )}

        {/* Main workspace */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TabBar
            tabs={store.tabs}
            activeTabId={store.activeTabId}
            onSelectTab={store.setActiveTabId}
            onCloseTab={store.closeTab}
          />
          <div className="flex-1 overflow-hidden">
            {renderTabContent()}
          </div>
        </div>
      </div>

      <StatusBar activeConnections={store.activeConnections} activeTab={activeTab} />

      <ConnectionDialog
        open={showConnDialog}
        onOpenChange={setShowConnDialog}
        connections={store.connections}
        onConnect={handleConnect}
        onSaveConnection={handleSaveConnection}
        onRemoveConnection={store.removeConnection}
      />
    </div>
  );
}