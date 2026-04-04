import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MongoApi } from '@/lib/mongo-api';

export default function DataTransferDialog({ open, onOpenChange, connections }) {
  const [step, setStep] = useState(1);
  const [scope, setScope] = useState('database');
  const [sourceConnectionId, setSourceConnectionId] = useState('');
  const [targetConnectionId, setTargetConnectionId] = useState('');
  const [sourceDatabase, setSourceDatabase] = useState('');
  const [targetDatabase, setTargetDatabase] = useState('');
  const [sourceCollection, setSourceCollection] = useState('');
  const [targetCollection, setTargetCollection] = useState('');
  const [mode, setMode] = useState('append');
  const [status, setStatus] = useState('');
  const [dbOptions, setDbOptions] = useState({});
  const [collectionOptions, setCollectionOptions] = useState([]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setStatus('');
    const first = connections?.[0]?.id || '';
    const second = connections?.[1]?.id || first;
    setSourceConnectionId(first);
    setTargetConnectionId(second);
    setSourceDatabase('');
    setTargetDatabase('');
    setSourceCollection('');
    setTargetCollection('');
    setMode('append');
  }, [open, connections]);

  useEffect(() => {
    if (!open || !sourceConnectionId) return;
    if (dbOptions[sourceConnectionId]) return;
    MongoApi.listDatabases(sourceConnectionId)
      .then((items) => {
        setDbOptions((prev) => ({ ...prev, [sourceConnectionId]: items || [] }));
      })
      .catch(() => {
        setDbOptions((prev) => ({ ...prev, [sourceConnectionId]: [] }));
      });
  }, [open, sourceConnectionId, dbOptions]);

  useEffect(() => {
    if (!open || !targetConnectionId) return;
    if (dbOptions[targetConnectionId]) return;
    MongoApi.listDatabases(targetConnectionId)
      .then((items) => {
        setDbOptions((prev) => ({ ...prev, [targetConnectionId]: items || [] }));
      })
      .catch(() => {
        setDbOptions((prev) => ({ ...prev, [targetConnectionId]: [] }));
      });
  }, [open, targetConnectionId, dbOptions]);

  useEffect(() => {
    if (!sourceConnectionId || !sourceDatabase || scope !== 'collection') {
      setCollectionOptions([]);
      return;
    }
    MongoApi.listCollections(sourceConnectionId, sourceDatabase)
      .then((items) => setCollectionOptions(items || []))
      .catch(() => setCollectionOptions([]));
  }, [sourceConnectionId, sourceDatabase, scope]);

  const executeTransfer = async () => {
    setStatus('Running transfer...');
    const result = await MongoApi.transferData({
      sourceConnectionId,
      targetConnectionId,
      sourceDatabase,
      targetDatabase: targetDatabase || sourceDatabase,
      sourceCollection: scope === 'collection' ? sourceCollection : undefined,
      targetCollection: scope === 'collection' ? (targetCollection || sourceCollection) : undefined,
      mode,
    });
    setStatus(`Done: ${result.documentsTransferred} docs across ${result.collectionsProcessed} collection(s).`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Data Transfer</DialogTitle>
          <DialogDescription>
            Step {step} of 3: source/target, scope and mapping, review and execute.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-xs font-medium">Source connection</div>
                <select className="h-9 w-full rounded border border-input bg-background px-2 text-sm" value={sourceConnectionId} onChange={(e) => setSourceConnectionId(e.target.value)}>
                  {(connections || []).map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name || conn.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium">Target connection</div>
                <select className="h-9 w-full rounded border border-input bg-background px-2 text-sm" value={targetConnectionId} onChange={(e) => setTargetConnectionId(e.target.value)}>
                  {(connections || []).map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name || conn.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-xs font-medium">Source database</div>
                <select className="h-9 w-full rounded border border-input bg-background px-2 text-sm" value={sourceDatabase} onChange={(e) => setSourceDatabase(e.target.value)}>
                  <option value="">Select database...</option>
                  {(dbOptions[sourceConnectionId] || []).map((db) => (
                    <option key={db.name} value={db.name}>{db.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium">Target database</div>
                <Input value={targetDatabase} onChange={(e) => setTargetDatabase(e.target.value)} placeholder={sourceDatabase || 'Target database'} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-medium">Transfer scope</div>
              <select className="h-9 w-full rounded border border-input bg-background px-2 text-sm" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="database">Full database</option>
                <option value="collection">Single collection</option>
              </select>
            </div>
            {scope === 'collection' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-1 text-xs font-medium">Source collection</div>
                  <select className="h-9 w-full rounded border border-input bg-background px-2 text-sm" value={sourceCollection} onChange={(e) => setSourceCollection(e.target.value)}>
                    <option value="">Select collection...</option>
                    {collectionOptions.map((item) => (
                      <option key={item.name} value={item.name}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium">Target collection</div>
                  <Input value={targetCollection} onChange={(e) => setTargetCollection(e.target.value)} placeholder={sourceCollection || 'Target collection'} />
                </div>
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-medium">Write behavior</div>
              <select className="h-9 w-full rounded border border-input bg-background px-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="append">Append to existing data</option>
                <option value="replace">Replace target data</option>
              </select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="rounded border border-border p-3 text-xs space-y-1">
              <div><strong>Source:</strong> {sourceConnectionId} / {sourceDatabase}{scope === 'collection' ? ` / ${sourceCollection}` : ''}</div>
              <div><strong>Target:</strong> {targetConnectionId} / {targetDatabase || sourceDatabase}{scope === 'collection' ? ` / ${targetCollection || sourceCollection}` : ''}</div>
              <div><strong>Mode:</strong> {mode}</div>
            </div>
            {status && <div className="rounded border border-border bg-secondary/40 p-2 text-xs">{status}</div>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" disabled={step === 1} onClick={() => setStep((prev) => Math.max(1, prev - 1))}>Back</Button>
          {step < 3 ? (
            <Button onClick={() => setStep((prev) => Math.min(3, prev + 1))}>Next</Button>
          ) : (
            <Button onClick={executeTransfer}>Start transfer</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
