import { useState, useMemo } from 'react';
import { Clock, Hash, ArrowRight, AlertTriangle, Zap, BarChart3, Info, ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import DataGrid from './DataGrid';
import JsonViewer from './JsonViewer';
import { getStageConfig } from '@/lib/stage-config';

export default function StageResults({ stages, stageResults, selectedStageIdx, selectedResult, totalExecTime, explainData, executing }) {
  const [viewMode, setViewMode] = useState('table');
  const [showOverview, setShowOverview] = useState(false);

  // Compute diff between consecutive stages
  const stageDiff = useMemo(() => {
    if (!selectedResult || !stageResults.length) return null;
    const idx = selectedResult.stageIndex;
    const prev = idx > 0 ? stageResults[idx - 1] : null;
    const current = selectedResult;
    
    if (!prev) return { countDelta: 0, fieldsAdded: [], fieldsRemoved: [] };

    const prevFields = new Set();
    const currFields = new Set();
    
    prev.preview?.slice(0, 5).forEach(doc => Object.keys(doc).forEach(k => prevFields.add(k)));
    current.preview?.slice(0, 5).forEach(doc => Object.keys(doc).forEach(k => currFields.add(k)));

    return {
      countDelta: current.outputCount - prev.outputCount,
      fieldsAdded: [...currFields].filter(f => !prevFields.has(f)),
      fieldsRemoved: [...prevFields].filter(f => !currFields.has(f)),
    };
  }, [selectedResult, stageResults]);

  if (executing) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-muted-foreground">Executing pipeline...</p>
        </div>
      </div>
    );
  }

  if (!stageResults.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-xs">
          <BarChart3 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-xs text-muted-foreground">Run the pipeline to inspect results</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">Click "Run All" or "Run to Stage" to see output at each step</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Pipeline overview bar */}
      <div className="border-b border-border/50 bg-secondary/10 shrink-0">
        <div className="flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto">
          {stageResults.map((sr, i) => {
            const config = getStageConfig(sr.operator);
            const isSelected = sr.stageIndex === selectedResult?.stageIndex;
            return (
              <button
                key={i}
                onClick={() => {
                  // Find the stage index that corresponds to this result
                  let count = -1;
                  for (let j = 0; j < stages.length; j++) {
                    if (stages[j].enabled) count++;
                    if (count === i) {
                      // Found the original stage index
                      // Just select the result by its stageIndex
                      break;
                    }
                  }
                  // Map back to stages array index
                  let enabledIdx = -1;
                  for (let j = 0; j < stages.length; j++) {
                    if (stages[j].enabled) enabledIdx++;
                    if (enabledIdx === i) {
                      onSelectStageByIdx(j);
                      break;
                    }
                  }
                }}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap transition-colors',
                  isSelected
                    ? `bg-${config.color}-500/20 text-${config.color}-400 border border-${config.color}-500/30`
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                )}
              >
                <span className="font-bold">{sr.stageIndex + 1}</span>
                <span>{sr.operator}</span>
                <span className="text-[9px] opacity-70">{sr.outputCount}</span>
                {i < stageResults.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/50 ml-1" />}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> {totalExecTime}ms total
            </span>
          </div>
        </div>

        {/* Document flow visualization */}
        <div className="px-3 pb-1.5 flex items-center gap-1">
          {stageResults.map((sr, i) => {
            const maxCount = Math.max(...stageResults.map(s => s.outputCount), 1);
            const width = Math.max(8, (sr.outputCount / maxCount) * 100);
            const config = getStageConfig(sr.operator);
            return (
              <div key={i} className="flex items-center gap-0.5 flex-1 min-w-0">
                <div
                  className={cn('h-1.5 rounded-full transition-all', `bg-${config.color}-400`)}
                  style={{ width: `${width}%`, minWidth: '4px' }}
                  title={`${sr.operator}: ${sr.outputCount} documents`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected stage metadata */}
      {selectedResult && (
        <div className="border-b border-border/50 px-3 py-2 bg-card/50 shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Hash className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Stage</span>
              <span className="text-xs font-mono font-semibold">{selectedResult.stageIndex + 1}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-primary font-semibold">{selectedResult.operator}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{selectedResult.elapsedMs}ms</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">
                {selectedResult.inputCount} → {selectedResult.outputCount} docs
              </span>
              {stageDiff && stageDiff.countDelta !== 0 && (
                <span className={cn(
                  'text-[10px] font-mono flex items-center gap-0.5',
                  stageDiff.countDelta > 0 ? 'text-emerald-400' : 'text-amber-400'
                )}>
                  {stageDiff.countDelta > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                  {Math.abs(stageDiff.countDelta)}
                </span>
              )}
            </div>
            {stageDiff?.fieldsAdded?.length > 0 && (
              <span className="text-[10px] text-emerald-400">+fields: {stageDiff.fieldsAdded.join(', ')}</span>
            )}
            {stageDiff?.fieldsRemoved?.length > 0 && (
              <span className="text-[10px] text-rose-400">-fields: {stageDiff.fieldsRemoved.join(', ')}</span>
            )}
          </div>

          {/* Explain data for this stage */}
          {explainData?.stages?.[selectedResult.stageIndex] && (
            <div className="mt-1.5 flex items-center gap-3">
              <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" />
                Cost: {explainData.stages[selectedResult.stageIndex].estimatedCost}
              </span>
              <span className="text-[9px] text-muted-foreground">
                Scan: {explainData.stages[selectedResult.stageIndex].scanType}
              </span>
              {explainData.stages[selectedResult.stageIndex].indexUsed && (
                <span className="text-[9px] text-primary">
                  Index: {explainData.stages[selectedResult.stageIndex].indexUsed}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* View mode toggle */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/30 bg-secondary/5 shrink-0">
        <span className="text-[10px] text-muted-foreground">
          {selectedResult?.preview?.length || 0} documents (preview)
        </span>
        <div className="flex gap-0.5">
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
      </div>

      {/* Result data */}
      <div className="flex-1 overflow-auto">
        {selectedResult?.preview && viewMode === 'table' && (
          <DataGrid documents={selectedResult.preview} />
        )}
        {selectedResult?.preview && (viewMode === 'json' || viewMode === 'raw') && (
          <JsonViewer documents={selectedResult.preview} viewMode={viewMode} />
        )}
      </div>

      {/* Explain warnings */}
      {explainData?.warnings?.length > 0 && (
        <div className="border-t border-border/50 px-3 py-1.5 bg-amber-500/5 shrink-0">
          {explainData.warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] text-amber-400">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function onSelectStageByIdx() {
  // This is a placeholder — the parent manages selection via selectedStageIdx prop
  // In the overview bar, clicking doesn't change selection since we'd need a callback
}