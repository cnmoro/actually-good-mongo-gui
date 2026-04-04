import { useCallback, useRef } from 'react';
import { GripVertical, X, Copy, Eye, EyeOff, ChevronDown, ChevronRight, Play, Plus, MessageSquare, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { STAGE_OPERATORS, getStageConfig } from '@/lib/stage-config';

export default function StageList({
  stages, stageResults, selectedStageIdx,
  onSelectStage, onUpdateStage, onRemoveStage, onDuplicateStage,
  onReorderStages, onAddStage, onRunToStage
}) {
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  const handleDragStart = (idx) => {
    dragItem.current = idx;
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    dragOverItem.current = idx;
  };

  const handleDrop = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      onReorderStages(dragItem.current, dragOverItem.current);
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  // Find matching result for each stage (only enabled stages have results)
  const getStageResult = useCallback((stageIdx) => {
    let enabledCount = -1;
    for (let i = 0; i <= stageIdx; i++) {
      if (stages[i].enabled) enabledCount++;
    }
    return stages[stageIdx].enabled ? stageResults[enabledCount] : null;
  }, [stages, stageResults]);

  return (
    <div className="p-2 space-y-1">
      {stages.map((stage, idx) => {
        const config = getStageConfig(stage.operator);
        const result = getStageResult(idx);
        const isSelected = idx === selectedStageIdx;
        const hasError = stage.validationError;

        return (
          <div
            key={stage.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={handleDrop}
            onClick={() => onSelectStage(idx)}
            className={cn(
              'stage-card rounded border transition-all cursor-pointer',
              isSelected
                ? 'border-primary/50 bg-primary/5 shadow-sm shadow-primary/10'
                : 'border-border/50 bg-card hover:border-border',
              !stage.enabled && 'opacity-50'
            )}
          >
            {/* Stage header */}
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <GripVertical className="w-3 h-3 text-muted-foreground/50 cursor-grab shrink-0" />
              
              <span className={cn(
                'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded',
                `bg-${config.color}-500/20 text-${config.color}-400 border border-${config.color}-500/30`
              )}>
                {idx + 1}
              </span>

              <Select
                value={stage.operator}
                onValueChange={(v) => {
                  const newConfig = getStageConfig(v);
                  onUpdateStage(stage.id, { operator: v, body: newConfig.template });
                }}
              >
                <SelectTrigger className="h-6 text-[11px] font-mono font-semibold border-0 bg-transparent p-0 pl-1 w-auto min-w-[80px] focus:ring-0 shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_OPERATORS.map(op => (
                    <SelectItem key={op.operator} value={op.operator} className="text-xs font-mono">
                      {op.operator}
                      <span className="text-muted-foreground ml-2 text-[10px]">{op.description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex-1" />

              {result && (
                <span className="text-[9px] font-mono text-muted-foreground">
                  {result.outputCount} docs • {result.elapsedMs}ms
                </span>
              )}

              {result?.status === 'success' && (
                <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />
              )}
              {hasError && (
                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
              )}

              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={(e) => { e.stopPropagation(); onUpdateStage(stage.id, { enabled: !stage.enabled }); }}>
                {stage.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-muted-foreground" />}
              </Button>

              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={(e) => { e.stopPropagation(); onUpdateStage(stage.id, { collapsed: !stage.collapsed }); }}>
                {stage.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            </div>

            {/* Stage body (collapsible) */}
            {!stage.collapsed && (
              <div className="px-2 pb-2">
                {stage.comment && (
                  <div className="flex items-center gap-1 mb-1">
                    <MessageSquare className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground italic">{stage.comment}</span>
                  </div>
                )}

                <textarea
                  value={stage.body}
                  onChange={(e) => onUpdateStage(stage.id, { body: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full bg-background text-foreground font-mono text-[11px] p-2 resize-none rounded border border-border/50 focus:outline-none focus:border-primary/30 min-h-[60px] leading-4"
                  spellCheck={false}
                  rows={Math.min(stage.body.split('\n').length + 1, 8)}
                />

                {/* Stage doc delta */}
                {result && (
                  <div className="flex items-center gap-2 mt-1.5 text-[9px] font-mono">
                    <span className="text-muted-foreground">{result.inputCount} →</span>
                    <span className={cn(
                      'font-semibold',
                      result.outputCount > result.inputCount ? 'text-emerald-400' :
                      result.outputCount < result.inputCount ? 'text-amber-400' : 'text-muted-foreground'
                    )}>
                      {result.outputCount}
                    </span>
                    {result.outputCount !== result.inputCount && (
                      <span className={cn(
                        result.outputCount > result.inputCount ? 'text-emerald-400' : 'text-amber-400'
                      )}>
                        ({result.outputCount > result.inputCount ? '+' : ''}{result.outputCount - result.inputCount})
                      </span>
                    )}
                  </div>
                )}

                {/* Stage actions */}
                <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-border/30">
                  <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-0.5 px-1.5" onClick={(e) => { e.stopPropagation(); onRunToStage(idx); }}>
                    <Play className="w-2.5 h-2.5" fill="currentColor" /> Run to here
                  </Button>
                  <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-0.5 px-1.5" onClick={(e) => { e.stopPropagation(); onDuplicateStage(stage.id); }}>
                    <Copy className="w-2.5 h-2.5" /> Clone
                  </Button>
                  <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-0.5 px-1.5" onClick={(e) => { e.stopPropagation(); onAddStage('$match', idx); }}>
                    <Plus className="w-2.5 h-2.5" /> Add after
                  </Button>
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onRemoveStage(stage.id); }}>
                    <X className="w-2.5 h-2.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add stage button */}
      <div className="pt-2 flex justify-center">
        <Select onValueChange={(op) => onAddStage(op)}>
          <SelectTrigger className="h-7 text-xs w-auto border-dashed gap-1">
            <Plus className="w-3 h-3" />
            <SelectValue placeholder="Add stage..." />
          </SelectTrigger>
          <SelectContent>
            {STAGE_OPERATORS.map(op => (
              <SelectItem key={op.operator} value={op.operator} className="text-xs font-mono">
                {op.operator} — {op.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}