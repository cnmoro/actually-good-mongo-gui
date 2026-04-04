import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, Database, Table, Terminal, GitBranch, Search, List, Plug, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { MongoApi } from '@/lib/mongo-api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function Explorer({ activeConnections, connections, explorerState, toggleExplorerNode, onOpenTab, onDisconnectConnection }) {
  const [databases, setDatabases] = useState({});
  const [collections, setCollections] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState({});
  const [promptState, setPromptState] = useState({ open: false, type: null, payload: null });
  const [promptValue, setPromptValue] = useState('');
  const [promptValue2, setPromptValue2] = useState('');
  const [promptValue3, setPromptValue3] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [statsText, setStatsText] = useState('');
  const [statsOpen, setStatsOpen] = useState(false);
  const [confirmState, setConfirmState] = useState({ open: false, type: null, payload: null });
  const [indexName, setIndexName] = useState('');
  const [indexFields, setIndexFields] = useState([{ field: '', type: '1' }]);
  const [indexUnique, setIndexUnique] = useState(false);
  const [indexSparse, setIndexSparse] = useState(false);
  const [indexHidden, setIndexHidden] = useState(false);
  const [indexBackground, setIndexBackground] = useState(true);
  const [indexTtlEnabled, setIndexTtlEnabled] = useState(false);
  const [indexTtlSeconds, setIndexTtlSeconds] = useState('3600');
  const [indexPartialEnabled, setIndexPartialEnabled] = useState(false);
  const [indexPartialFilter, setIndexPartialFilter] = useState('{"status":"ACTIVE"}');

  const INDEX_TYPE_OPTIONS = [
    { value: '1', label: 'Ascending (1)' },
    { value: '-1', label: 'Descending (-1)' },
    { value: 'text', label: 'Text' },
    { value: 'hashed', label: 'Hashed' },
    { value: '2dsphere', label: '2dsphere' },
    { value: '2d', label: '2d' },
    { value: 'geoHaystack', label: 'GeoHaystack' },
  ];

  const inferFormatFromFile = useCallback((fileName, fallback = 'json') => {
    const name = String(fileName || '').toLowerCase();
    if (name.endsWith('.csv')) return 'csv';
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'excel';
    if (name.endsWith('.bson')) return 'bson';
    if (name.endsWith('.json')) return 'json';
    return fallback;
  }, []);

  const loadDatabases = useCallback(async (connId) => {
    setLoading((prev) => ({ ...prev, [connId]: true }));
    try {
      const dbs = await MongoApi.listDatabases(connId);
      setDatabases((prev) => ({ ...prev, [connId]: dbs }));
      return dbs;
    } finally {
      setLoading((prev) => ({ ...prev, [connId]: false }));
    }
  }, []);

  const loadCollections = useCallback(async (connId, dbName) => {
    const key = `${connId}_${dbName}`;
    setLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const colls = await MongoApi.listCollections(connId, dbName);
      setCollections((prev) => ({ ...prev, [key]: colls }));
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  useEffect(() => {
    activeConnections.forEach((conn) => {
      if (!databases[conn.connectionId]) loadDatabases(conn.connectionId);
    });
  }, [activeConnections, databases, loadDatabases]);

  const handleToggleDb = useCallback((connId, dbName) => {
    const key = `${connId}_${dbName}`;
    toggleExplorerNode(key);
    if (!explorerState[key] && !collections[key]) {
      loadCollections(connId, dbName);
    }
  }, [toggleExplorerNode, explorerState, collections, loadCollections]);

  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return null;
    const results = [];
    activeConnections.forEach((conn) => {
      const dbs = databases[conn.connectionId] || [];
      dbs.forEach((db) => {
        const key = `${conn.connectionId}_${db.name}`;
        const colls = collections[key] || [];
        colls.forEach((coll) => {
          if (coll.name.toLowerCase().includes(q) || db.name.toLowerCase().includes(q)) {
            results.push({ connId: conn.connectionId, db: db.name, coll: coll.name, count: coll.count });
          }
        });
      });
    });
    return results;
  }, [searchQuery, activeConnections, databases, collections]);

  const refreshDatabaseTree = useCallback(async (connId, dbName) => {
    await loadDatabases(connId);
    if (dbName) await loadCollections(connId, dbName);
  }, [loadCollections, loadDatabases]);

  const handleConnectionAction = useCallback(async (type, payload) => {
    if (type === 'refresh') {
      setCollections((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (key.startsWith(`${payload.connId}_`)) delete next[key];
        });
        return next;
      });

      const dbs = await loadDatabases(payload.connId);
      for (const db of dbs || []) {
        const dbKey = `${payload.connId}_${db.name}`;
        if (explorerState[dbKey]) {
          await loadCollections(payload.connId, db.name);
        }
      }
      return;
    }

    if (type === 'disconnect') {
      await onDisconnectConnection?.(payload.connId);
    }
  }, [explorerState, loadCollections, loadDatabases, onDisconnectConnection]);

  const handleDbAction = useCallback(async (type, payload) => {
    if (type === 'stats') {
      const stats = await MongoApi.getDatabaseStats(payload.connId, payload.dbName);
      setStatsText(JSON.stringify(stats, null, 2));
      setStatsOpen(true);
      return;
    }

    if (type === 'createCollection' || type === 'duplicateDb') {
      setPromptState({ open: true, type, payload });
      setPromptValue('');
      return;
    }

    if (type === 'exportDatabase') {
      setPromptState({ open: true, type, payload });
      setPromptValue('json');
      return;
    }

    if (type === 'importDatabase') {
      setPromptState({ open: true, type, payload });
      setPromptValue('json');
      setPromptValue2(payload.dbName);
      setImportFile(null);
      return;
    }

    if (type === 'dropDb') {
      setPromptState({ open: true, type: 'dropDbConfirmName', payload });
      setPromptValue('');
      return;
    }

    if (type === 'refresh') {
      await refreshDatabaseTree(payload.connId, payload.dbName);
    }
  }, [refreshDatabaseTree]);

  const handleCollectionAction = useCallback(async (type, payload) => {
    if (type === 'stats') {
      const stats = await MongoApi.getCollectionStats(payload.connId, payload.dbName, payload.collName);
      setStatsText(JSON.stringify(stats, null, 2));
      setStatsOpen(true);
      return;
    }

    if (
      type === 'duplicateCollection' ||
      type === 'renameCollection' ||
      type === 'createIndex' ||
      type === 'exportCollection' ||
      type === 'importCollection' ||
      type === 'createCollection'
    ) {
      setPromptState({ open: true, type, payload });
      setPromptValue(type === 'renameCollection' ? payload.collName : (type === 'exportCollection' || type === 'importCollection' ? 'json' : ''));
      setPromptValue2('');
      setPromptValue3('');
      setImportFile(null);
      if (type === 'createIndex') {
        setIndexName('');
        setIndexFields([{ field: '', type: '1' }]);
        setIndexUnique(false);
        setIndexSparse(false);
        setIndexHidden(false);
        setIndexBackground(true);
        setIndexTtlEnabled(false);
        setIndexTtlSeconds('3600');
        setIndexPartialEnabled(false);
        setIndexPartialFilter('{"status":"ACTIVE"}');
      }
      return;
    }

    if (type === 'dropCollection' || type === 'wipeCollection') {
      setConfirmState({ open: true, type, payload });
      return;
    }

    if (type === 'refresh') {
      await refreshDatabaseTree(payload.connId, payload.dbName);
    }
  }, [refreshDatabaseTree]);

  const submitPromptAction = useCallback(async () => {
    const { type, payload } = promptState;
    if (!type || !payload) return;

    if (type === 'createCollection') {
      await MongoApi.createCollection(payload.connId, payload.dbName, promptValue.trim());
      await refreshDatabaseTree(payload.connId, payload.dbName);
    }
    if (type === 'duplicateDb') {
      await MongoApi.duplicateDatabase(payload.connId, payload.dbName, promptValue.trim());
      await refreshDatabaseTree(payload.connId);
    }
    if (type === 'dropDbConfirmName') {
      if (promptValue.trim() === payload.dbName) {
        await MongoApi.dropDatabase(payload.connId, payload.dbName);
        await refreshDatabaseTree(payload.connId);
      }
    }
    if (type === 'duplicateCollection') {
      await MongoApi.duplicateCollection(payload.connId, payload.dbName, payload.collName, promptValue.trim());
      await refreshDatabaseTree(payload.connId, payload.dbName);
    }
    if (type === 'renameCollection') {
      await MongoApi.renameCollection(payload.connId, payload.dbName, payload.collName, promptValue.trim());
      await refreshDatabaseTree(payload.connId, payload.dbName);
    }
    if (type === 'createIndex') {
      const normalizedFields = indexFields
        .map((item) => ({ field: item.field.trim(), type: item.type }))
        .filter((item) => item.field);

      if (!normalizedFields.length) {
        throw new Error('At least one index field is required');
      }

      const keys = {};
      normalizedFields.forEach((item) => {
        const mappedType = item.type === '1' || item.type === '-1' ? Number(item.type) : item.type;
        keys[item.field] = mappedType;
      });

      const options = {
        background: Boolean(indexBackground),
      };

      if (indexName.trim()) options.name = indexName.trim();
      if (indexUnique) options.unique = true;
      if (indexSparse) options.sparse = true;
      if (indexHidden) options.hidden = true;

      if (indexTtlEnabled) {
        const parsedTtl = Number(indexTtlSeconds);
        if (!Number.isFinite(parsedTtl) || parsedTtl < 0) {
          throw new Error('TTL must be a valid number of seconds');
        }
        options.expireAfterSeconds = parsedTtl;
      }

      if (indexPartialEnabled) {
        const partial = JSON.parse(indexPartialFilter || '{}');
        options.partialFilterExpression = partial;
      }

      await MongoApi.createIndex(payload.connId, payload.dbName, payload.collName, keys, options);
    }
    if (type === 'exportDatabase') {
      const format = (promptValue || 'json').trim().toLowerCase();
      const result = await MongoApi.exportDatabase(payload.connId, payload.dbName, format);
      const blob = new Blob([result.data], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${payload.dbName}.${format === 'excel' ? 'csv' : format}`;
      a.click();
      URL.revokeObjectURL(url);
    }
    if (type === 'importDatabase') {
      if (!importFile) throw new Error('Select a file to import');
      const text = await importFile.text();
      const format = inferFormatFromFile(importFile.name, (promptValue || 'json').trim().toLowerCase());
      await MongoApi.importDatabase(payload.connId, payload.dbName, text, promptValue2 || payload.dbName, format);
      await refreshDatabaseTree(payload.connId);
    }
    if (type === 'exportCollection') {
      const format = (promptValue || 'json').trim().toLowerCase();
      const result = await MongoApi.exportCollection(payload.connId, payload.dbName, payload.collName, format);
      const blob = new Blob([result.data], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${payload.collName}.${format === 'excel' ? 'csv' : format}`;
      a.click();
      URL.revokeObjectURL(url);
    }
    if (type === 'importCollection') {
      if (!importFile) throw new Error('Select a file to import');
      const text = await importFile.text();
      const format = inferFormatFromFile(importFile.name, (promptValue || 'json').trim().toLowerCase());
      await MongoApi.importCollection(
        payload.connId,
        payload.dbName,
        payload.collName,
        format,
        text,
        promptValue3 || undefined
      );
      await refreshDatabaseTree(payload.connId, payload.dbName);
    }

    setPromptState({ open: false, type: null, payload: null });
    setPromptValue('');
    setPromptValue2('');
    setPromptValue3('');
    setImportFile(null);
  }, [promptState, promptValue, promptValue2, promptValue3, importFile, inferFormatFromFile, refreshDatabaseTree]);

  const submitConfirmAction = useCallback(async () => {
    const { type, payload } = confirmState;
    if (!type || !payload) return;

    if (type === 'dropCollection') {
      await MongoApi.dropCollection(payload.connId, payload.dbName, payload.collName);
      await refreshDatabaseTree(payload.connId, payload.dbName);
    }
    if (type === 'wipeCollection') {
      await MongoApi.wipeCollection(payload.connId, payload.dbName, payload.collName);
      await refreshDatabaseTree(payload.connId, payload.dbName);
    }

    setConfirmState({ open: false, type: null, payload: null });
  }, [confirmState, refreshDatabaseTree]);

  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-2 border-b border-sidebar-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter..."
            className="h-7 pl-7 text-xs bg-sidebar-accent border-sidebar-border"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filteredData ? (
          filteredData.length > 0 ? (
            filteredData.map((item, i) => (
              <button
                key={i}
                onClick={() => onOpenTab({ type: 'collection', title: item.coll, database: item.db, collection: item.coll, connectionId: item.connId })}
                className="sidebar-item w-full flex items-center gap-2 px-3 py-1 text-xs hover:bg-sidebar-accent text-left"
              >
                <Table className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate">{item.db}.{item.coll}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{item.count}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-4 text-xs text-muted-foreground text-center">No results</p>
          )
        ) : (
          activeConnections.map((conn) => {
            const connConfig = connections.find((c) => c.id === conn.connectionId);
            const connKey = `conn_${conn.connectionId}`;
            const isConnExpanded = explorerState[connKey] !== false;
            const dbs = databases[conn.connectionId] || [];

            return (
              <div key={conn.connectionId}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <button
                      onClick={() => toggleExplorerNode(connKey)}
                      className="sidebar-item w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold hover:bg-sidebar-accent"
                    >
                      {isConnExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <Plug className="w-3.5 h-3.5 text-primary" />
                      <span className="truncate">{connConfig?.name || conn.host}</span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56">
                    <ContextMenuItem onClick={() => handleConnectionAction('refresh', { connId: conn.connectionId })}>
                      <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh connection
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem className="text-destructive" onClick={() => handleConnectionAction('disconnect', { connId: conn.connectionId })}>
                      Disconnect
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>

                {isConnExpanded && (
                  <div className="ml-2">
                    {loading[conn.connectionId] ? (
                      <div className="px-4 py-2 text-[10px] text-muted-foreground">Loading...</div>
                    ) : (
                      dbs.map((db) => {
                        const dbKey = `${conn.connectionId}_${db.name}`;
                        const isDbExpanded = explorerState[dbKey];
                        const colls = collections[dbKey] || [];

                        return (
                          <div key={db.name}>
                            <ContextMenu>
                              <ContextMenuTrigger asChild>
                                <button
                                  onClick={() => handleToggleDb(conn.connectionId, db.name)}
                                  className="sidebar-item w-full flex items-center gap-1.5 px-3 py-1 text-xs hover:bg-sidebar-accent"
                                >
                                  {isDbExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                  <Database className="w-3.5 h-3.5 text-amber-400" />
                                  <span className="truncate">{db.name}</span>
                                  <span className="ml-auto text-[10px] text-muted-foreground">{db.collections}</span>
                                </button>
                              </ContextMenuTrigger>
                              <ContextMenuContent className="w-56">
                                <ContextMenuItem onClick={() => handleDbAction('createCollection', { connId: conn.connectionId, dbName: db.name })}>Create new collection</ContextMenuItem>
                                <ContextMenuItem onClick={() => handleDbAction('duplicateDb', { connId: conn.connectionId, dbName: db.name })}>Duplicate database</ContextMenuItem>
                                <ContextMenuItem onClick={() => handleDbAction('exportDatabase', { connId: conn.connectionId, dbName: db.name })}>Export database</ContextMenuItem>
                                <ContextMenuItem onClick={() => handleDbAction('importDatabase', { connId: conn.connectionId, dbName: db.name })}>Import database</ContextMenuItem>
                                <ContextMenuItem onClick={() => handleDbAction('stats', { connId: conn.connectionId, dbName: db.name })}>View database statistics</ContextMenuItem>
                                <ContextMenuItem onClick={() => handleDbAction('refresh', { connId: conn.connectionId, dbName: db.name })}>
                                  <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem className="text-destructive" onClick={() => handleDbAction('dropDb', { connId: conn.connectionId, dbName: db.name })}>
                                  Drop database
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>

                            {isDbExpanded && (
                              <div className="ml-4">
                                {loading[dbKey] ? (
                                  <div className="px-4 py-1 text-[10px] text-muted-foreground">Loading...</div>
                                ) : (
                                  colls.map((coll) => (
                                    <CollectionItem
                                      key={coll.name}
                                      coll={coll}
                                      connId={conn.connectionId}
                                      dbName={db.name}
                                      onOpenTab={onOpenTab}
                                      onAction={handleCollectionAction}
                                    />
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {activeConnections.length === 0 && !searchQuery && (
          <div className="px-4 py-8 text-center">
            <Plug className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No active connections</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">Connect from the connection manager</p>
          </div>
        )}
      </div>

      <Dialog open={promptState.open} onOpenChange={(open) => setPromptState((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{promptState.type?.includes('Index') ? 'Create Index' : 'Action Parameters'}</DialogTitle>
            <DialogDescription>
              Provide input required for this action.
            </DialogDescription>
          </DialogHeader>

          {(promptState.type === 'createCollection' || promptState.type === 'duplicateDb' || promptState.type === 'duplicateCollection' || promptState.type === 'renameCollection' || promptState.type === 'dropDbConfirmName') && (
            <Input
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={promptState.type === 'dropDbConfirmName' ? `Type '${promptState.payload?.dbName}' to confirm` : 'Name'}
            />
          )}

          {promptState.type === 'createIndex' && (
            <div className="space-y-3">
              <Input
                value={indexName}
                onChange={(e) => setIndexName(e.target.value)}
                placeholder="Index name (optional)"
              />

              <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-medium">Fields</div>
                {indexFields.map((entry, idx) => (
                  <div key={`index-field-${idx}`} className="flex items-center gap-2">
                    <Input
                      value={entry.field}
                      onChange={(e) => {
                        const next = [...indexFields];
                        next[idx] = { ...next[idx], field: e.target.value };
                        setIndexFields(next);
                      }}
                      placeholder="Field name"
                    />
                    <select
                      className="h-9 min-w-[180px] rounded border border-input bg-background px-2 text-sm"
                      value={entry.type}
                      onChange={(e) => {
                        const next = [...indexFields];
                        next[idx] = { ...next[idx], type: e.target.value };
                        setIndexFields(next);
                      }}
                    >
                      {INDEX_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 px-2"
                      disabled={indexFields.length === 1}
                      onClick={() => setIndexFields(indexFields.filter((_, rowIdx) => rowIdx !== idx))}
                      title="Remove field"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => setIndexFields((prev) => [...prev, { field: '', type: '1' }])}
                >
                  <Plus className="w-3.5 h-3.5" /> Add field
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={indexUnique} onChange={(e) => setIndexUnique(e.target.checked)} />
                  Unique
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={indexSparse} onChange={(e) => setIndexSparse(e.target.checked)} />
                  Sparse
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={indexHidden} onChange={(e) => setIndexHidden(e.target.checked)} />
                  Hidden
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={indexBackground} onChange={(e) => setIndexBackground(e.target.checked)} />
                  Create in background
                </label>
              </div>

              <div className="space-y-2 rounded border border-border p-2">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={indexTtlEnabled} onChange={(e) => setIndexTtlEnabled(e.target.checked)} />
                  TTL (expire after)
                </label>
                {indexTtlEnabled && (
                  <Input
                    value={indexTtlSeconds}
                    onChange={(e) => setIndexTtlSeconds(e.target.value)}
                    placeholder="Expire after seconds"
                  />
                )}
              </div>

              <div className="space-y-2 rounded border border-border p-2">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={indexPartialEnabled} onChange={(e) => setIndexPartialEnabled(e.target.checked)} />
                  Partial index
                </label>
                {indexPartialEnabled && (
                  <textarea
                    className="w-full min-h-[80px] rounded border border-input bg-background p-2 text-xs font-mono"
                    value={indexPartialFilter}
                    onChange={(e) => setIndexPartialFilter(e.target.value)}
                    placeholder='{"status":"ACTIVE"}'
                  />
                )}
              </div>
            </div>
          )}

          {(promptState.type === 'exportCollection' || promptState.type === 'exportDatabase') && (
            <select
              className="h-9 w-full rounded border border-input bg-background px-2 text-sm"
              value={promptValue || 'json'}
              onChange={(e) => setPromptValue(e.target.value)}
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
              <option value="excel">Excel (CSV)</option>
              <option value="bson">BSON</option>
            </select>
          )}

          {(promptState.type === 'importCollection' || promptState.type === 'importDatabase') && (
            <div className="space-y-2">
              <select
                className="h-9 w-full rounded border border-input bg-background px-2 text-sm"
                value={promptValue || 'json'}
                onChange={(e) => setPromptValue(e.target.value)}
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="excel">Excel (CSV)</option>
                <option value="bson">BSON</option>
              </select>
              <input
                type="file"
                className="w-full text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setImportFile(file);
                  if (file) {
                    setPromptValue(inferFormatFromFile(file.name, promptValue || 'json'));
                  }
                }}
              />
              {promptState.type === 'importCollection' && (
                <Input value={promptValue3} onChange={(e) => setPromptValue3(e.target.value)} placeholder='Target collection (optional)' />
              )}
              {promptState.type === 'importDatabase' && (
                <Input value={promptValue2} onChange={(e) => setPromptValue2(e.target.value)} placeholder='Target database name (optional)' />
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptState({ open: false, type: null, payload: null })}>Cancel</Button>
            <Button onClick={submitPromptAction}>Run</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Statistics</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded bg-secondary/30 p-3 text-xs font-mono">{statsText}</pre>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmState.open} onOpenChange={(open) => setConfirmState((prev) => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmState.type === 'wipeCollection' ? 'Wipe collection data?' : 'Drop collection?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This operation is destructive and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={submitConfirmAction}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CollectionItem({ coll, connId, dbName, onOpenTab, onAction }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          className="sidebar-item w-full flex items-center gap-1.5 px-3 py-1 text-xs hover:bg-sidebar-accent group"
          onDoubleClick={() => onOpenTab({ type: 'collection', title: coll.name, database: dbName, collection: coll.name, connectionId: connId })}
        >
          <Table className="w-3.5 h-3.5 text-primary/70 shrink-0" />
          <span className="truncate">{coll.name}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{coll.count}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem onClick={() => onOpenTab({ type: 'collection', title: coll.name, database: dbName, collection: coll.name, connectionId: connId })}>
          <Table className="w-3.5 h-3.5 mr-2" /> Open Collection
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onOpenTab({ type: 'aggregation', title: `${coll.name} - Pipeline`, database: dbName, collection: coll.name, connectionId: connId })}>
          <GitBranch className="w-3.5 h-3.5 mr-2" /> Aggregation Pipeline
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onOpenTab({ type: 'shell', title: `${dbName} Shell`, database: dbName, collection: coll.name, connectionId: connId })}>
          <Terminal className="w-3.5 h-3.5 mr-2" /> Open Shell
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onOpenTab({ type: 'indexes', title: `${coll.name} Indexes`, database: dbName, collection: coll.name, connectionId: connId })}>
          <List className="w-3.5 h-3.5 mr-2" /> View Indexes
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onAction('createIndex', { connId, dbName, collName: coll.name })}>Create indexes (wizard)</ContextMenuItem>
        <ContextMenuItem onClick={() => onAction('duplicateCollection', { connId, dbName, collName: coll.name })}>Duplicate collection</ContextMenuItem>
        <ContextMenuItem onClick={() => onAction('renameCollection', { connId, dbName, collName: coll.name })}>Rename collection</ContextMenuItem>
        <ContextMenuItem onClick={() => onAction('stats', { connId, dbName, collName: coll.name })}>View collection statistics</ContextMenuItem>
        <ContextMenuItem onClick={() => onAction('exportCollection', { connId, dbName, collName: coll.name })}>Export collection</ContextMenuItem>
        <ContextMenuItem onClick={() => onAction('importCollection', { connId, dbName, collName: coll.name })}>Import collection</ContextMenuItem>
        <ContextMenuItem onClick={() => onAction('refresh', { connId, dbName, collName: coll.name })}>Refresh</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive" onClick={() => onAction('wipeCollection', { connId, dbName, collName: coll.name })}>
          Wipe collection data
        </ContextMenuItem>
        <ContextMenuItem className="text-destructive" onClick={() => onAction('dropCollection', { connId, dbName, collName: coll.name })}>
          Drop collection
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
