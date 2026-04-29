import { useEffect, useState } from 'react';
import { X, Save, Trash2, Edit, Copy, Check, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { JsonValue } from './JsonViewer';

export default function DocumentDrawer({ document: doc, mode, onClose, onSave, onDelete, onEdit }) {
  const [editText, setEditText] = useState(JSON.stringify(doc, null, 2));
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [pendingSaveDoc, setPendingSaveDoc] = useState(null);

  const isEditing = mode === 'edit' || mode === 'insert';

  useEffect(() => {
    setEditText(JSON.stringify(doc, null, 2));
    setError(null);
    setPendingSaveDoc(null);
    setConfirmSaveOpen(false);
  }, [doc, mode]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(editText);
      setError(null);
      if (mode === 'edit') {
        setPendingSaveDoc(parsed);
        setConfirmSaveOpen(true);
        return;
      }
      onSave(parsed);
    } catch (e) {
      setError('Invalid JSON: ' + e.message);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${doc._id || 'document'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const textToCopy = JSON.stringify(doc, null, 2);
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch {
      const el = window.document.createElement('textarea');
      el.value = textToCopy;
      el.setAttribute('readonly', '');
      el.style.position = 'absolute';
      el.style.left = '-9999px';
      window.document.body.appendChild(el);
      el.select();
      window.document.execCommand('copy');
      window.document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-card border-l border-border z-[90] flex flex-col shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/30 shrink-0">
        <div>
          <h3 className="text-xs font-semibold">
            {mode === 'insert' ? 'Insert Document' : mode === 'edit' ? 'Edit Document' : 'Document Preview'}
          </h3>
          {doc._id && (
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">_id: {doc._id}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {mode === 'view' && (
            <>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onEdit} title="Edit">
                <Edit className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={handleCopy}
                title="Copy JSON"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleDownload} title="Download">
                <Download className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => setConfirmDeleteOpen(true)} title="Delete">
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto relative z-0 pb-24">
        {isEditing ? (
          <div className="p-2 min-h-full">
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className="w-full min-h-[calc(100vh-190px)] bg-background text-foreground font-mono text-xs p-3 resize-none focus:outline-none rounded border border-border"
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="p-4 text-xs font-mono leading-5">
            <JsonValue value={doc} depth={0} />
          </div>
        )}
      </div>

      {/* Footer */}
      {isEditing && (
        <div className="absolute left-0 right-0 bottom-0 border-t border-border px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] bg-secondary/20 z-[120] pointer-events-auto">
          {error && <p className="text-[10px] text-destructive mb-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="text-xs pointer-events-auto" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="text-xs gap-1 pointer-events-auto" onClick={handleSave}>
              <Save className="w-3 h-3" />
              {mode === 'insert' ? 'Insert' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                onDelete(doc);
                setConfirmDeleteOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update the document with your edited JSON.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingSaveDoc) onSave(pendingSaveDoc);
                setConfirmSaveOpen(false);
                setPendingSaveDoc(null);
              }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
