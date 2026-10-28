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
  User,
  LayoutGrid,
  History,
  Activity,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { MeasurementDefinition, MeasurementEntry } from '@/types/api';
import { useUnits } from '@/hooks/useUnits';
import { displayLength, lengthUnit, inchesToCm } from '@/lib/units';
import { todayISO, formatDate, formatDateTime, formatChange } from '@/lib/utils';
import { GlassCard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { HealthRatioCards } from '@/components/measurements/HealthRatioCards';
import { BodyMapSilhouette, type BodyPin } from '@/components/measurements/BodyMapSilhouette';

// Standard silhouette pin coordinate mappings for system definitions
const PIN_COORDINATES: Record<string, { x: number; y: number }> = {
  neck: { x: 50, y: 17 },
  chest: { x: 50, y: 28 },
  left_upper_arm: { x: 27, y: 34 },
  right_upper_arm: { x: 73, y: 34 },
  left_forearm: { x: 20, y: 46 },
  right_forearm: { x: 80, y: 46 },
  waist: { x: 50, y: 42 },
  hips: { x: 50, y: 55 },
  left_thigh: { x: 42, y: 68 },
  right_thigh: { x: 58, y: 68 },
  left_calf: { x: 40, y: 84 },
  right_calf: { x: 60, y: 84 },
};

// Anatomical Zone groupings
const ZONE_MAPPINGS: Record<string, 'core' | 'upper' | 'lower'> = {
  waist: 'core',
  hips: 'core',
  chest: 'core',
  neck: 'core',
  left_upper_arm: 'upper',
  right_upper_arm: 'upper',
  left_forearm: 'upper',
  right_forearm: 'upper',
  left_thigh: 'lower',
  right_thigh: 'lower',
  left_calf: 'lower',
  right_calf: 'lower',
};

export default function Measurements() {
  const queryClient = useQueryClient();
  const { units, lengthUnit: lenUnit } = useUnits();

  // Active View Tab: 'studio' | 'zones' | 'history'
  const [activeTab, setActiveTab] = useState<'studio' | 'zones' | 'history'>('studio');

  // Selected Pin on Silhouette
  const [selectedSlug, setSelectedSlug] = useState<string>('waist');

  // Queries
  const { data: definitions = [] } = useQuery<MeasurementDefinition[]>({
    queryKey: ['measurement-definitions'],
    queryFn: () => api.get<MeasurementDefinition[]>('/measurements/definitions'),
  });

  const { data: rawEntries = [] } = useQuery<MeasurementEntry[]>({
    queryKey: ['measurement-entries'],
    queryFn: () => api.get<MeasurementEntry[]>('/measurements/entries'),
  });

  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, string>>('/settings'),
  });

  const heightCm = settings.height_cm ? parseFloat(settings.height_cm) : null;
  const sex = (settings.sex as 'male' | 'female' | 'other') || 'male';

  const entries = useMemo(() => {
    return [...rawEntries].sort((a, b) => b.date.localeCompare(a.date));
  }, [rawEntries]);

  // Map latest and baseline entries per definition id
  const { latestByDef, baselineByDef } = useMemo(() => {
    const latest = new Map<string | number, MeasurementEntry>();
    const baseline = new Map<string | number, MeasurementEntry>();

    for (const e of entries) {
      if (!latest.has(e.definitionId)) {
        latest.set(e.definitionId, e);
      }
      // Baseline is earliest
      baseline.set(e.definitionId, e);
    }
    return { latestByDef: latest, baselineByDef: baseline };
  }, [entries]);

  // Helper for current local time HH:mm:ss
  const currentTimeString = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  // Form State for Log Session
  const [sessionDate, setSessionDate] = useState(todayISO());
  const [sessionTime, setSessionTime] = useState(currentTimeString());
  const [values, setValues] = useState<Record<string | number, string>>({});
  const [sessionNotes, setSessionNotes] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSetTimeToNow = () => {
    setSessionDate(todayISO());
    setSessionTime(currentTimeString());
  };

  // Custom Definition Modal
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState('cm');

  // Delete State & Filters
  const [deleteEntryId, setDeleteEntryId] = useState<string | number | null>(null);
  const [filterDefId, setFilterDefId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Handle input change
  const handleValueChange = (defId: string | number, val: string) => {
    setValues((prev) => ({ ...prev, [defId]: val }));
  };

  // Batch Save Mutation with exact second timestamp
  const saveBatchMutation = useMutation({
    mutationFn: async () => {
      const itemsToSave: Array<{ definition_id: string; value: number; recorded_at: string; notes?: string }> = [];
      const sessionTimestamp = `${sessionDate}T${sessionTime || '12:00:00'}`;

      for (const [defId, valStr] of Object.entries(values)) {
        const num = parseFloat(valStr);
        if (!isNaN(num) && num > 0) {
          const cmVal = units === 'imperial' ? inchesToCm(num) : num;
          itemsToSave.push({
            definition_id: String(defId),
            value: parseFloat(cmVal.toFixed(2)),
            recorded_at: sessionTimestamp,
            notes: sessionNotes || undefined,
          });
        }
      }

      if (itemsToSave.length === 0) return;
      return api.post('/measurements/entries', { entries: itemsToSave });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurement-entries'] });
      setValues({});
      setSessionNotes('');
      setSessionTime(currentTimeString());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
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

  // Extract latest waist and hips in cm for WHR and WHtR calculations
  const waistDef = definitions.find((d) => d.slug === 'waist');
  const hipsDef = definitions.find((d) => d.slug === 'hips');
  const latestWaist = waistDef ? latestByDef.get(waistDef.id)?.value : null;
  const latestHips = hipsDef ? latestByDef.get(hipsDef.id)?.value : null;

  // Build pins for BodyMapSilhouette
  const silhouettePins: BodyPin[] = useMemo(() => {
    return definitions
      .filter((d) => PIN_COORDINATES[d.slug])
      .map((d) => {
        const coords = PIN_COORDINATES[d.slug];
        const latest = latestByDef.get(d.id);
        const baseline = baselineByDef.get(d.id);

        let latestDisp = latest ? displayLength(latest.value, units) : null;
        let delta = null;
        if (latest && baseline && latest.id !== baseline.id) {
          const latestNum = displayLength(latest.value, units);
          const baseNum = displayLength(baseline.value, units);
          delta = Math.round((latestNum - baseNum) * 10) / 10;
        }

        return {
          slug: d.slug,
          name: d.name,
          x: coords.x,
          y: coords.y,
          latestValue: latestDisp ? Math.round(latestDisp * 10) / 10 : null,
          delta,
          unit: lenUnit,
        };
      });
  }, [definitions, latestByDef, baselineByDef, units, lenUnit]);

  // Selected Definition in Studio Mode
  const selectedDef = definitions.find((d) => d.slug === selectedSlug) || definitions[0];
  const selectedLatest = selectedDef ? latestByDef.get(selectedDef.id) : null;
  const selectedBaseline = selectedDef ? baselineByDef.get(selectedDef.id) : null;
  const selectedLatestDisp = selectedLatest ? displayLength(selectedLatest.value, units) : null;
  const selectedBaselineDisp = selectedBaseline ? displayLength(selectedBaseline.value, units) : null;
  const selectedDelta =
    selectedLatestDisp !== null && selectedBaselineDisp !== null && selectedLatest?.id !== selectedBaseline?.id
      ? Math.round((selectedLatestDisp - selectedBaselineDisp) * 10) / 10
      : null;

  // Filtered history list sorted strictly by timestamp with seconds descending
  const filteredHistory = useMemo(() => {
    return [...entries]
      .sort((a, b) => (b.recorded_at || b.date).localeCompare(a.recorded_at || a.date))
      .filter((e) => {
        if (filterDefId !== 'all' && String(e.definitionId) !== filterDefId) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const def = definitions.find((d) => d.id === e.definitionId);
          const nameMatch = def && def.name.toLowerCase().includes(q);
          const dateMatch = (e.recorded_at || e.date).toLowerCase().includes(q);
          if (!nameMatch && !dateMatch) return false;
        }
        return true;
      });
  }, [entries, filterDefId, searchQuery, definitions]);

  // Quick prefill helper
  const handlePrefillLatest = () => {
    const prefilled: Record<string | number, string> = {};
    for (const def of definitions) {
      const latest = latestByDef.get(def.id);
      if (latest) {
        prefilled[def.id] = displayLength(latest.value, units).toFixed(1);
      }
    }
    setValues(prefilled);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
            <Ruler className="h-7 w-7 text-primary" />
            <span>Body Measurements</span>
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            Track body circumferences to visualize body recomposition and lean mass development.
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
            <span>Custom Site</span>
          </Button>

          {/* View Mode Switcher */}
          <div className="flex bg-secondary/80 p-0.5 rounded-xl border border-border/50">
            <button
              onClick={() => setActiveTab('studio')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'studio'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Studio</span>
            </button>
            <button
              onClick={() => setActiveTab('zones')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'zones'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Zones</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cardiometabolic Health Ratios (WHR & WHtR) */}
      <HealthRatioCards
        waistCm={latestWaist}
        hipsCm={latestHips}
        heightCm={heightCm}
        sex={sex}
      />

      {/* VIEW 1: Visual Interactive Studio Mode */}
      {activeTab === 'studio' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Interactive Silhouette */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <GlassCard className="p-6 border-border/60 shadow-xl w-full flex flex-col items-center">
              <div className="text-center mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Interactive Body Map
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Click any pin to inspect circumferences and record changes.
                </p>
              </div>

              <BodyMapSilhouette
                pins={silhouettePins}
                selectedSlug={selectedSlug}
                onSelectPin={(slug) => setSelectedSlug(slug)}
                sex={sex}
              />

              <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground mt-4 pt-3 border-t border-border/40 w-full">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary" /> Measured Site
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/60" /> Unmeasured
                </span>
              </div>
            </GlassCard>
          </div>

          {/* Right: Focused Site Card & Quick Session Logger */}
          <div className="lg:col-span-7 space-y-6">
            {selectedDef && (
              <GlassCard className="border-border/60 shadow-xl p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-border/50 pb-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      Selected Anatomical Site
                    </span>
                    <h2 className="text-2xl font-black text-foreground flex items-center gap-2 mt-0.5">
                      <span>{selectedDef.name}</span>
                      {selectedDelta !== null && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            selectedDelta < 0
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : 'bg-blue-500/15 text-blue-500'
                          }`}
                        >
                          {selectedDelta > 0 ? `+${selectedDelta}` : selectedDelta} {lenUnit} overall
                        </span>
                      )}
                    </h2>
                  </div>

                  <Button asChild variant="outline" size="sm" className="gap-1 text-xs">
                    <Link to={`/measurements/${selectedDef.id}`}>
                      <span>View Detailed Chart</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                </div>

                {/* Metrics Highlights */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-secondary/30 border border-border/50">
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase">
                      Current Size
                    </div>
                    <div className="text-2xl font-black text-foreground mt-0.5 tabular-nums">
                      {selectedLatestDisp ? selectedLatestDisp.toFixed(1) : '—'}{' '}
                      <span className="text-xs font-normal text-muted-foreground">{lenUnit}</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-secondary/30 border border-border/50">
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase">
                      Baseline Size
                    </div>
                    <div className="text-2xl font-black text-foreground mt-0.5 tabular-nums">
                      {selectedBaselineDisp ? selectedBaselineDisp.toFixed(1) : '—'}{' '}
                      <span className="text-xs font-normal text-muted-foreground">{lenUnit}</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-secondary/30 border border-border/50 col-span-2 sm:col-span-1">
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase">
                      Total Delta
                    </div>
                    <div
                      className={`text-2xl font-black mt-0.5 tabular-nums ${
                        selectedDelta && selectedDelta < 0
                          ? 'text-emerald-500'
                          : selectedDelta && selectedDelta > 0
                          ? 'text-blue-500'
                          : 'text-foreground'
                      }`}
                    >
                      {selectedDelta !== null ? `${selectedDelta > 0 ? `+${selectedDelta}` : selectedDelta} ${lenUnit}` : '0.0'}
                    </div>
                  </div>
                </div>

                {/* Fast Input for this site */}
                <div className="space-y-3 pt-2">
                  <Label className="text-xs font-semibold">Record New Measurement Today</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type="number"
                        step="0.1"
                        placeholder={selectedLatestDisp ? selectedLatestDisp.toFixed(1) : '0.0'}
                        value={values[selectedDef.id] || ''}
                        onChange={(e) => handleValueChange(selectedDef.id, e.target.value)}
                        className="pr-12 text-lg font-bold h-12 rounded-xl"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                        {lenUnit}
                      </span>
                    </div>

                    <Button
                      type="button"
                      onClick={() => saveBatchMutation.mutate()}
                      disabled={saveBatchMutation.isPending || !values[selectedDef.id]}
                      className="h-12 px-5 shadow-lg shadow-primary/20 gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Log Site</span>
                    </Button>
                  </div>
                </div>
              </GlassCard>
            )}

            {/* Quick Session Batch Logger Card */}
            <GlassCard className="border-border/60 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Quick Session Logger</h3>
                  <p className="text-xs text-muted-foreground">Record all or multiple sites for today</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handlePrefillLatest}
                    className="text-xs text-primary hover:text-primary"
                  >
                    Prefill Last Session
                  </Button>
                  <Input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    max={todayISO()}
                    className="h-8 text-xs rounded-lg w-32"
                  />
                  <div className="relative flex items-center">
                    <Clock className="w-3 h-3 absolute left-2 text-muted-foreground pointer-events-none" />
                    <Input
                      type="time"
                      step="1"
                      value={sessionTime}
                      onChange={(e) => setSessionTime(e.target.value)}
                      className="h-8 text-xs rounded-lg pl-6 pr-1 w-24 font-mono"
                      title="Time of day (seconds included)"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSetTimeToNow}
                    className="h-8 px-2 text-[11px] rounded-lg text-muted-foreground hover:text-foreground"
                    title="Set to current local time"
                  >
                    Now
                  </Button>
                </div>
              </div>

              {saveSuccess && (
                <div className="p-3 bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 rounded-xl text-xs flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>Measurements saved successfully!</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {definitions.slice(0, 6).map((def) => {
                  const latest = latestByDef.get(def.id);
                  const displayLatest = latest ? displayLength(latest.value, units) : null;
                  return (
                    <div key={def.id} className="p-2.5 rounded-xl bg-secondary/30 border border-border/50 space-y-1">
                      <div className="text-[11px] font-semibold text-foreground truncate">{def.name}</div>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.1"
                          placeholder={displayLatest ? displayLatest.toFixed(1) : '0.0'}
                          value={values[def.id] || ''}
                          onChange={(e) => handleValueChange(def.id, e.target.value)}
                          className="h-8 pr-7 text-xs font-bold"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                          {lenUnit}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  onClick={() => saveBatchMutation.mutate()}
                  disabled={saveBatchMutation.isPending || Object.keys(values).length === 0}
                  className="gap-2 shadow-md shadow-primary/20"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Batch Session</span>
                </Button>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* VIEW 2: Anatomical Zones Cards Mode */}
      {activeTab === 'zones' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-secondary/20 border border-border/50">
            <div>
              <p className="text-xs font-semibold text-foreground">Session Date & Time</p>
              <p className="text-[11px] text-muted-foreground">Entries will be timestamped with second accuracy</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handlePrefillLatest}
                className="text-xs text-primary hover:text-primary"
              >
                Prefill Previous
              </Button>
              <Input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                max={todayISO()}
                className="h-8 text-xs rounded-lg w-32"
              />
              <div className="relative flex items-center">
                <Clock className="w-3 h-3 absolute left-2 text-muted-foreground pointer-events-none" />
                <Input
                  type="time"
                  step="1"
                  value={sessionTime}
                  onChange={(e) => setSessionTime(e.target.value)}
                  className="h-8 text-xs rounded-lg pl-6 pr-1 w-24 font-mono"
                  title="Time of day (seconds included)"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSetTimeToNow}
                className="h-8 px-2 text-[11px] rounded-lg text-muted-foreground hover:text-foreground"
                title="Set to current local time"
              >
                Now
              </Button>
            </div>
          </div>

          {/* Zones */}
          {(['core', 'upper', 'lower'] as const).map((zone) => {
            const zoneDefs = definitions.filter((d) => ZONE_MAPPINGS[d.slug] === zone);
            const zoneTitle =
              zone === 'core'
                ? '🫀 Core & Torso'
                : zone === 'upper'
                ? '💪 Upper Body & Arms'
                : '🦵 Lower Body & Legs';

            return (
              <GlassCard key={zone} className="border-border/60">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="text-base font-bold">{zoneTitle}</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {zoneDefs.map((def) => {
                      const latest = latestByDef.get(def.id);
                      const baseline = baselineByDef.get(def.id);
                      const latestDisp = latest ? displayLength(latest.value, units) : null;
                      const baselineDisp = baseline ? displayLength(baseline.value, units) : null;
                      const delta =
                        latestDisp !== null && baselineDisp !== null && latest?.id !== baseline?.id
                          ? Math.round((latestDisp - baselineDisp) * 10) / 10
                          : null;

                      return (
                        <div
                          key={def.id}
                          className="p-3.5 rounded-xl bg-secondary/30 border border-border/60 hover:border-primary/40 transition-all space-y-2 group"
                        >
                          <div className="flex items-center justify-between">
                            <Link
                              to={`/measurements/${def.id}`}
                              className="font-bold text-xs text-foreground group-hover:text-primary transition-colors flex items-center gap-1"
                            >
                              <span>{def.name}</span>
                              <ChevronRight className="w-3 h-3 text-muted-foreground" />
                            </Link>
                            {delta !== null && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  delta < 0
                                    ? 'bg-emerald-500/15 text-emerald-500'
                                    : 'bg-blue-500/15 text-blue-500'
                                }`}
                              >
                                {delta > 0 ? `+${delta}` : delta}
                              </span>
                            )}
                          </div>

                          <div className="flex items-baseline justify-between text-xs">
                            <span className="text-muted-foreground text-[11px]">Latest:</span>
                            <span className="font-black text-foreground">
                              {latestDisp ? `${latestDisp.toFixed(1)} ${lenUnit}` : '—'}
                            </span>
                          </div>

                          <div className="relative pt-1">
                            <Input
                              type="number"
                              step="0.1"
                              placeholder={latestDisp ? latestDisp.toFixed(1) : '0.0'}
                              value={values[def.id] || ''}
                              onChange={(e) => handleValueChange(def.id, e.target.value)}
                              className="pr-10 text-xs font-semibold h-9 rounded-lg"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium pt-1">
                              {lenUnit}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </GlassCard>
            );
          })}

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => saveBatchMutation.mutate()}
              disabled={saveBatchMutation.isPending || Object.keys(values).length === 0}
              className="gap-2 shadow-lg shadow-primary/25 px-8"
            >
              <Check className="w-4 h-4" />
              <span>Save Measurements</span>
            </Button>
          </div>
        </div>
      )}

      {/* VIEW 3: Chronological History Mode */}
      {activeTab === 'history' && (
        <GlassCard className="border-border/60 shadow-xl overflow-hidden">
          <CardHeader className="border-b border-border/40 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <select
                  value={filterDefId}
                  onChange={(e) => setFilterDefId(e.target.value)}
                  className="h-8 text-xs rounded-lg bg-secondary border border-border px-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Measurement Sites</option>
                  {definitions.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative w-full sm:w-56">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search logs or notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs rounded-lg"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredHistory.length === 0 ? (
              <div className="p-10">
                <EmptyState
                  icon={Ruler}
                  title="No measurements logged"
                  description="Switch to the Studio or Zones tab to record your circumferences."
                />
              </div>
            ) : (
              <div className="divide-y divide-border/40 max-h-[600px] overflow-y-auto">
                {filteredHistory.map((entry) => {
                  const def = definitions.find((d) => d.id === entry.definitionId);
                  const defName = def?.name || entry.name || 'Measurement';
                  const dispVal = displayLength(entry.value, units);

                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-4 px-6 hover:bg-secondary/40 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/measurements/${entry.definitionId}`}
                            className="font-bold text-sm text-foreground hover:text-primary transition-colors flex items-center gap-1"
                          >
                            <span>{defName}</span>
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          </Link>
                          <span className="text-sm font-black tabular-nums text-foreground">
                            {dispVal.toFixed(1)}{' '}
                            <span className="text-xs font-normal text-muted-foreground">
                              {lenUnit}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                          <span>{formatDateTime(entry.recorded_at || entry.date, 'EEEE, MMM d, yyyy · h:mm:ss a')}</span>
                          {entry.notes && (
                            <span className="italic truncate max-w-xs">• "{entry.notes}"</span>
                          )}
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteEntryId(entry.id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Delete log"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </GlassCard>
      )}

      {/* Custom Measurement Modal */}
      <Dialog open={customModalOpen} onOpenChange={setCustomModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Measurement Site</DialogTitle>
            <DialogDescription className="text-xs">
              Define a new body circumference to track (e.g. Neck, Ankle, Wrist).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Site Name</Label>
              <Input
                placeholder="e.g. Left Bicep (Flexed)"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Base Unit</Label>
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                className="w-full h-9 text-xs rounded-lg bg-secondary border border-border px-3 text-foreground"
              >
                <option value="cm">Centimeters (cm)</option>
                <option value="in">Inches (in)</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCustomModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (customName.trim()) {
                  createDefMutation.mutate({ name: customName.trim(), unit: customUnit });
                }
              }}
              disabled={createDefMutation.isPending || !customName.trim()}
            >
              Save Site
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        open={deleteEntryId !== null}
        onOpenChange={(open) => !open && setDeleteEntryId(null)}
        title="Delete Measurement Entry"
        description="Are you sure you want to remove this record? This action cannot be undone."
        onConfirm={() => {
          if (deleteEntryId !== null) deleteEntryMutation.mutate(deleteEntryId);
        }}
      />
    </div>
  );
}
