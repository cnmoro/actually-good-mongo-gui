import { useState, useCallback, useEffect } from 'react';
import { Play, ChevronLeft, ChevronRight, RefreshCw, Plus, Edit, Trash2, Sparkles, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MongoApi } from '@/lib/mongo-api';
import DataGrid from './DataGrid';
import JsonViewer from './JsonViewer';
import DocumentDrawer from './DocumentDrawer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';

function splitTopLevelArgs(argsStr) {
  const args = [];
  let depth = 0;
  let current = '';
  let inString = false;
  let quote = '';

  for (let i = 0; i < argsStr.length; i += 1) {
    const ch = argsStr[i];
    if (inString) {
      current += ch;
      if (ch === quote && argsStr[i - 1] !== '\\') inString = false;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === '{' || ch === '[' || ch === '(') depth += 1;
    if (ch === '}' || ch === ']' || ch === ')') depth -= 1;

    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) args.push(current.trim());
  return args;
}

function parseCollectionQuery(rawQuery, fallbackCollection) {
  const query = String(rawQuery || '').trim();
  if (!query) throw new Error('Query is empty');

  const getCollectionMatch = query.match(/db\.getCollection\((['"])([^'"]+)\1\)/);
  const directMatch = query.match(/db\.([A-Za-z0-9_]+)\./);
  const collectionName = getCollectionMatch?.[2] || directMatch?.[1] || fallbackCollection;

  const findMatch = query.match(/\.find\(([^)]*)\)/s);
  const aggregateMatch = query.match(/\.aggregate\(([^)]*)\)/s);

  if (aggregateMatch) {
    const pipeline = new Function(`return (${aggregateMatch[1]})`)();
    if (!Array.isArray(pipeline)) throw new Error('aggregate() expects an array pipeline');
    return { mode: 'aggregate', collectionName, pipeline };
  }

  if (!findMatch) throw new Error('Supported formats: db.getCollection(...).find(...) or .aggregate(...)');

  const args = splitTopLevelArgs(findMatch[1]);
  const filter = args[0]?.trim() ? new Function(`return (${args[0]})`)() : {};
  const projection = args[1]?.trim() ? new Function(`return (${args[1]})`)() : {};

  const sortMatch = query.match(/\.sort\(([^)]*)\)/s);
  const limitMatch = query.match(/\.limit\((\d+)\)/);
  const skipMatch = query.match(/\.skip\((\d+)\)/);

  return {
    mode: 'find',
    collectionName,
    filter,
    projection,
    sort: sortMatch ? new Function(`return (${sortMatch[1]})`)() : {},
    limit: limitMatch ? Number(limitMatch[1]) : null,
    skip: skipMatch ? Number(skipMatch[1]) : 0,
  };
}

export default function CollectionTab({ connectionId, database, collection }) {
  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [queryText, setQueryText] = useState(`db.getCollection('${collection}').find({})`);
  const [parsedQuery, setParsedQuery] = useState(null);
  const [queryError, setQueryError] = useState(null);
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState('table');
  const [execTime, setExecTime] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [drawerMode, setDrawerMode] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showLlmSettings, setShowLlmSettings] = useState(false);
  const [llmSettings, setLlmSettings] = useState({ apiKey: '', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' });
  const pageSize = 50;

  const fetchDocuments = useCallback(async (activeQuery, pageOverride = 0) => {
    if (!activeQuery) return;
    setLoading(true);
    setQueryError(null);
    try {
      if (activeQuery.mode === 'aggregate') {
        const result = await MongoApi.executeAggregate(
          connectionId,
          database,
          activeQuery.collectionName,
          activeQuery.pipeline,
          -1
        );
        setDocuments(result.results || []);
        setTotal(result.total || 0);
        setExecTime(result.totalExecutionTime || 0);
      } else {
        const effectiveLimit = activeQuery.limit ? Math.min(activeQuery.limit, pageSize) : pageSize;
        const result = await MongoApi.findDocuments(connectionId, database, activeQuery.collectionName, {
          filter: activeQuery.filter,
          sort: activeQuery.sort,
          projection: activeQuery.projection,
          skip: (activeQuery.skip || 0) + pageOverride * effectiveLimit,
          limit: effectiveLimit,
        });
        setDocuments(result.documents);
        setTotal(activeQuery.limit ? Math.min(result.total, activeQuery.limit) : result.total);
        setExecTime(result.executionTime);
      }
    } catch (e) {
      setQueryError(e.message || 'Query execution failed');
      setDocuments([]);
      setTotal(0);
    }
    setLoading(false);
  }, [connectionId, database]);

  useEffect(() => {
    const defaultQuery = `db.getCollection('${collection}').find({})`;
    setQueryText(defaultQuery);
    setPage(0);
    setQueryError(null);
    try {
      const parsed = parseCollectionQuery(defaultQuery, collection);
      setParsedQuery(parsed);
      fetchDocuments(parsed, 0);
    } catch (e) {
      setParsedQuery(null);
      setDocuments([]);
      setTotal(0);
      setQueryError(e.message || 'Invalid query');
    }
  }, [collection, fetchDocuments]);

  useEffect(() => {
    if (parsedQuery) fetchDocuments(parsedQuery, page);
  }, [page, parsedQuery, fetchDocuments]);

  const executeQuery = useCallback(async () => {
    try {
      const parsed = parseCollectionQuery(queryText, collection);
      setParsedQuery(parsed);
      setPage(0);
      await fetchDocuments(parsed, 0);
    } catch (e) {
      setQueryError(e.message || 'Invalid query');
    }
  }, [queryText, collection, fetchDocuments]);

  const handleDelete = useCallback(async (doc) => {
    await MongoApi.deleteDocument(connectionId, database, collection, doc._id);
    await fetchDocuments(parsedQuery, page);
    setSelectedDoc(null);
    setDrawerMode(null);
  }, [connectionId, database, collection, fetchDocuments, parsedQuery, page]);

  const handleSave = useCallback(async (doc) => {
    if (drawerMode === 'insert') {
      await MongoApi.insertDocument(connectionId, database, collection, doc);
    } else {
      await MongoApi.updateDocument(connectionId, database, collection, doc._id, doc);
    }
    await fetchDocuments(parsedQuery, page);
    setSelectedDoc(null);
    setDrawerMode(null);
  }, [connectionId, database, collection, drawerMode, fetchDocuments, parsedQuery, page]);

  const appendSnippet = useCallback((snippet) => {
    setQueryText((prev) => {
      if (prev.includes(snippet.split('(')[0])) return prev;
      return `${prev}${snippet}`;
    });
  }, []);

  const loadLlmSettings = useCallback(async () => {
    try {
      const settings = await MongoApi.getLlmSettings();
      setLlmSettings(settings);
    } catch {
      // no-op
    }
  }, []);

  const saveLlmSettings = useCallback(async () => {
    await MongoApi.saveLlmSettings(llmSettings);
    setShowLlmSettings(false);
  }, [llmSettings]);

  const generateQuery = useCallback(async () => {
    if (!aiInstruction.trim()) return;
    setAiLoading(true);
    setQueryError(null);
    try {
      const generated = await MongoApi.generateShellQuery(connectionId, database, collection, aiInstruction.trim());
      setQueryText(generated.query);
    } catch (e) {
      setQueryError(e.message || 'Failed to generate query');
    }
    setAiLoading(false);
  }, [aiInstruction, collection, connectionId, database]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border p-2 space-y-2 bg-secondary/20 shrink-0">
        <div className="flex items-start gap-2">
          <textarea
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            className="h-16 text-xs font-mono bg-card flex-1 rounded border border-input p-2 resize-y min-h-[52px] max-h-[180px]"
            placeholder={`db.getCollection('${collection}').find({})`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                executeQuery();
              }
            }}
          />
          <Button size="sm" className="h-7 text-xs gap-1 mt-0.5" onClick={executeQuery} disabled={loading}>
            <Play className="w-3 h-3" fill="currentColor" />
            Find
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 mt-0.5"
            onClick={() => {
              setDrawerMode('insert');
              setSelectedDoc({});
            }}
          >
            <Plus className="w-3 h-3" />
            Insert
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            className="h-7 text-xs"
            placeholder="Describe the Mongo query to generate..."
          />
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={generateQuery} disabled={aiLoading}>
            <Sparkles className="w-3 h-3" />
            {aiLoading ? 'Generating...' : 'Generate Query'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={async () => {
              await loadLlmSettings();
              setShowLlmSettings(true);
            }}
            title="LLM Settings"
          >
            <Settings className="w-3 h-3" />
          </Button>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => appendSnippet('.sort({ $natural: -1 })')}>
            + sort natural
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => appendSnippet('.limit(50)')}>
            + limit
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => appendSnippet('.skip(0)')}>
            + skip
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => appendSnippet('.sort({ _id: -1 })')}>
            + sort _id
          </Button>
        </div>
        {queryError && <div className="text-[11px] text-destructive">{queryError}</div>}
      </div>

      <div className="flex items-center justify-between px-3 py-1 bg-secondary/10 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-muted-foreground">
            {total} doc{total !== 1 ? 's' : ''} {execTime && `• ${execTime}ms`}
          </span>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => fetchDocuments(parsedQuery, page)}>
            <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {['table', 'json', 'raw'].map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  'px-2 py-0.5 text-[10px] rounded font-medium transition-colors',
                  viewMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {viewMode === 'json' && selectedDoc && (
            <>
              <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setDrawerMode('edit')}>
                <Edit className="w-3 h-3" /> Edit
              </Button>
              <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 text-destructive" onClick={() => setConfirmDeleteOpen(true)}>
                <Trash2 className="w-3 h-3" /> Delete
              </Button>
            </>
          )}

          <div className="flex items-center gap-1 ml-2">
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="w-3 h-3" />
            </Button>
            <span className="text-[10px] font-mono text-muted-foreground min-w-[60px] text-center">
              {page + 1} / {totalPages}
            </span>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-20">
            <div className="w-5 h-5 border-2 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {viewMode === 'table' ? (
          <DataGrid
            documents={documents}
            onRowClick={(doc) => {
              setSelectedDoc(doc);
              setDrawerMode('view');
            }}
          />
        ) : (
          <div className="overflow-auto h-full">
            <JsonViewer
              documents={documents}
              viewMode={viewMode}
              onDocumentClick={(doc) => setSelectedDoc(doc)}
              selectedDocumentId={selectedDoc?._id}
            />
          </div>
        )}
      </div>

      {selectedDoc && drawerMode && (
        <DocumentDrawer
          document={selectedDoc}
          mode={drawerMode}
          onClose={() => {
            setSelectedDoc(null);
            setDrawerMode(null);
          }}
          onSave={handleSave}
          onDelete={handleDelete}
          onEdit={() => setDrawerMode('edit')}
          onClone={() => {
            setDrawerMode('insert');
            setSelectedDoc({ ...selectedDoc, _id: undefined });
          }}
        />
      )}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected document?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                if (selectedDoc) await handleDelete(selectedDoc);
                setConfirmDeleteOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showLlmSettings} onOpenChange={setShowLlmSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>LLM Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">OpenAI API Key</label>
              <Input
                type="password"
                value={llmSettings.apiKey}
                onChange={(e) => setLlmSettings((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="sk-..."
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Model</label>
              <Input
                value={llmSettings.model}
                onChange={(e) => setLlmSettings((prev) => ({ ...prev, model: e.target.value }))}
                placeholder="gpt-4o-mini"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Base URL</label>
              <Input
                value={llmSettings.baseUrl}
                onChange={(e) => setLlmSettings((prev) => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://api.openai.com/v1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLlmSettings(false)}>Cancel</Button>
            <Button onClick={saveLlmSettings}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
