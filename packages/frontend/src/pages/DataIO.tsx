import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Download,
  Upload,
  FileSpreadsheet,
  FileJson,
  ShieldAlert,
  Check,
  AlertTriangle,
  FolderArchive,
  RefreshCw,
  Info,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ImportPreview } from '@/types/api';
import { GlassCard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

export default function DataIO() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importJsonText, setImportJsonText] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);

  // Export full JSON
  const handleExportJson = async () => {
    try {
      const data = await api.get<any>('/export/json');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `forma-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  // Export CSV Weight
  const handleExportWeightCsv = () => {
    window.open('/api/export/csv/weight', '_blank');
  };

  // Export CSV Measurements
  const handleExportMeasurementsCsv = () => {
    window.open('/api/export/csv/measurements', '_blank');
  };

  // File selected for import -> Preview
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportSuccess(null);
    setImportPreview(null);
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        setImportJsonText(text);
        const parsed = JSON.parse(text);

        // Call backend import with preview flag
        const preview = await api.post<any>('/import/json?preview=1', parsed);
        setImportPreview(preview.counts || preview);
      } catch (err: any) {
        setImportError(err.message || 'Invalid JSON format or corrupted backup file');
      }
    };
    reader.readAsText(file);
  };

  // Commit Import Mutation
  const commitImportMutation = useMutation({
    mutationFn: async () => {
      if (!importJsonText) throw new Error('No data loaded');
      const parsed = JSON.parse(importJsonText);
      return api.post<any>('/import/json', parsed);
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries();
      setImportPreview(null);
      setImportFile(null);
      setImportJsonText(null);
      setConfirmImportOpen(false);
      setImportSuccess('Data imported successfully! Your dashboard has been refreshed.');
    },
    onError: (err: any) => {
      setImportError(err.message || 'Import failed');
      setConfirmImportOpen(false);
    },
  });

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <Database className="h-7 w-7 text-primary" />
          <span>Data Portability & Backup</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Export your complete fitness records, download spreadsheets, or restore from backups.
        </p>
      </div>

      <div className="space-y-6">
        {/* Section 1: Export Data */}
        <GlassCard className="border-border/70 shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Export Your Data</CardTitle>
            </div>
            <CardDescription className="text-xs">
              All your data is 100% yours. Export at any time without restrictions.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              variant="outline"
              onClick={handleExportJson}
              className="h-20 flex flex-col items-center justify-center gap-1.5 rounded-2xl border-border/80 hover:border-primary/50 hover:bg-secondary/60 text-xs"
            >
              <FileJson className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">Full JSON Backup</span>
              <span className="text-[10px] text-muted-foreground">Complete vault export</span>
            </Button>

            <Button
              variant="outline"
              onClick={handleExportWeightCsv}
              className="h-20 flex flex-col items-center justify-center gap-1.5 rounded-2xl border-border/80 hover:border-primary/50 hover:bg-secondary/60 text-xs"
            >
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
              <span className="font-semibold text-foreground">Weight History CSV</span>
              <span className="text-[10px] text-muted-foreground">For Excel / Sheets</span>
            </Button>

            <Button
              variant="outline"
              onClick={handleExportMeasurementsCsv}
              className="h-20 flex flex-col items-center justify-center gap-1.5 rounded-2xl border-border/80 hover:border-primary/50 hover:bg-secondary/60 text-xs"
            >
              <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
              <span className="font-semibold text-foreground">Measurements CSV</span>
              <span className="text-[10px] text-muted-foreground">For Excel / Sheets</span>
            </Button>
          </CardContent>
        </GlassCard>

        {/* Section 2: Import Backup */}
        <GlassCard className="border-border/70 shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Restore / Import Backup</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Upload a previously exported Forma JSON backup file. Duplicates are safely matched by date.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {importError && (
              <div className="p-3 text-xs bg-destructive/15 text-destructive border border-destructive/30 rounded-xl flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {importSuccess && (
              <div className="p-3 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0" />
                <span>{importSuccess}</span>
              </div>
            )}

            {/* Drop / Select JSON Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-2xl p-6 text-center cursor-pointer transition-colors space-y-2 flex flex-col items-center justify-center bg-secondary/30"
            >
              <FileJson className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs font-semibold text-foreground">
                {importFile ? importFile.name : 'Select Forma JSON Backup File'}
              </p>
              <p className="text-[11px] text-muted-foreground">JSON format only</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Preview Breakdown Card */}
            {importPreview && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-2xl bg-secondary/40 border border-border/60 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Backup Contents Preview
                  </h4>
                  <Badge variant="outline" className="text-[10px]">
                    Validated
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-background/50 border border-border/40">
                    <p className="text-base font-bold text-foreground">
                      {importPreview.weightEntries ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Weight Logs</p>
                  </div>
                  <div className="p-2 rounded-xl bg-background/50 border border-border/40">
                    <p className="text-base font-bold text-foreground">
                      {importPreview.measurementEntries ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Circumferences</p>
                  </div>
                  <div className="p-2 rounded-xl bg-background/50 border border-border/40">
                    <p className="text-base font-bold text-foreground">
                      {importPreview.measurementDefinitions ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Custom Sites</p>
                  </div>
                  <div className="p-2 rounded-xl bg-background/50 border border-border/40">
                    <p className="text-base font-bold text-foreground">
                      {importPreview.goals ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Goals</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setImportFile(null);
                      setImportPreview(null);
                      setImportJsonText(null);
                    }}
                    className="rounded-xl text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setConfirmImportOpen(true)}
                    className="rounded-xl text-xs gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Import Records</span>
                  </Button>
                </div>
              </motion.div>
            )}
          </CardContent>
        </GlassCard>

        {/* Section 3: Server Backup & Restore Guidelines */}
        <GlassCard className="border-border/70 shadow-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FolderArchive className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Self-Hosted Docker Server Backup
            </h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Forma persists all SQLite database records and uploaded progress images inside the Docker volume{' '}
            <code className="text-primary font-mono text-[11px] bg-secondary/60 px-1 py-0.5 rounded">
              forma_data
            </code>
            . To perform a low-level snapshot of the volume:
          </p>
          <pre className="p-3 rounded-xl bg-secondary/50 border border-border/50 text-[11px] text-foreground font-mono overflow-x-auto">
            docker run --rm -v forma_data:/source -v $(pwd)/backups:/backup alpine tar czf /backup/forma-snapshot.tar.gz -C /source .
          </pre>
        </GlassCard>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmImportOpen}
        onOpenChange={setConfirmImportOpen}
        title="Confirm Data Import"
        description="Are you sure you want to import this backup? Existing entries on matching dates will be safely preserved or updated."
        confirmText="Proceed with Import"
        onConfirm={() => commitImportMutation.mutate()}
      />
    </div>
  );
}
