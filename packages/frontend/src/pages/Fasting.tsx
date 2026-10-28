import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Timer,
  Play,
  Square,
  Clock,
  Sparkles,
  Flame,
  Zap,
  Activity,
  Shield,
  HeartPulse,
  Apple,
  RotateCcw,
  Plus,
  Trash2,
  Calendar,
  Smile,
  ChevronRight,
  Info,
} from 'lucide-react';
import { api } from '@/lib/api';
import { GlassCard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FASTING_STAGES,
  getFastingStage,
  type FastingStage,
} from '@/utils/fastingStages';

interface FastingSession {
  id: string;
  fast_type: string;
  target_duration_hours: number;
  started_at: string;
  ended_at: string | null;
  status: 'active' | 'completed' | 'cancelled';
  notes: string | null;
  mood: string | null;
}

interface FastingHistoryResponse {
  sessions: FastingSession[];
  stats: {
    totalFasts: number;
    completedFasts: number;
    totalHoursFasted: number;
    longestFastHours: number;
    averageDurationHours: number;
  };
}

const FAST_PRESETS = [
  { type: '16:8', targetHours: 16, name: '16:8 Intermittent', desc: 'Classic daily fat burn & early ketosis' },
  { type: '18:6', targetHours: 18, name: '18:6 Fast', desc: 'Accelerated fat loss and active autophagy' },
  { type: '20:4', targetHours: 20, name: '20:4 Warrior', desc: 'Deep ketosis & 4-hour eating window' },
  { type: '23:1', targetHours: 23, name: 'OMAD (23:1)', desc: 'One Meal A Day cellular rejuvenation' },
  { type: '24:0', targetHours: 24, name: '24h Full Day', desc: 'Full 24-hour autophagy milestone' },
  { type: '36:0', targetHours: 36, name: '36h Monk Fast', desc: 'Extended fast for inflammation reduction' },
  { type: '48:0', targetHours: 48, name: '48h HGH Boost', desc: 'Maximal autophagy & growth hormone surge' },
  { type: '72:0', targetHours: 72, name: '72h+ Immune Reset', desc: 'Stem cell activation & deep renewal' },
];

