import { useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Ruler,
  TrendingDown,
  TrendingUp,
  Calendar,
  Trash2,
  Edit2,
  ChevronRight,
  Activity,
  Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { MeasurementDefinition, MeasurementEntry } from '@/types/api';
import { useUnits } from '@/hooks/useUnits';
import { displayLength } from '@/lib/units';
import { formatDate, formatDateTime, formatChange } from '@/lib/utils';
import { GlassCard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MeasurementChart } from '@/components/charts/MeasurementChart';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';

export default function MeasurementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { units, lengthUnit: lenUnit } = useUnits();

  // Queries
  const { data: definitions = [] } = useQuery<MeasurementDefinition[]>({
    queryKey: ['measurement-definitions'],
    queryFn: () => api.get<MeasurementDefinition[]>('/measurements/definitions'),
  });

  const { data: allEntries = [] } = useQuery<MeasurementEntry[]>({
    queryKey: ['measurement-entries'],
    queryFn: () => api.get<MeasurementEntry[]>('/measurements/entries'),
  });

  const definition = useMemo(() => {
    return definitions.find((d) => String(d.id) === id);
  }, [definitions, id]);

  const entries = useMemo(() => {
    return allEntries
      .filter((e) => String(e.definitionId) === id)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allEntries, id]);

  // Delete Mutation
  const [deleteId, setDeleteId] = useState<string | number | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (entryId: string | number) => api.delete(`/measurements/entries/${entryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurement-entries'] });
      setDeleteId(null);
    },
  });

  // Calculate statistics
  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const values = entries.map((e) => displayLength(e.value, units));
    const first = values[0];
    const last = values[values.length - 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const change = last - first;

    // Weekly change estimate
    let weeklyRate: number | null = null;
    if (entries.length >= 2) {
      const dFirst = new Date(entries[0].date).getTime();
      const dLast = new Date(entries[entries.length - 1].date).getTime();
      const diffWeeks = Math.max(1, (dLast - dFirst) / (7 * 86_400_000));
      weeklyRate = change / diffWeeks;
    }

    return { first, last, min, max, change, weeklyRate };
  }, [entries, units]);

  if (!definition) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => navigate('/measurements')} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Measurements</span>
        </Button>
        <p className="text-muted-foreground">Measurement site not found.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Back button & Title */}
      <div className="space-y-3">
        <Link
          to="/measurements"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>All Measurements</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <Ruler className="h-7 w-7 text-primary" />
              <span>{definition.name}</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Historical circumference progression and trend analysis
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Current
            </p>
            <p className="text-xl md:text-2xl font-bold tracking-tight mt-1 text-foreground">
              {stats.last.toFixed(1)}{' '}
              <span className="text-xs font-normal text-muted-foreground">{lenUnit}</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              from {stats.first.toFixed(1)} {lenUnit}
            </p>
          </GlassCard>

          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Net Change
            </p>
            <p
              className={`text-xl md:text-2xl font-bold tracking-tight mt-1 flex items-center ${
                stats.change < 0
                  ? 'text-emerald-400'
                  : stats.change > 0
                  ? 'text-amber-400'
                  : 'text-foreground'
              }`}
            >
              {stats.change < 0 ? (
                <TrendingDown className="h-5 w-5 mr-1" />
              ) : stats.change > 0 ? (
                <TrendingUp className="h-5 w-5 mr-1" />
              ) : null}
              {formatChange(stats.change, 1)}{' '}
              <span className="text-xs font-normal text-muted-foreground ml-1">{lenUnit}</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">since first record</p>
          </GlassCard>

          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Min / Max
            </p>
            <p className="text-xl md:text-2xl font-bold tracking-tight mt-1 text-foreground">
              {stats.min.toFixed(1)} / {stats.max.toFixed(1)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{lenUnit}</p>
          </GlassCard>

          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Avg Weekly Change
            </p>
            <p className="text-xl md:text-2xl font-bold tracking-tight mt-1 text-foreground">
              {stats.weeklyRate !== null ? formatChange(stats.weeklyRate, 2) : '—'}{' '}
              <span className="text-xs font-normal text-muted-foreground">{lenUnit}/wk</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">linear rate</p>
          </GlassCard>
        </div>
      )}

      {/* Main Chart */}
      <GlassCard className="p-6 border-border/70 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Trend Analysis</CardTitle>
          <span className="text-xs text-muted-foreground">Unit: {lenUnit}</span>
        </div>
        {entries.length === 0 ? (
          <div className="py-12">
            <EmptyState
              icon={Activity}
              title="No records yet"
              description="Log this measurement in the Measurements tab to begin charting"
            />
          </div>
        ) : (
          <MeasurementChart entries={entries} unit={lenUnit} />
        )}
      </GlassCard>

      {/* Historical Entries Table */}
      <GlassCard className="border-border/70 shadow-xl overflow-hidden">
        <CardHeader className="border-b border-border/40 pb-4">
          <CardTitle className="text-base font-semibold">Log History</CardTitle>
          <CardDescription className="text-xs">
            {entries.length} recorded entries for {definition.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Calendar}
                title="No log history"
                description="Entries will appear here as you log them"
              />
            </div>
          ) : (
            <div className="divide-y divide-border/40 max-h-[400px] overflow-y-auto no-scrollbar">
              {[...entries]
                .sort((a, b) => (b.recorded_at || b.date).localeCompare(a.recorded_at || a.date))
                .map((entry) => {
                  const dispVal = displayLength(entry.value, units);
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-3.5 px-5 hover:bg-secondary/40 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <p className="font-semibold text-sm tabular-nums text-foreground">
                          {dispVal.toFixed(1)}{' '}
                          <span className="text-xs font-normal text-muted-foreground">{lenUnit}</span>
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-muted-foreground/70 inline" />
                          <span>{formatDateTime(entry.recorded_at || entry.date, 'EEEE, MMM d, yyyy · h:mm:ss a')}</span>
                          {entry.notes && <span className="italic ml-2">"{entry.notes}"</span>}
                        </p>
                      </div>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteId(entry.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-lg"
                      title="Delete entry"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </GlassCard>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete Measurement Entry"
        description="Are you sure you want to delete this historical record?"
        confirmText="Delete"
        destructive
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
      />
    </div>
  );
}
