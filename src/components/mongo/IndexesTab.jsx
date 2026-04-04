import { useState, useEffect } from 'react';
import { Key, CheckCircle2, Hash } from 'lucide-react';
import { MongoApi } from '@/lib/mongo-api';
import { cn } from '@/lib/utils';

export default function IndexesTab({ connectionId, database, collection }) {
  const [indexes, setIndexes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await MongoApi.getIndexes(connectionId, database, collection);
      setIndexes(result);
      setLoading(false);
    }
    load();
  }, [connectionId, database, collection]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-5 h-5 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Key className="w-4 h-4 text-primary" />
        Indexes on {collection}
      </h3>
      <div className="space-y-2">
        {indexes.map((idx, i) => (
          <div key={i} className="border border-border rounded p-3 bg-card">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-mono font-semibold">{idx.name}</span>
              {idx.unique && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">unique</span>
              )}
            </div>
            <div className="text-[11px] font-mono text-muted-foreground">
              Key: {JSON.stringify(idx.key)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}