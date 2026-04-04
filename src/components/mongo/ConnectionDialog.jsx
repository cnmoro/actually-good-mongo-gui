import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plug, TestTube, Loader2, CheckCircle2, XCircle, Save, Trash2 } from 'lucide-react';
import { MongoApi } from '@/lib/mongo-api';
import { cn } from '@/lib/utils';

const DEFAULT_CONN = { name: '', host: 'localhost', port: 27017, authDb: 'admin', username: '', password: '', replicaSet: '', tls: false, directConnection: true, uri: '' };

export default function ConnectionDialog({ open, onOpenChange, connections, onConnect, onSaveConnection, onRemoveConnection }) {
  const [selectedId, setSelectedId] = useState(connections[0]?.id || null);
  const [form, setForm] = useState(DEFAULT_CONN);
  const [mode, setMode] = useState('form');
  const [testState, setTestState] = useState(null); // null | 'testing' | 'success' | 'error'
  const [connecting, setConnecting] = useState(false);

  const selectConnection = (conn) => {
    setSelectedId(conn.id);
    setForm({ ...DEFAULT_CONN, ...conn });
    setTestState(null);
  };

  const handleTest = async () => {
    setTestState('testing');
    try {
      await MongoApi.testConnection(form);
      setTestState('success');
    } catch {
      setTestState('error');
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const saved = await onSaveConnection(form);
      const result = await MongoApi.connect(saved.id);
      onConnect(saved.id || selectedId, result);
      onOpenChange(false);
    } catch {
      setTestState('error');
    }
    setConnecting(false);
  };

  const handleNew = () => {
    setSelectedId(null);
    setForm(DEFAULT_CONN);
    setTestState(null);
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 bg-card border-border overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Plug className="w-4 h-4 text-primary" />
            Connection Manager
          </DialogTitle>
        </DialogHeader>

        <div className="flex h-[420px]">
          {/* Saved connections list */}
          <div className="w-52 border-r border-border flex flex-col">
            <div className="p-2 border-b border-border">
              <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={handleNew}>
                <Plus className="w-3 h-3 mr-1" /> New Connection
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {connections.map(conn => (
                <button
                  key={conn.id}
                  onClick={() => selectConnection(conn)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs hover:bg-muted/50 border-b border-border/50',
                    selectedId === conn.id && 'bg-muted text-foreground'
                  )}
                >
                  <div className="font-medium truncate">{conn.name || 'Unnamed'}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{conn.host}:{conn.port}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Connection form */}
          <div className="flex-1 p-4 overflow-y-auto">
            <Tabs value={mode} onValueChange={setMode}>
              <TabsList className="h-7 mb-4">
                <TabsTrigger value="form" className="text-xs h-6">Standard</TabsTrigger>
                <TabsTrigger value="uri" className="text-xs h-6">URI</TabsTrigger>
              </TabsList>

              <TabsContent value="form" className="space-y-3 mt-0">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Connection Name</Label>
                    <Input value={form.name} onChange={e => update('name', e.target.value)} className="h-7 text-xs mt-1" placeholder="My Connection" />
                  </div>
                  <div />
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Host</Label>
                    <Input value={form.host} onChange={e => update('host', e.target.value)} className="h-7 text-xs mt-1" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Port</Label>
                    <Input type="number" value={form.port} onChange={e => update('port', parseInt(e.target.value) || 27017)} className="h-7 text-xs mt-1" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Auth Database</Label>
                    <Input value={form.authDb} onChange={e => update('authDb', e.target.value)} className="h-7 text-xs mt-1" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Replica Set</Label>
                    <Input value={form.replicaSet} onChange={e => update('replicaSet', e.target.value)} className="h-7 text-xs mt-1" placeholder="rs0" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Username</Label>
                    <Input value={form.username} onChange={e => update('username', e.target.value)} className="h-7 text-xs mt-1" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Password</Label>
                    <Input type="password" value={form.password} onChange={e => update('password', e.target.value)} className="h-7 text-xs mt-1" />
                  </div>
                </div>
                <div className="flex items-center gap-6 pt-1">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.tls} onCheckedChange={v => update('tls', v)} className="scale-75" />
                    <Label className="text-[11px]">TLS/SSL</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.directConnection} onCheckedChange={v => update('directConnection', v)} className="scale-75" />
                    <Label className="text-[11px]">Direct Connection</Label>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="uri" className="mt-0">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Connection URI</Label>
                  <Input value={form.uri} onChange={e => update('uri', e.target.value)} className="h-7 text-xs mt-1 font-mono" placeholder="mongodb://localhost:27017" />
                </div>
              </TabsContent>
            </Tabs>

            {testState && (
              <div className={cn(
                'mt-3 px-3 py-2 rounded text-xs flex items-center gap-2 border',
                testState === 'success' && 'bg-primary/10 border-primary/30 text-primary',
                testState === 'error' && 'bg-destructive/10 border-destructive/30 text-destructive',
                testState === 'testing' && 'bg-muted border-border text-muted-foreground'
              )}>
                {testState === 'testing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {testState === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
                {testState === 'error' && <XCircle className="w-3.5 h-3.5" />}
                {testState === 'testing' ? 'Testing connection...' : testState === 'success' ? 'Connection successful — MongoDB 7.0.4' : 'Connection failed'}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-4 py-3 border-t border-border flex-row justify-between">
          <div>
            {selectedId && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:text-destructive"
                onClick={async () => {
                  await onRemoveConnection(selectedId);
                  handleNew();
                }}
              >
                <Trash2 className="w-3 h-3 mr-1" /> Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={handleTest}>
              <TestTube className="w-3 h-3 mr-1" /> Test
            </Button>
            <Button size="sm" className="text-xs" onClick={handleConnect} disabled={connecting}>
              {connecting && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Connect
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Plus(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M5 12h14"/><path d="M12 5v14"/></svg>
  );
}