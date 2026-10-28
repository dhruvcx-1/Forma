import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Timer, ArrowRight, Play, Flame, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { GlassCard } from '@/components/ui/card';
import { getFastingStage } from '@/utils/fastingStages';

export function FastingWidget() {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data } = useQuery({
    queryKey: ['fasting-active'],
    queryFn: () => api.get<{ activeFast: any }>('/fasting/active'),
  });

  const activeFast = data?.activeFast;

  let elapsedHours = 0;
  let formattedTimer = '00:00:00';
  let targetHours = 16;
  let progressPct = 0;

  if (activeFast) {
    const startMs = new Date(activeFast.started_at).getTime();
    const elapsedMs = Math.max(0, now - startMs);
    elapsedHours = elapsedMs / (1000 * 60 * 60);
    targetHours = activeFast.target_duration_hours;
    progressPct = Math.min(100, Math.round((elapsedHours / targetHours) * 100));

    const totalSecs = Math.floor(elapsedMs / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    formattedTimer = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  const stage = getFastingStage(elapsedHours);

  return (
    <GlassCard className="p-4 sm:p-5 border-border/60 hover:border-border transition-all flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Timer className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Fasting Window</h3>
            <p className="text-[11px] text-muted-foreground">
              {activeFast ? `${activeFast.fast_type} Fast` : 'Ready to fast'}
            </p>
          </div>
        </div>

        {activeFast && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${stage.currentStage.badgeBg} ${stage.currentStage.badgeText} flex items-center gap-1`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            {stage.currentStage.name}
          </span>
        )}
      </div>

      {activeFast ? (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-foreground font-mono">
              {formattedTimer}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              {progressPct}% of {targetHours}h
            </span>
          </div>

          <div className="w-full h-1.5 bg-secondary/80 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${progressPct}%`,
                backgroundColor: stage.currentStage.color,
              }}
            />
          </div>

          <Link
            to="/fasting"
            className="flex items-center justify-between text-xs font-semibold text-primary hover:underline pt-1"
          >
            <span>View Cellular Stages & Details</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            No active fast. Start a 16:8 or extended fast to track cellular fat burning and autophagy.
          </p>
          <Link
            to="/fasting"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start a Fast</span>
          </Link>
        </div>
      )}
    </GlassCard>
  );
}
