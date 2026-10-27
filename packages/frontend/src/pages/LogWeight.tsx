import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scale,
  Calendar,
  FileText,
  Plus,
  Minus,
  Check,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Trash2,
  Edit2,
  Search,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api } from '@/lib/api';
import type { WeightEntry } from '@/types/api';
import { useUnits } from '@/hooks/useUnits';
import { displayWeight, toKg } from '@/lib/units';
import { todayISO, formatDate, formatChange } from '@/lib/utils';
import { GlassCard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';

export default function LogWeight() {
  const queryClient = useQueryClient();
  const { units, weightUnit } = useUnits();

  // Queries
  const { data: rawEntries = [], isLoading } = useQuery<WeightEntry[]>({
    queryKey: ['weight-entries'],
    queryFn: () => api.get<WeightEntry[]>('/weight'),
  });

  const entries = useMemo(() => {
    return [...rawEntries].sort((a, b) => b.date.localeCompare(a.date));
  }, [rawEntries]);

  const latestEntry = entries[0];

  // Form state
  const [date, setDate] = useState(todayISO());
  const [weightValue, setWeightValue] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | number | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<WeightEntry | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize input with latest weight if empty
  useMemo(() => {
    if (latestEntry && !weightValue && !editingId) {
      setWeightValue(displayWeight(latestEntry.weight, units).toFixed(1));
    }
  }, [latestEntry, units]);

  // Steppers (+ / - 0.1)
  const handleStep = (delta: number) => {
    const current = parseFloat(weightValue) || (latestEntry ? displayWeight(latestEntry.weight, units) : 70.0);
    const updated = Math.max(10, current + delta);
    setWeightValue(updated.toFixed(1));
  };

  // Check duplicate when date changes
  const checkDuplicate = (targetDate: string) => {
    const found = entries.find((e) => e.date === targetDate && e.id !== editingId);
    setDuplicateWarning(found ?? null);
  };

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    checkDuplicate(newDate);
  };

  // Mutation: Create / Update
  const saveMutation = useMutation({
    mutationFn: async () => {
      const num = parseFloat(weightValue);
      if (isNaN(num) || num <= 0) throw new Error('Please enter a valid weight');

      const kgVal = toKg(num, units);

      if (editingId) {
        return api.put(`/weight/${editingId}`, {
          value: kgVal,
          unit: 'kg',
          recorded_at: date,
          notes: notes.trim() || undefined,
        });
      } else {
        return api.post('/weight', {
          value: kgVal,
          unit: 'kg',
          recorded_at: date,
          notes: notes.trim() || undefined,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weight-entries'] });
      queryClient.invalidateQueries({ queryKey: ['weight-stats'] });
      queryClient.invalidateQueries({ queryKey: ['body-composition'] });
      setSuccessMessage(editingId ? 'Weight entry updated!' : 'Weight logged successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
      setEditingId(null);
      setDuplicateWarning(null);
      setNotes('');
    },
  });

  // Mutation: Delete
  const deleteMutation = useMutation({
    mutationFn: (id: string | number) => api.delete(`/weight/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weight-entries'] });
      queryClient.invalidateQueries({ queryKey: ['weight-stats'] });
      setDeleteTargetId(null);
    },
  });

  const startEdit = (entry: WeightEntry) => {
    setEditingId(entry.id);
    setDate(entry.date);
    setWeightValue(displayWeight(entry.weight, units).toFixed(1));
    setNotes(entry.notes || '');
    setDuplicateWarning(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDate(todayISO());
    setNotes('');
    setDuplicateWarning(null);
    if (latestEntry) {
      setWeightValue(displayWeight(latestEntry.weight, units).toFixed(1));
    }
  };

  // Difference preview vs latest
  const diffPreview = useMemo(() => {
    const val = parseFloat(weightValue);
    if (isNaN(val) || !latestEntry) return null;
    const currentInputKg = toKg(val, units);
    return currentInputKg - latestEntry.weight;
  }, [weightValue, latestEntry, units]);

  // Filtered entries for table
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return e.date.includes(q) || (e.notes && e.notes.toLowerCase().includes(q));
    });
  }, [entries, searchQuery]);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <Scale className="h-7 w-7 text-primary" />
          <span>{editingId ? 'Edit Weight Log' : 'Log Weight'}</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Record your daily weigh-in to keep track of your progress and trends.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Entry Form */}
        <div className="lg:col-span-5 space-y-6">
          <GlassCard className="border-border/70 shadow-xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">
                  {editingId ? 'Modify Entry' : 'Quick Entry'}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {weightUnit}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Consistent weigh-ins (e.g. first thing in the morning) yield the most reliable data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Notifications */}
              <AnimatePresence>
                {successMessage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs flex items-center gap-2"
                  >
                    <Check className="h-4 w-4 shrink-0" />
                    <span>{successMessage}</span>
                  </motion.div>
                )}
                {duplicateWarning && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl text-xs space-y-2"
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>An entry already exists for {formatDate(duplicateWarning.date)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Logged: {displayWeight(duplicateWarning.weight, units).toFixed(1)} {weightUnit}.
                      Saving will update this record.
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => startEdit(duplicateWarning)}
                      className="text-xs h-7"
                    >
                      Edit existing entry instead
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Big Weight Input */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Weight ({weightUnit})</Label>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => handleStep(-0.1)}
                    className="h-12 w-12 rounded-2xl border-border/80 hover:bg-secondary shrink-0"
                    title="Subtract 0.1"
                  >
                    <Minus className="h-5 w-5" />
                  </Button>

                  <div className="relative flex-1">
                    <Input
                      type="number"
                      step="0.1"
                      min="10"
                      max="400"
                      value={weightValue}
                      onChange={(e) => setWeightValue(e.target.value)}
                      className="h-16 text-3xl md:text-4xl font-extrabold text-center tracking-tight font-mono rounded-2xl bg-secondary/50 border-primary/20 focus-visible:ring-primary"
                      placeholder="0.0"
                      required
                    />
                    <span className="absolute right-3.5 bottom-3.5 text-xs font-semibold text-muted-foreground">
                      {weightUnit}
                    </span>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => handleStep(0.1)}
                    className="h-12 w-12 rounded-2xl border-border/80 hover:bg-secondary shrink-0"
                    title="Add 0.1"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>

                {/* Diff preview */}
                {diffPreview !== null && latestEntry && !editingId && (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-1">
                    <span>vs. previous ({formatDate(latestEntry.date, 'MMM d')}):</span>
                    <span
                      className={`font-semibold flex items-center ${
                        diffPreview < 0
                          ? 'text-emerald-400'
                          : diffPreview > 0
                          ? 'text-amber-400'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {diffPreview < 0 ? (
                        <TrendingDown className="h-3 w-3 mr-0.5 inline" />
                      ) : diffPreview > 0 ? (
                        <TrendingUp className="h-3 w-3 mr-0.5 inline" />
                      ) : null}
                      {formatChange(displayWeight(diffPreview, units), 1)} {weightUnit}
                    </span>
                  </div>
                )}
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <Label htmlFor="date" className="text-xs">
                  Measurement Date
                </Label>
                <div className="relative">
                  <Calendar className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => handleDateChange(e.target.value)}
                    max={todayISO()}
                    className="pl-9 rounded-xl"
                    required
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs">
                  Notes (optional)
                </Label>
                <div className="relative">
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Post-workout, fasted, high sodium meal yesterday..."
                    rows={2}
                    className="rounded-xl resize-none text-xs"
                    maxLength={500}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                {editingId && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={cancelEdit}
                    className="flex-1 rounded-xl text-xs"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !weightValue}
                  className="flex-1 rounded-xl h-11 text-sm font-medium gap-2 shadow-lg shadow-primary/20"
                >
                  <Check className="h-4 w-4" />
                  <span>
                    {saveMutation.isPending
                      ? 'Saving...'
                      : editingId
                      ? 'Update Entry'
                      : 'Record Weight'}
                  </span>
                </Button>
              </div>
            </CardContent>
          </GlassCard>
        </div>

        {/* Right Column: Historical Table */}
        <div className="lg:col-span-7 space-y-4">
          <GlassCard className="border-border/70 shadow-xl overflow-hidden">
            <CardHeader className="border-b border-border/50 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold">Weight History</CardTitle>
                  <CardDescription className="text-xs">
                    {entries.length} recorded {entries.length === 1 ? 'entry' : 'entries'}
                  </CardDescription>
                </div>
                <div className="relative w-full sm:w-48">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filter dates / notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-xs rounded-lg"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredEntries.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={Scale}
                    title="No records found"
                    description={
                      searchQuery
                        ? 'Try clearing your search query'
                        : 'Start logging your weight using the form'
                    }
                  />
                </div>
              ) : (
                <div className="divide-y divide-border/40 max-h-[500px] overflow-y-auto no-scrollbar">
                  {filteredEntries.map((entry, idx) => {
                    const prevEntry = filteredEntries[idx + 1];
                    const delta = prevEntry ? entry.weight - prevEntry.weight : null;

                    return (
                      <div
                        key={entry.id}
                        className={`flex items-center justify-between p-3.5 px-5 hover:bg-secondary/40 transition-colors ${
                          editingId === entry.id ? 'bg-primary/10' : ''
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm tabular-nums">
                              {displayWeight(entry.weight, units).toFixed(1)}{' '}
                              <span className="text-xs text-muted-foreground font-normal">
                                {weightUnit}
                              </span>
                            </span>

                            {delta !== null && (
                              <span
                                className={`text-[11px] font-medium flex items-center tabular-nums ${
                                  delta < 0
                                    ? 'text-emerald-400'
                                    : delta > 0
                                    ? 'text-amber-400'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {delta < 0 ? (
                                  <TrendingDown className="h-3 w-3 mr-0.5" />
                                ) : delta > 0 ? (
                                  <TrendingUp className="h-3 w-3 mr-0.5" />
                                ) : null}
                                {formatChange(displayWeight(delta, units), 1)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatDate(entry.date, 'EEEE, MMM d, yyyy')}</span>
                            {entry.notes && (
                              <>
                                <span>&bull;</span>
                                <span className="truncate max-w-[200px] italic">
                                  "{entry.notes}"
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => startEdit(entry)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
                            title="Edit"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteTargetId(entry.id)}
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
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title="Delete Weight Entry"
        description="Are you sure you want to delete this weight log? This action cannot be undone."
        confirmText="Delete"
        destructive
        onConfirm={() => deleteTargetId && deleteMutation.mutate(deleteTargetId)}
      />
    </div>
  );
}
