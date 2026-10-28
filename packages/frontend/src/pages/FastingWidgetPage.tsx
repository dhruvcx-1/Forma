import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Timer, ExternalLink, Flame, Sparkles, CheckCircle2, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { getFastingStage } from '@/utils/fastingStages';

interface WidgetData {
  active: boolean;
  profile: {
    username: string;
    display_name: string | null;
  };
  fast: {
    id: string;
    fast_type: string;
    target_duration_hours: number;
    started_at: string;
    elapsed_seconds: number;
    elapsed_hours: number;
    remaining_seconds: number;
    remaining_hours: number;
    progress_percent: number;
    is_goal_reached: boolean;
    stage: {
      id: number;
      minHours: number;
      maxHours: number;
      name: string;
      tagline: string;
      color: string;
    };
  } | null;
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (days > 0) {
    return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function FastingWidgetPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const username = searchParams.get('username');

  const [currentTime, setCurrentTime] = useState(Date.now());

  // Live timer tick every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch widget data
  const { data, isLoading, error } = useQuery<WidgetData>({
    queryKey: ['fasting-widget', token, username],
    queryFn: async () => {
      if (token) {
        return api.get<WidgetData>(`/public/fasting/widget?token=${encodeURIComponent(token)}`);
      }
      if (username) {
        return api.get<WidgetData>(`/public/fasting/widget?username=${encodeURIComponent(username)}`);
      }
      // Fallback to authenticated endpoint if no token or username
      const activeRes = await api.get<{ activeFast: any }>('/fasting/active');
      const activeFast = activeRes.activeFast;
      if (!activeFast) {
        return {
          active: false,
          profile: { username: 'You', display_name: null },
          fast: null,
        };
      }
      const nowMs = Date.now();
      const startMs = new Date(activeFast.started_at).getTime();
      const elapsedMs = Math.max(0, nowMs - startMs);
      const elapsedHours = elapsedMs / (1000 * 60 * 60);
      const targetHours = Number(activeFast.target_duration_hours);
      const remainingHours = Math.max(0, targetHours - elapsedHours);
      const stageProg = getFastingStage(elapsedHours);

      return {
        active: true,
        profile: { username: 'You', display_name: null },
        fast: {
          id: activeFast.id,
          fast_type: activeFast.fast_type,
          target_duration_hours: targetHours,
          started_at: activeFast.started_at,
          elapsed_seconds: Math.floor(elapsedMs / 1000),
          elapsed_hours: Math.round(elapsedHours * 100) / 100,
          remaining_seconds: Math.floor(remainingHours * 3600),
          remaining_hours: Math.round(remainingHours * 100) / 100,
          progress_percent: Math.min(100, Math.round((elapsedHours / targetHours) * 100)),
          is_goal_reached: elapsedHours >= targetHours,
          stage: {
            id: stageProg.currentStage.id,
            minHours: stageProg.currentStage.minHours,
            maxHours: stageProg.currentStage.maxHours,
            name: stageProg.currentStage.name,
            tagline: stageProg.currentStage.tagline,
            color: stageProg.currentStage.color,
          },
        },
      };
    },
    refetchInterval: 30000, // Sync with backend every 30s
  });

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-background text-foreground selection:bg-primary/20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <span className="text-xs text-muted-foreground font-mono animate-pulse">Loading fasting widget...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-background text-foreground text-center">
        <div className="max-w-xs p-6 rounded-2xl bg-card border border-border shadow-lg flex flex-col items-center">
          <Timer className="w-10 h-10 text-muted-foreground mb-3 opacity-60" />
          <h2 className="text-base font-semibold">Widget Unavailable</h2>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            The widget token is either missing, invalid, or has been regenerated.
          </p>
          <Link
            to="/fasting"
            className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
          >
            <span>Open Forma Fasting</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    );
  }

  const { active, profile, fast } = data;

  if (!active || !fast) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-background/95 text-foreground text-center">
        <div className="w-full max-w-sm p-6 rounded-3xl bg-card/60 backdrop-blur-xl border border-border/60 shadow-xl flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-secondary/80 flex items-center justify-center text-muted-foreground mb-3 shadow-inner">
            <Timer className="w-6 h-6 opacity-60" />
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            @{profile.username}
          </span>
          <h2 className="text-lg font-bold text-foreground mt-0.5">No Active Fast</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
            Currently between fasting windows. Start a fast in Forma to update this widget.
          </p>
          <Link
            to="/fasting"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <span>Launch Forma</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // Calculate live elapsed seconds based on initial started_at
  const startMs = new Date(fast.started_at).getTime();
  const liveElapsedSecs = Math.max(0, Math.floor((currentTime - startMs) / 1000));
  const liveElapsedHours = liveElapsedSecs / 3600;
  const targetHours = Number(fast.target_duration_hours);
  const isGoalReached = liveElapsedHours >= targetHours;
  const liveRemainingSecs = Math.max(0, Math.floor(targetHours * 3600 - liveElapsedSecs));
  const liveProgressPercent = Math.min(100, Math.round((liveElapsedHours / targetHours) * 100));

  // Determine stage dynamically
  const stageInfo = getFastingStage(liveElapsedHours);
  const currentStage = stageInfo.currentStage;

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-background/90 backdrop-blur-md text-foreground select-none overflow-hidden font-sans">
      <div className="w-full max-w-sm rounded-3xl bg-card/70 backdrop-blur-xl border border-border/60 shadow-2xl p-6 relative overflow-hidden transition-all duration-300">
        {/* Subtle stage glow in background */}
        <div
          className="absolute -top-16 -right-16 w-36 h-36 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-1000"
          style={{ backgroundColor: currentStage.color }}
        />

        {/* Top Header Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full animate-ping"
              style={{ backgroundColor: currentStage.color }}
            />
            <span className="text-xs font-bold tracking-tight text-foreground/90">
              @{profile.username}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-secondary/80 text-muted-foreground border border-border/40">
            <Flame className="w-3 h-3 text-orange-500 fill-orange-500" />
            <span>{fast.fast_type}</span>
          </div>
        </div>

        {/* Circular Live Timer Visual */}
        <div className="relative w-52 h-52 sm:w-56 sm:h-56 mx-auto flex items-center justify-center my-2">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
            {/* Background Track */}
            <circle
              cx="50"
              cy="50"
              r="41"
              className="stroke-secondary/60 fill-none"
              strokeWidth="7"
            />
            {/* Live Progress Ring */}
            <circle
              cx="50"
              cy="50"
              r="41"
              fill="none"
              stroke={currentStage.color}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray="257.6"
              strokeDashoffset={257.6 - (257.6 * liveProgressPercent) / 100}
              className="transition-all duration-1000 ease-linear"
            />
          </svg>

          {/* Central Timer Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3">
            <span
              className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1 transition-colors"
              style={{
                backgroundColor: `${currentStage.color}22`,
                color: currentStage.color,
              }}
            >
              Stage {currentStage.id}: {currentStage.name}
            </span>

            <span className="text-3xl sm:text-4xl font-black tracking-tight text-foreground font-mono">
              {formatDuration(liveElapsedSecs)}
            </span>

            <div className="text-[11px] font-medium mt-1">
              {isGoalReached ? (
                <span className="text-emerald-500 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Goal Reached!
                </span>
              ) : (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDuration(liveRemainingSecs)} left
                </span>
              )}
            </div>

            <span className="text-[10px] text-muted-foreground/75 mt-0.5">
              Target: {targetHours}h ({liveProgressPercent}%)
            </span>
          </div>
        </div>

        {/* Biological Stage Tagline Pill */}
        <div className="mt-3 p-3 rounded-2xl bg-secondary/40 border border-border/40 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Metabolic State
          </div>
          <div className="text-xs font-bold text-foreground mt-0.5 flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>{currentStage.tagline}</span>
          </div>
        </div>

        {/* Minimal Footer */}
        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="font-semibold text-muted-foreground/70 tracking-tight">Forma Fasting</span>
          <Link
            to="/fasting"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1 transition-colors"
          >
            <span>Open Fasting</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
