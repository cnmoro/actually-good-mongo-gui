import { useMemo, useState, useCallback, memo } from 'react';
import { Copy, Check, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

function flattenKeys(obj, prefix = '') {
  const keys = [];
  if (!obj || typeof obj !== 'object') return keys;
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    keys.push(fullKey);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, fullKey));
    }
  }
  return keys;
}

function resolveField(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function CellValue({ value }) {
  if (value === null) return <span className="text-rose-400/70 italic">null</span>;
  if (value === undefined) return <span className="text-muted-foreground/50">—</span>;
  if (typeof value === 'boolean') return <span className="text-amber-400">{String(value)}</span>;
  if (typeof value === 'number') return <span className="text-sky-400">{value}</span>;
  if (typeof value === 'string') {
    if (value.length > 100) return <span className="text-foreground/80" title={value}>{value.slice(0, 100)}…</span>;
    return <span className="text-foreground/80">{value}</span>;
  }
  if (Array.isArray(value)) return <span className="text-muted-foreground">[{value.length} items]</span>;
  if (typeof value === 'object') return <span className="text-muted-foreground">{'{…}'}</span>;
  return <span>{String(value)}</span>;
}

const GridRow = memo(function GridRow({ doc, columns, isEven, onClick }) {
  return (
    <tr
      onClick={() => onClick?.(doc)}
      className={cn(
        'cursor-pointer hover:bg-primary/5 transition-colors border-b border-border/30',
        isEven ? 'bg-card' : 'bg-card/50'
      )}
    >
      {columns.map(col => (
        <td key={col} className="px-3 py-1.5 text-xs font-mono whitespace-nowrap max-w-[300px] overflow-hidden text-ellipsis">
          <CellValue value={resolveField(doc, col)} />
        </td>
      ))}
    </tr>
  );
});

export default function DataGrid({ documents, onSort, currentSort, onRowClick }) {
  const columns = useMemo(() => {
    if (!documents || documents.length === 0) return [];
    const keySet = new Set();
    const topLevel = new Set();
    documents.slice(0, 50).forEach(doc => {
      Object.keys(doc).forEach(k => {
        topLevel.add(k);
        keySet.add(k);
      });
    });
    // Prioritize _id first, then alphabetical
    const sorted = [...topLevel].sort((a, b) => {
      if (a === '_id') return -1;
      if (b === '_id') return 1;
      return a.localeCompare(b);
    });
    return sorted;
  }, [documents]);

  if (!documents || documents.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">
        No documents to display
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-left border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-secondary border-b border-border">
            {columns.map(col => {
              const sortDir = currentSort?.[col];
              return (
                <th
                  key={col}
                  onClick={() => onSort?.(col)}
                  className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                >
                  <span className="flex items-center gap-1">
                    {col}
                    {sortDir === 1 && <ArrowUp className="w-3 h-3 text-primary" />}
                    {sortDir === -1 && <ArrowDown className="w-3 h-3 text-primary" />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {documents.map((doc, i) => (
            <GridRow
              key={doc._id || i}
              doc={doc}
              columns={columns}
              isEven={i % 2 === 0}
              onClick={onRowClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}