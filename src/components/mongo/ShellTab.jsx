import { useState, useCallback, useEffect } from 'react';
import { Play, Clock, AlertCircle, Sparkles, Trash2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MongoApi } from '@/lib/mongo-api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import JsonViewer from './JsonViewer';
import DataGrid from './DataGrid';
import { cn } from '@/lib/utils';

export default function ShellTab({ connectionId, database, collection }) {
  const [query, setQuery] = useState(`db.${collection || 'users'}.find({})`);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showLlmSettings, setShowLlmSettings] = useState(false);
  const [llmSettings, setLlmSettings] = useState({ apiKey: '', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' });
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [viewMode, setViewMode] = useState('json');
  const [historyIdx, setHistoryIdx] = useState(-1);

  const execute = useCallback(async () => {
    if (!query.trim()) return;
    setExecuting(true);
    setError(null);
    const start = performance.now();
    try {
      const res = await MongoApi.executeShellCommand(connectionId, database, query.trim());
      const elapsed = Math.round(performance.now() - start);
      if (res.type === 'error') {
        setError(res.output);
        setResult(null);
      } else {
        setResult({ ...res, clientTime: elapsed });
        setError(null);
      }
      setHistory(prev => [query.trim(), ...prev.filter(h => h !== query.trim())].slice(0, 50));
      setHistoryIdx(-1);
    } catch (e) {
      setError(e.message);
      setResult(null);
    }
    setExecuting(false);
  }, [connectionId, query, database]);

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
    setError(null);
    try {
      const generated = await MongoApi.generateShellQuery(connectionId, database, collection, aiInstruction.trim());
      setQuery(generated.query);
    } catch (e) {
      setError(e.message || 'Failed to generate query');
    }
    setAiLoading(false);
  }, [connectionId, database, collection, aiInstruction]);

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      execute();
    }
    if (e.key === 'ArrowUp' && e.ctrlKey) {
      e.preventDefault();
      const newIdx = Math.min(historyIdx + 1, history.length - 1);
      if (history[newIdx]) {
        setHistoryIdx(newIdx);
        setQuery(history[newIdx]);
      }
    }
    if (e.key === 'ArrowDown' && e.ctrlKey) {
      e.preventDefault();
      const newIdx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(newIdx);
      setQuery(newIdx >= 0 ? history[newIdx] : '');
    }
  }, [execute, history, historyIdx]);

  useEffect(() => {
    const handleGlobalRefresh = (e) => {
      if (e.key !== 'F5') return;
      e.preventDefault();
      execute();
    };

    window.addEventListener('keydown', handleGlobalRefresh);
    return () => window.removeEventListener('keydown', handleGlobalRefresh);
  }, [execute]);

  const resultDocs = result?.type === 'documents' ? result.output : null;

  return (
    <div className="flex flex-col h-full">
      {/* Editor area */}
      <div className="border-b border-border">
        <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/30 border-b border-border/50">
          <span className="text-[10px] font-mono text-muted-foreground">
            {database} {'>'} Shell
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground mr-2">Ctrl+Enter to run</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setQuery(''); setResult(null); setError(null); }}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-10 bg-secondary/30 flex flex-col items-center pt-2 text-[10px] text-muted-foreground font-mono border-r border-border/30">
            {query.split('\n').map((_, i) => (
              <div key={i} className="leading-5 h-5">{i + 1}</div>
            ))}
          </div>
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-card text-foreground font-mono text-xs p-2 pl-12 resize-none focus:outline-none min-h-[80px] max-h-[200px] leading-5"
            spellCheck={false}
            rows={Math.min(query.split('\n').length + 1, 10)}
            placeholder="Type a MongoDB command..."
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/20 border-t border-border/50">
          <Button size="sm" className="h-6 text-xs gap-1" onClick={execute} disabled={executing}>
            <Play className="w-3 h-3" fill="currentColor" />
            {executing ? 'Running...' : 'Run'}
          </Button>
          <div className="h-4 w-px bg-border" />
          <Input
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            className="h-6 text-xs"
            placeholder="Describe the query you want..."
          />
          <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={generateQuery} disabled={aiLoading}>
            <Sparkles className="w-3 h-3" />
            {aiLoading ? 'Generating...' : 'Generate'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={async () => {
              await loadLlmSettings();
              setShowLlmSettings(true);
            }}
          >
            <Settings className="w-3 h-3" />
          </Button>
          {result && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {result.executionTime}ms (server) / {result.clientTime}ms (total)
            </span>
          )}
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {error && (
          <div className="m-3 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        {result && !error && (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 bg-secondary/20 shrink-0">
              <span className="text-[10px] font-mono text-muted-foreground">
                {result.type === 'documents' ? `${result.output.length} document(s)` : 'Result'}
              </span>
              {resultDocs && (
                <div className="ml-auto flex gap-0.5">
                  {['table', 'json', 'raw'].map(mode => (
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
              )}
            </div>

            <div className="flex-1 overflow-auto">
              {result.type === 'number' && (
                <div className="p-4 text-2xl font-mono text-primary font-bold">{result.output}</div>
              )}
              {resultDocs && viewMode === 'table' && (
                <DataGrid documents={resultDocs} />
              )}
              {resultDocs && (viewMode === 'json' || viewMode === 'raw') && (
                <JsonViewer documents={resultDocs} viewMode={viewMode} />
              )}
            </div>
          </>
        )}

        {!result && !error && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground/50">
            <div className="text-center">
              <div className="text-3xl mb-2 font-mono">&gt;_</div>
              <p className="text-xs">Execute a query to see results</p>
              <p className="text-[10px] mt-1">Ctrl+Enter to run • Ctrl+↑↓ for history</p>
            </div>
          </div>
        )}
      </div>

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
