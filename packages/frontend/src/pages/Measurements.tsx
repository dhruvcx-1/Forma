import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Ruler,
  Calendar,
  Plus,
  Trash2,
  Edit2,
  Check,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Search,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { MeasurementDefinition, MeasurementEntry } from '@/types/api';
import { useUnits } from '@/hooks/useUnits';
import { displayLength, lengthUnit, inchesToCm } from '@/lib/units';
import { todayISO, formatDate, formatChange, formatPercent } from '@/lib/utils';
import { GlassCard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';

export default function Measurements() {
  const queryClient = useQueryClient();
  const { units, lengthUnit: lenUnit } = useUnits();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'log' | 'history'>('log');

  // Queries
  const { data: definitions = [] } = useQuery<MeasurementDefinition[]>({
    queryKey: ['measurement-definitions'],
    queryFn: () => api.get<MeasurementDefinition[]>('/measurements/definitions'),
  });

  const { data: rawEntries = [] } = useQuery<MeasurementEntry[]>({
    queryKey: ['measurement-entries'],
    queryFn: () => api.get<MeasurementEntry[]>('/measurements/entries'),
  });

  const entries = useMemo(() => {
    return [...rawEntries].sort((a, b) => b.date.localeCompare(a.date));
  }, [rawEntries]);

  // Latest entry map per definition id
  const latestByDef = useMemo(() => {
    const map = new Map<string | number, MeasurementEntry>();
    for (const e of entries) {
      if (!map.has(e.definitionId)) {
        map.set(e.definitionId, e);
      }
    }
    return map;
  }, [entries]);

  // Form State for Log Session
  const [sessionDate, setSessionDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string | number, string>>({});
  const [sessionNotes, setSessionNotes] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Custom Definition Modal
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState('cm');

  // Delete State
  const [deleteEntryId, setDeleteEntryId] = useState<string | number | null>(null);
  const [filterDefId, setFilterDefId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Handle input change
  const handleValueChange = (defId: string | number, val: string) => {
    setValues((prev) => ({ ...prev, [defId]: val }));
  };

  // Batch Save Mutation
  const saveBatchMutation = useMutation({
    mutationFn: async () => {
      const itemsToSave: Array<{ definition_id: string; value: number; recorded_at: string; notes?: string }> = [];

      for (const [defId, valStr] of Object.entries(values)) {
        const num = parseFloat(valStr);
        if (!isNaN(num) && num > 0) {
          // Convert if user unit is imperial and definition is cm
          const cmVal = units === 'imperial' ? inchesToCm(num) : num;
          itemsToSave.push({
            definition_id: String(defId),
            value: parseFloat(cmVal.toFixed(2)),
            recorded_at: sessionDate,
            notes: sessionNotes.trim() || undefined,
          });
        }
      }

      if (itemsToSave.length === 0) {
        throw new Error('Please enter at least one measurement value');
      }

      return api.post('/measurements/entries', { entries: itemsToSave });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurement-entries'] });
      queryClient.invalidateQueries({ queryKey: ['body-composition'] });
      setValues({});
      setSessionNotes('');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      setActiveTab('history');
    },
  });

  // Create Custom Definition Mutation
  const createDefMutation = useMutation({
    mutationFn: (data: { name: string; unit: string }) =>
      api.post('/measurements/definitions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurement-definitions'] });
      setCustomModalOpen(false);
      setCustomName('');
    },
  });

  // Delete Entry Mutation
  const deleteEntryMutation = useMutation({
    mutationFn: (id: string | number) => api.delete(`/measurements/entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurement-entries'] });
      setDeleteEntryId(null);
    },
  });

  // Filtered entries for History tab
  const filteredHistory = useMemo(() => {
    return entries.filter((e) => {
      if (filterDefId !== 'all' && String(e.definitionId) !== filterDefId) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const def = definitions.find((d) => d.id === e.definitionId);
        const nameMatch = def && def.name.toLowerCase().includes(q);
        const dateMatch = e.date.includes(q);
        if (!nameMatch && !dateMatch) return false;
      }
      return true;
    });
  }, [entries, filterDefId, searchQuery, definitions]);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Ruler className="h-7 w-7 text-primary" />
            <span>Body Measurements</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track body circumferences to visualize composition changes over time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCustomModalOpen(true)}
            className="rounded-xl text-xs gap-1.5 h-9"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Custom Measurement</span>
          </Button>

          <div className="flex bg-secondary/80 p-0.5 rounded-xl border border-border/50">
            <button
              onClick={() => setActiveTab('log')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'log'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Log Session
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'history'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              History
            </button>
          </div>
        </div>
      </div>

      {/* Tab: Log Session */}
      {activeTab === 'log' && (
        <div className="space-y-6">
          <GlassCard className="border-border/70 shadow-xl">
            <CardHeader className="border-b border-border/40 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold">Measurement Session</CardTitle>
                  <CardDescription className="text-xs">
                    Fill in whichever measurements you took today. Values are converted to your preferred display units ({lenUnit}).
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    max={todayISO()}
                    className="h-8 text-xs rounded-lg w-36"
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {definitions.map((def) => {
                  const latest = latestByDef.get(def.id);
                  const displayLatest = latest ? displayLength(latest.value, units) : null;

                  return (
                    <div
                      key={def.id}
                      className="p-3.5 rounded-2xl bg-secondary/30 border border-border/50 hover:border-primary/30 transition-all space-y-2 group"
                    >
                      <div className="flex items-center justify-between">
                        <Link
                          to={`/measurements/${def.id}`}
                          className="font-medium text-xs text-foreground group-hover:text-primary transition-colors flex items-center gap-1"
                        >
                          <span>{def.name}</span>
                          <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                        {displayLatest !== null && (
                          <span className="text-[11px] text-muted-foreground">
                            prev: {displayLatest.toFixed(1)} {lenUnit}
                          </span>
                        )}
                      </div>

                      <div className="relative">
                        <Input
                          type="number"
                          step="0.1"
                          placeholder={displayLatest ? displayLatest.toFixed(1) : '0.0'}
                          value={values[def.id] || ''}
                          onChange={(e) => handleValueChange(def.id, e.target.value)}
                          className="pr-10 text-sm font-semibold h-10 rounded-xl"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">
                          {lenUnit}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Session Notes */}
              <div className="space-y-1.5 pt-2">
                <Label htmlFor="sessionNotes" className="text-xs">
                  Session Notes (optional)
                </Label>
                <Textarea
                  id="sessionNotes"
                  placeholder="e.g. Measured relaxed, morning after refeed..."
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  rows={2}
                  className="rounded-xl text-xs resize-none"
                />
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  onClick={() => saveBatchMutation.mutate()}
                  disabled={saveBatchMutation.isPending}
                  className="rounded-xl h-11 px-6 text-sm font-medium gap-2 shadow-lg shadow-primary/20"
                >
                  <Check className="h-4 w-4" />
                  <span>
                    {saveBatchMutation.isPending ? 'Saving Entries...' : 'Save Measurements'}
                  </span>
                </Button>
              </div>
            </CardContent>
          </GlassCard>
        </div>
      )}

      {/* Tab: History */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <GlassCard className="border-border/70 shadow-xl overflow-hidden">
            <CardHeader className="border-b border-border/40 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <select
                    value={filterDefId}
                    onChange={(e) => setFilterDefId(e.target.value)}
                    className="h-8 text-xs rounded-lg bg-secondary border border-border px-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="all">All Measurements</option>
                    {definitions.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="relative w-full sm:w-48">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search history..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-xs rounded-lg"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredHistory.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={Ruler}
                    title="No measurements logged"
                    description="Switch to the Log Session tab to record your circumferences"
                  />
                </div>
              ) : (
                <div className="divide-y divide-border/40 max-h-[550px] overflow-y-auto no-scrollbar">
                  {filteredHistory.map((entry) => {
                    const def = definitions.find((d) => d.id === entry.definitionId);
                    const defName = def?.name || entry.name || 'Measurement';
                    const dispVal = displayLength(entry.value, units);

                    return (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-3.5 px-5 hover:bg-secondary/40 transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/measurements/${entry.definitionId}`}
                              className="font-semibold text-sm hover:text-primary transition-colors flex items-center gap-1"
                            >
                              <span>{defName}</span>
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            </Link>
                            <span className="text-sm font-bold tabular-nums text-foreground">
                              {dispVal.toFixed(1)}{' '}
                              <span className="text-xs font-normal text-muted-foreground">
                                {lenUnit}
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatDate(entry.date, 'EEEE, MMM d, yyyy')}</span>
                            {entry.notes && (
                              <>
                                <span>&bull;</span>
                                <span className="italic truncate max-w-[200px]">
                                  "{entry.notes}"
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Link to={`/measurements/${entry.definitionId}`}>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
                              title="View Chart"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteEntryId(entry.id)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-lg"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </GlassCard>
        </div>
      )}

      {/* Add Custom Measurement Modal */}
      <Dialog open={customModalOpen} onOpenChange={setCustomModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Measurement</DialogTitle>
            <DialogDescription className="text-xs">
              Define a custom body site to track (e.g. Shoulders, Abdomen, Ankle).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="customName">Measurement Name</Label>
              <Input
                id="customName"
                placeholder="e.g. Shoulders"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customUnit">Base Unit</Label>
              <Input
                id="customUnit"
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                placeholder="cm"
              />
              <p className="text-[11px] text-muted-foreground">Standard base unit (cm recommended).</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCustomModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                customName.trim() &&
                createDefMutation.mutate({ name: customName.trim(), unit: customUnit.trim() })
              }
              disabled={createDefMutation.isPending || !customName.trim()}
            >
              {createDefMutation.isPending ? 'Adding...' : 'Create Site'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteEntryId !== null}
        onOpenChange={(open) => !open && setDeleteEntryId(null)}
        title="Delete Measurement"
        description="Are you sure you want to delete this measurement entry? This action cannot be undone."
        confirmText="Delete"
        destructive
        onConfirm={() => deleteEntryId && deleteEntryMutation.mutate(deleteEntryId)}
      />
    </div>
  );
}
