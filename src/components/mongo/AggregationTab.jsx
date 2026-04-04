import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Play, Plus, Download, Upload, RotateCcw, FileJson, Code, StepForward, Zap, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MongoApi } from '@/lib/mongo-api';
import { createStage, pipelineToMongo, pipelineToJSON, pipelineToJS, STAGE_OPERATORS } from '@/lib/stage-config';
import StageList from './StageList';
import StageResults from './StageResults';
import { cn } from '@/lib/utils';
import { CopyButton } from './JsonViewer';

export default function AggregationTab({ connectionId, database, collection, tabId, getTabState, setTabState }) {
  const [stages, setStages] = useState([createStage('$match'), createStage('$group')]);
  const [stageResults, setStageResults] = useState([]);
  const [selectedStageIdx, setSelectedStageIdx] = useState(0);
  const [executing, setExecuting] = useState(false);
  const [pipelineName, setPipelineName] = useState('');
  const [totalExecTime, setTotalExecTime] = useState(null);
  const [executionMode, setExecutionMode] = useState('full'); // 'full' | 'toStage' | 'step'
  const [dirty, setDirty] = useState(false);
  const [explainData, setExplainData] = useState(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [showExplainModal, setShowExplainModal] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current || !tabId || !getTabState) return;
    const saved = getTabState(tabId)?.aggregationState;
    if (saved) {
      if (Array.isArray(saved.stages) && saved.stages.length) setStages(saved.stages);
      if (typeof saved.selectedStageIdx === 'number') setSelectedStageIdx(saved.selectedStageIdx);
      if (typeof saved.pipelineName === 'string') setPipelineName(saved.pipelineName);
      if (typeof saved.executionMode === 'string') setExecutionMode(saved.executionMode);
      if (typeof saved.dirty === 'boolean') setDirty(saved.dirty);
      if (Array.isArray(saved.stageResults)) setStageResults(saved.stageResults);
      if (saved.totalExecTime != null) setTotalExecTime(saved.totalExecTime);
      if (saved.explainData != null) setExplainData(saved.explainData);
    }
    hydratedRef.current = true;
  }, [tabId, getTabState]);

  useEffect(() => {
    if (!tabId || !setTabState || !hydratedRef.current) return;
    setTabState(tabId, {
      aggregationState: {
        stages,
        stageResults,
        selectedStageIdx,
        pipelineName,
        totalExecTime,
        executionMode,
        dirty,
        explainData,
      },
    });
  }, [tabId, setTabState, stages, stageResults, selectedStageIdx, pipelineName, totalExecTime, executionMode, dirty, explainData]);

  const markDirty = useCallback(() => setDirty(true), []);

  const addStage = useCallback((operator = '$match', afterIndex = -1) => {
    const newStage = createStage(operator);
    setStages(prev => {
      if (afterIndex >= 0) {
        const next = [...prev];
        next.splice(afterIndex + 1, 0, newStage);
        return next;
      }
      return [...prev, newStage];
    });
    markDirty();
  }, [markDirty]);

  const removeStage = useCallback((id) => {
    setStages(prev => prev.filter(s => s.id !== id));
    markDirty();
  }, [markDirty]);

  const updateStage = useCallback((id, data) => {
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    markDirty();
  }, [markDirty]);

  const duplicateStage = useCallback((id) => {
    setStages(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      const clone = { ...prev[idx], id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
    markDirty();
  }, [markDirty]);

  const reorderStages = useCallback((fromIndex, toIndex) => {
    setStages(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    markDirty();
  }, [markDirty]);

  const executePipeline = useCallback(async (mode = 'full', targetIdx = -1) => {
    setExecuting(true);
    const mongoStages = pipelineToMongo(stages);
    const originalTargetIdx = targetIdx >= 0 ? targetIdx : selectedStageIdx;
    let enabledStageIdx = -1;
    for (let i = 0; i <= originalTargetIdx && i < stages.length; i += 1) {
      if (stages[i].enabled) enabledStageIdx += 1;
    }
    const stopAt = mode === 'full' ? -1 : enabledStageIdx;

    const result = await MongoApi.executeAggregate(connectionId, database, collection, mongoStages, stopAt);
    setStageResults(result.stageResults);
    setTotalExecTime(result.totalExecutionTime);
    setExecuting(false);
  }, [connectionId, stages, database, collection, selectedStageIdx]);

  const executeExplain = useCallback(async () => {
    const mongoStages = pipelineToMongo(stages);
    const result = await MongoApi.explainPipeline(connectionId, database, collection, mongoStages);
    setExplainData(result);
    setShowExplainModal(true);
  }, [connectionId, stages, database, collection]);

  const handleReset = useCallback(() => {
    setStages([]);
    setStageResults([]);
    setSelectedStageIdx(0);
    setTotalExecTime(null);
    setExplainData(null);
    setDirty(false);
  }, []);

  const handleExport = useCallback((format) => {
    const content = format === 'json' ? pipelineToJSON(stages) : pipelineToJS(collection, stages);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `pipeline.${format === 'json' ? 'json' : 'js'}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [stages, collection]);

  const handleImport = useCallback(() => {
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const pipeline = JSON.parse(text);
        if (Array.isArray(pipeline)) {
          const imported = pipeline.map((stage, i) => {
            const [op, body] = Object.entries(stage)[0];
            return {
              id: `stage_${Date.now()}_${i}`,
              operator: op,
              body: typeof body === 'string' ? `"${body}"` : JSON.stringify(body, null, 2),
              enabled: true,
              collapsed: false,
              comment: '',
              validationError: null,
            };
          });
          setStages(imported);
          markDirty();
        }
      } catch { /* */ }
    };
    input.click();
  }, [markDirty]);

  const selectedStageResult = useMemo(() => {
    if (!stageResults.length) return null;
    // Map by counting enabled stages
    let enabledIdx = -1;
    for (let i = 0; i <= selectedStageIdx && i < stages.length; i++) {
      if (stages[i].enabled) enabledIdx++;
    }
    return stageResults[enabledIdx] || stageResults[stageResults.length - 1];
  }, [stageResults, selectedStageIdx, stages]);

  const fullAggregateCode = useMemo(() => {
    const enabled = stages.filter((stage) => stage.enabled);
    const stageLines = enabled.map((stage) => `  { ${JSON.stringify(stage.operator)}: ${stage.body.trim()} }`);
    return `db.getCollection(${JSON.stringify(collection)}).aggregate([\n${stageLines.join(',\n')}\n])`;
  }, [stages, collection]);

  const explainJson = useMemo(() => {
    return explainData ? JSON.stringify(explainData, null, 2) : '';
  }, [explainData]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/20 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <input
            value={pipelineName}
            onChange={e => setPipelineName(e.target.value)}
            className="bg-transparent text-xs font-semibold focus:outline-none placeholder:text-muted-foreground w-40"
            placeholder="Pipeline name..."
          />
          {dirty && <span className="text-[10px] text-amber-400">● unsaved</span>}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={handleImport}>
            <Upload className="w-3 h-3" /> Import
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => handleExport('json')}>
            <FileJson className="w-3 h-3" /> JSON
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => handleExport('js')}>
            <Code className="w-3 h-3" /> JS
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setShowCodeModal(true)}>
            <Eye className="w-3 h-3" /> View Code
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={handleReset}>
            <RotateCcw className="w-3 h-3" /> Reset
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={executeExplain}>
            <Zap className="w-3 h-3" /> Explain
          </Button>
          <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => executePipeline('toStage')} disabled={executing}>
            <StepForward className="w-3 h-3" /> Run to Stage
          </Button>
          <Button size="sm" className="h-6 text-[10px] gap-1 bg-primary hover:bg-primary/90" onClick={() => executePipeline('full')} disabled={executing}>
            <Play className="w-3 h-3" fill="currentColor" />
            {executing ? 'Running...' : 'Run All'}
          </Button>
        </div>
      </div>

      {/* Main content: stages + results */}
      <div className="flex-1 flex overflow-hidden">
        {/* Stage list */}
        <div className="w-[420px] border-r border-border flex flex-col shrink-0 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-secondary/10 shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Pipeline Stages ({stages.length})
            </span>
            <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1" onClick={() => addStage()}>
              <Plus className="w-3 h-3" /> Add
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <StageList
              stages={stages}
              stageResults={stageResults}
              selectedStageIdx={selectedStageIdx}
              onSelectStage={setSelectedStageIdx}
              onUpdateStage={updateStage}
              onRemoveStage={removeStage}
              onDuplicateStage={duplicateStage}
              onReorderStages={reorderStages}
              onAddStage={addStage}
              onRunToStage={(idx) => executePipeline('toStage', idx)}
            />
          </div>
        </div>

        {/* Results panel */}
        <div className="flex-1 overflow-hidden">
          <StageResults
            stages={stages}
            stageResults={stageResults}
            selectedStageIdx={selectedStageIdx}
            selectedResult={selectedStageResult}
            totalExecTime={totalExecTime}
            explainData={explainData}
            executing={executing}
          />
        </div>
      </div>

      <Dialog open={showCodeModal} onOpenChange={setShowCodeModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Aggregate Code</DialogTitle>
          </DialogHeader>
          <div className="relative rounded border border-border bg-secondary/20">
            <div className="absolute right-2 top-2 z-10">
              <CopyButton text={fullAggregateCode} />
            </div>
            <pre className="max-h-[65vh] overflow-auto p-4 text-xs font-mono leading-5">
              {fullAggregateCode}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCodeModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExplainModal} onOpenChange={setShowExplainModal}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Explain Result</DialogTitle>
          </DialogHeader>
          <div className="relative rounded border border-border bg-secondary/20">
            {explainJson && (
              <div className="absolute right-2 top-2 z-10">
                <CopyButton text={explainJson} />
              </div>
            )}
            <pre className="max-h-[65vh] overflow-auto p-4 text-xs font-mono leading-5">
              {explainJson || 'No explain data available.'}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExplainModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
