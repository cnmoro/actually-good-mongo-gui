import { useState, useMemo, useCallback, memo } from 'react';
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_INLINE_LENGTH = 60;

function JsonValue({ value, depth = 0 }) {
  if (value === null) return <span className="text-rose-400">null</span>;
  if (value === undefined) return <span className="text-muted-foreground">undefined</span>;
  if (typeof value === 'boolean') return <span className="text-amber-400">{String(value)}</span>;
  if (typeof value === 'number') return <span className="text-sky-400">{value}</span>;
  if (typeof value === 'string') {
    if (value.length > 200) {
      return <span className="text-emerald-400">"{value.slice(0, 200)}..."</span>;
    }
    return <span className="text-emerald-400">"{value}"</span>;
  }
  if (Array.isArray(value)) return <JsonArray value={value} depth={depth} />;
  if (typeof value === 'object') return <JsonObject value={value} depth={depth} />;
  return <span>{String(value)}</span>;
}

function JsonArray({ value, depth }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const inline = JSON.stringify(value).length < MAX_INLINE_LENGTH;

  if (value.length === 0) return <span className="text-muted-foreground">[]</span>;

  if (inline && !expanded) {
    return (
      <span className="cursor-pointer hover:underline" onClick={() => setExpanded(true)}>
        <span className="text-muted-foreground">[</span>
        {value.map((v, i) => (
          <span key={i}>
            {i > 0 && <span className="text-muted-foreground">, </span>}
            <JsonValue value={v} depth={depth + 1} />
          </span>
        ))}
        <span className="text-muted-foreground">]</span>
      </span>
    );
  }

  return (
    <span>
      <span className="cursor-pointer inline-flex items-center" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
        <span className="text-muted-foreground">[</span>
        {!expanded && <span className="text-muted-foreground text-[10px] ml-1">{value.length} items</span>}
      </span>
      {expanded && (
        <div className="ml-4 border-l border-border/50 pl-2">
          {value.map((v, i) => (
            <div key={i} className="leading-5">
              <span className="text-muted-foreground text-[10px] mr-1">{i}:</span>
              <JsonValue value={v} depth={depth + 1} />
              {i < value.length - 1 && <span className="text-muted-foreground">,</span>}
            </div>
          ))}
        </div>
      )}
      {expanded && <span className="text-muted-foreground">]</span>}
    </span>
  );
}

function JsonObject({ value, depth }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const keys = Object.keys(value);
  const inline = JSON.stringify(value).length < MAX_INLINE_LENGTH;

  if (keys.length === 0) return <span className="text-muted-foreground">{'{}'}</span>;

  if (inline && !expanded) {
    return (
      <span className="cursor-pointer hover:underline" onClick={() => setExpanded(true)}>
        <span className="text-muted-foreground">{'{'}</span>
        {keys.map((k, i) => (
          <span key={k}>
            {i > 0 && <span className="text-muted-foreground">, </span>}
            <span className="text-violet-400">{k}</span>
            <span className="text-muted-foreground">: </span>
            <JsonValue value={value[k]} depth={depth + 1} />
          </span>
        ))}
        <span className="text-muted-foreground">{'}'}</span>
      </span>
    );
  }

  return (
    <span>
      <span className="cursor-pointer inline-flex items-center" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
        <span className="text-muted-foreground">{'{'}</span>
        {!expanded && <span className="text-muted-foreground text-[10px] ml-1">{keys.length} fields</span>}
      </span>
      {expanded && (
        <div className="ml-4 border-l border-border/50 pl-2">
          {keys.map((k, i) => (
            <div key={k} className="leading-5">
              <span className="text-violet-400">{k}</span>
              <span className="text-muted-foreground">: </span>
              <JsonValue value={value[k]} depth={depth + 1} />
              {i < keys.length - 1 && <span className="text-muted-foreground">,</span>}
            </div>
          ))}
        </div>
      )}
      {expanded && <span className="text-muted-foreground">{'}'}</span>}
    </span>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button onClick={handleCopy} className="p-1 hover:bg-muted rounded transition-colors">
      {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
    </button>
  );
}

const DocumentCard = memo(function DocumentCard({ doc, index, selected, onClick }) {
  const jsonStr = useMemo(() => JSON.stringify(doc, null, 2), [doc]);

  return (
    <div
      className={cn(
        "border rounded bg-card p-3 group cursor-pointer",
        selected ? "border-primary/60 ring-1 ring-primary/30" : "border-border"
      )}
      onClick={() => onClick?.(doc)}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono text-muted-foreground">
          {doc._id ? `_id: ${doc._id}` : `Document ${index}`}
        </span>
        <CopyButton text={jsonStr} />
      </div>
      <div className="text-xs font-mono leading-5">
        <JsonValue value={doc} depth={0} />
      </div>
    </div>
  );
});

export default function JsonViewer({ documents, viewMode = 'json', onDocumentClick, selectedDocumentId }) {
  if (!documents || documents.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">
        No documents to display
      </div>
    );
  }

  if (viewMode === 'raw') {
    const rawJson = JSON.stringify(documents, null, 2);
    return (
      <div className="relative">
        <div className="absolute top-2 right-2 z-10">
          <CopyButton text={rawJson} />
        </div>
        <pre className="text-xs font-mono p-4 overflow-auto max-h-[600px] leading-5 text-foreground/90">
          {rawJson}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      {documents.map((doc, i) => (
        <DocumentCard
          key={doc._id || i}
          doc={doc}
          index={i}
          selected={selectedDocumentId != null && String(doc._id) === String(selectedDocumentId)}
          onClick={onDocumentClick}
        />
      ))}
    </div>
  );
}

export { CopyButton, JsonValue };