export default function Fasting() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());

  // Modal states
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isEndOpen, setIsEndOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // Form states
  const [selectedPreset, setSelectedPreset] = useState(FAST_PRESETS[0]);
  const [customHours, setCustomHours] = useState(16);
  const [startTimeMode, setStartTimeMode] = useState<'now' | 'custom'>('now');
  const [customStartTime, setCustomStartTime] = useState('');
  const [startNotes, setStartNotes] = useState('');

  // End fast modal state
  const [endMood, setEndMood] = useState<'great' | 'good' | 'neutral' | 'struggling'>('great');
  const [endNotes, setEndNotes] = useState('');

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch active fast
  const { data: activeData, isLoading: isActiveLoading } = useQuery({
    queryKey: ['fasting-active'],
    queryFn: () => api.get<{ activeFast: FastingSession | null }>('/fasting/active'),
  });

  // Fetch history
  const { data: historyData } = useQuery({
    queryKey: ['fasting-history'],
    queryFn: () => api.get<FastingHistoryResponse>('/fasting/history'),
  });

  const activeFast = activeData?.activeFast;

  // Start fast mutation
  const startMutation = useMutation({
    mutationFn: (payload: any) => api.post('/fasting/start', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fasting-active'] });
      queryClient.invalidateQueries({ queryKey: ['fasting-history'] });
      setIsStartOpen(false);
    },
  });

  // End fast mutation
  const endMutation = useMutation({
    mutationFn: (payload: any) => api.post('/fasting/end', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fasting-active'] });
      queryClient.invalidateQueries({ queryKey: ['fasting-history'] });
      setIsEndOpen(false);
    },
  });

  // Edit fast mutation
  const editMutation = useMutation({
    mutationFn: (payload: any) => api.patch('/fasting/active', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fasting-active'] });
      setIsEditOpen(false);
    },
  });

  // Delete history item mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/fasting/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fasting-history'] });
    },
  });

  // Calculate elapsed time and progress
  let elapsedMs = 0;
  let elapsedHours = 0;
  let targetHours = activeFast?.target_duration_hours || 16;
  let progressPct = 0;
  let remainingMs = 0;

  if (activeFast) {
    const startMs = new Date(activeFast.started_at).getTime();
    elapsedMs = Math.max(0, now - startMs);
    elapsedHours = elapsedMs / (1000 * 60 * 60);
    targetHours = activeFast.target_duration_hours;
    progressPct = Math.min(100, Math.round((elapsedHours / targetHours) * 100));
    const targetMs = targetHours * 60 * 60 * 1000;
    remainingMs = Math.max(0, targetMs - elapsedMs);
  }

  const stageProgress = getFastingStage(elapsedHours);

  // Format milliseconds to HH:MM:SS
  const formatTimer = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const duration = selectedPreset.type === 'custom' ? customHours : selectedPreset.targetHours;
    const started_at = startTimeMode === 'custom' && customStartTime ? new Date(customStartTime).toISOString() : new Date().toISOString();

    startMutation.mutate({
      fast_type: selectedPreset.type,
      target_duration_hours: duration,
      started_at,
      notes: startNotes || undefined,
    });
  };

  const handleEndSubmit = (status: 'completed' | 'cancelled') => {
    endMutation.mutate({
      status,
      mood: endMood,
      notes: endNotes || undefined,
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
            <Timer className="w-7 h-7 text-primary" />
            <span>Fasting Tracker & Biology</span>
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            Track your fasting windows, cellular ketosis, and autophagy stages in real-time.
          </p>
        </div>

        {activeFast ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCustomStartTime(new Date(activeFast.started_at).toISOString().slice(0, 16));
                setIsEditOpen(true);
              }}
              className="gap-1.5 text-xs"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Edit Time</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsEndOpen(true)}
              className="gap-1.5 text-xs shadow-md shadow-destructive/20"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>End Fast</span>
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => {
              setCustomStartTime(new Date().toISOString().slice(0, 16));
              setIsStartOpen(true);
            }}
            className="gap-2 shadow-lg shadow-primary/25"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start Fasting</span>
          </Button>
        )}
      </div>

      {/* Hero Timer Section */}
      <GlassCard className="border-border/60 shadow-xl overflow-hidden relative">
        <CardContent className="p-6 sm:p-8">
          {activeFast ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Circular Timer Visual */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center">
                <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                    {/* Background Ring */}
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      className="stroke-secondary/80 fill-none"
                      strokeWidth="7"
                    />
                    {/* Animated Progress Ring */}
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke={stageProgress.currentStage.color}
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray="264"
                      strokeDashoffset={264 - (264 * Math.min(100, (elapsedHours / targetHours) * 100)) / 100}
                      className="transition-all duration-1000 ease-linear shadow-lg"
                    />
                  </svg>

                  {/* Inside Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${stageProgress.currentStage.badgeBg} ${stageProgress.currentStage.badgeText} mb-1 flex items-center gap-1.5`}
                    >
                      <span className="w-2 h-2 rounded-full animate-ping bg-current opacity-75" />
                      {stageProgress.currentStage.name}
                    </span>
                    <span className="text-3xl sm:text-4xl font-black tracking-tight text-foreground font-mono">
                      {formatTimer(elapsedMs)}
                    </span>
                    <span className="text-xs text-muted-foreground mt-1 font-medium">
                      {elapsedHours >= targetHours ? (
                        <span className="text-emerald-500 font-bold">Goal Achieved! (+{formatTimer(elapsedMs - targetHours * 3600 * 1000)})</span>
                      ) : (
                        <span>Remaining: {formatTimer(remainingMs)}</span>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground/80 mt-1">
                      Target: {targetHours}h ({activeFast.fast_type})
                    </span>
                  </div>
                </div>
              </div>

              {/* Biological Stage Details */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between border-b border-border/50 pb-3">
                  <div>
                    <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Current Cellular Stage
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2 mt-0.5">
                      <span>{stageProgress.currentStage.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-primary/10 text-primary">
                        Stage {stageProgress.currentStage.id} of 7
                      </span>
                    </h2>
                    <p className="text-xs text-primary font-semibold mt-0.5">
                      {stageProgress.currentStage.tagline}
                    </p>
                  </div>
                  {stageProgress.nextStage && (
                    <div className="text-right hidden sm:block">
                      <span className="text-[11px] text-muted-foreground">Next Stage in</span>
                      <div className="text-sm font-bold text-foreground">
                        {stageProgress.hoursToNextStage} hours
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
                  {stageProgress.currentStage.description}
                </p>

                {/* Cellular Effects Checklist */}
                <div className="p-3.5 rounded-xl bg-secondary/40 border border-border/50 space-y-2">
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>What's Happening Inside Your Body Right Now:</span>
                  </div>
                  <ul className="space-y-1.5">
                    {stageProgress.currentStage.cellularEffects.map((effect, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span>{effect}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
                <Timer className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-foreground">No Fast Currently Active</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Ready to start? Select your window (16:8, 20:4, OMAD, or extended 72h) and track your biological fat-burning milestones.
                </p>
              </div>
              <Button
                onClick={() => {
                  setCustomStartTime(new Date().toISOString().slice(0, 16));
                  setIsStartOpen(true);
                }}
                className="gap-2 shadow-lg shadow-primary/25"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Fasting Now</span>
              </Button>
            </div>
          )}
        </CardContent>
      </GlassCard>

      {/* Biological Timeline Milestones (0h to 72h) */}
      <GlassCard className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span>Fasting Biology Timeline</span>
          </CardTitle>
          <CardDescription className="text-xs">
            How your metabolism shifts from glucose burning to deep cellular autophagy and stem cell rejuvenation over time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            {FASTING_STAGES.map((s) => {
              const isReached = elapsedHours >= s.minHours && activeFast;
              const isCurrent = stageProgress.currentStage.id === s.id && activeFast;

              return (
                <div
                  key={s.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isCurrent
                      ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                      : isReached
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-border/60 bg-card/40 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-foreground">
                      {s.minHours}h – {s.maxHours >= 168 ? '72h+' : `${s.maxHours}h`}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.badgeBg} ${s.badgeText}`}
                    >
                      {isCurrent ? 'Current' : isReached ? '✓ Reached' : `Stage ${s.id}`}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-foreground truncate">{s.name}</h4>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                    {s.tagline}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </GlassCard>

      {/* History & Statistics */}
      {historyData?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <GlassCard className="p-4 border-border/60">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Total Fasts
            </div>
            <div className="text-2xl font-black text-foreground mt-1">
              {historyData.stats.completedFasts}
            </div>
          </GlassCard>
          <GlassCard className="p-4 border-border/60">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Total Fasted
            </div>
            <div className="text-2xl font-black text-foreground mt-1">
              {historyData.stats.totalHoursFasted}h
            </div>
          </GlassCard>
          <GlassCard className="p-4 border-border/60">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Longest Fast
            </div>
            <div className="text-2xl font-black text-foreground mt-1">
              {historyData.stats.longestFastHours}h
            </div>
          </GlassCard>
          <GlassCard className="p-4 border-border/60">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Avg Duration
            </div>
            <div className="text-2xl font-black text-foreground mt-1">
              {historyData.stats.averageDurationHours}h
            </div>
          </GlassCard>
        </div>
      )}

      {/* Completed Fasts List */}
      {historyData?.sessions && historyData.sessions.length > 0 && (
        <GlassCard className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <span>Fasting History</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/40">
              {historyData.sessions.map((session) => {
                const durationHours = session.ended_at
                  ? Math.round(
                      ((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) /
                        (1000 * 60 * 60)) *
                        10
                    ) / 10
                  : 0;

                return (
                  <div key={session.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">
                          {session.fast_type} Fast
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            session.status === 'completed'
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : 'bg-destructive/15 text-destructive'
                          }`}
                        >
                          {session.status}
                        </span>
                        {session.mood && (
                          <span className="text-xs capitalize text-muted-foreground">
                            • Feeling {session.mood}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(session.started_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {session.notes && ` — "${session.notes}"`}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold text-foreground">
                        {durationHours}h
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteMutation.mutate(session.id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Delete fast"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </GlassCard>
      )}

      {/* Start Fast Modal */}
      {isStartOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Play className="w-4 h-4 text-primary fill-current" />
                <span>Start New Fast</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsStartOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleStartSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Select Fasting Protocol</Label>
                <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {FAST_PRESETS.map((preset) => (
                    <button
                      key={preset.type}
                      type="button"
                      onClick={() => setSelectedPreset(preset)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        selectedPreset.type === preset.type
                          ? 'border-primary bg-primary/10 ring-1 ring-primary'
                          : 'border-border/60 hover:bg-secondary/40'
                      }`}
                    >
                      <div className="text-xs font-bold text-foreground">{preset.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{preset.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Start time mode */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Start Time</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={startTimeMode === 'now' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStartTimeMode('now')}
                    className="flex-1 text-xs"
                  >
                    Start Right Now
                  </Button>
                  <Button
                    type="button"
                    variant={startTimeMode === 'custom' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStartTimeMode('custom')}
                    className="flex-1 text-xs"
                  >
                    I Started Earlier
                  </Button>
                </div>

                {startTimeMode === 'custom' && (
                  <div className="pt-2">
                    <Input
                      type="datetime-local"
                      value={customStartTime}
                      onChange={(e) => setCustomStartTime(e.target.value)}
                      className="text-xs"
                      required
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Forgot to start earlier? Set the exact time of your last meal.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Notes (Optional)</Label>
                <Input
                  placeholder="e.g. Starting after dinner at 8pm"
                  value={startNotes}
                  onChange={(e) => setStartNotes(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setIsStartOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={startMutation.isPending}>
                  {startMutation.isPending ? 'Starting...' : 'Begin Fast'}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* End Fast Modal */}
      {isEndOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Square className="w-4 h-4 text-destructive fill-current" />
                <span>Finish Fasting Session</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEndOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-secondary/50 text-center">
                <div className="text-xs text-muted-foreground">Total Fast Duration</div>
                <div className="text-2xl font-black text-foreground mt-0.5">
                  {formatTimer(elapsedMs)}
                </div>
                <div className="text-[11px] text-primary font-semibold mt-1">
                  Reached: {stageProgress.currentStage.name}
                </div>
              </div>

              {/* Mood selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">How did you feel?</Label>
                <div className="grid grid-cols-4 gap-2">
                  {(['great', 'good', 'neutral', 'struggling'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setEndMood(m)}
                      className={`py-2 text-xs rounded-xl border capitalize font-medium transition-all ${
                        endMood === m
                          ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                          : 'border-border/60 hover:bg-secondary/40'
                      }`}
                    >
                      {m === 'great' ? '🔥 Great' : m === 'good' ? '✨ Good' : m === 'neutral' ? '😐 Okay' : '😓 Hard'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Reflections / Notes</Label>
                <Input
                  placeholder="e.g. Great mental focus, easy 18 hours"
                  value={endNotes}
                  onChange={(e) => setEndNotes(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleEndSubmit('cancelled')}
                  disabled={endMutation.isPending}
                  className="flex-1 text-xs"
                >
                  Discard Fast
                </Button>
                <Button
                  type="button"
                  onClick={() => handleEndSubmit('completed')}
                  disabled={endMutation.isPending}
                  className="flex-1 text-xs shadow-md shadow-primary/20"
                >
                  Save as Completed
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Start Time Modal */}
      {isEditOpen && activeFast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <h3 className="text-base font-bold text-foreground">Adjust Fast Start Time</h3>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Started At</Label>
                <Input
                  type="datetime-local"
                  value={customStartTime}
                  onChange={(e) => setCustomStartTime(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (customStartTime) {
                      editMutation.mutate({
                        started_at: new Date(customStartTime).toISOString(),
                      });
                    }
                  }}
                  disabled={editMutation.isPending}
                >
                  Save Time
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
