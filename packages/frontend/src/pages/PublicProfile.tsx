import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Lock,
  Scale,
  TrendingDown,
  TrendingUp,
  Target,
  Calendar,
  Sparkles,
  ArrowRight,
  User2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { subDays, parseISO, isAfter } from 'date-fns';
import { api } from '@/lib/api';
import type { PublicProfileData } from '@/types/api';
import { GlassCard, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

export default function PublicProfile() {
  const { username = '' } = useParams<{ username: string }>();
  const cleanUsername = username.replace(/^@/, '');

  const { data, isLoading, isError } = useQuery<PublicProfileData>({
    queryKey: ['public-profile', cleanUsername],
    queryFn: () => api.get<PublicProfileData>(`/public/profile/${encodeURIComponent(cleanUsername)}`),
    retry: 1,
  });

  const [timeRange, setTimeRange] = useState<'30d' | '90d' | '1y' | 'all'>('all');

  const unit = data?.stats.unit_system === 'imperial' ? 'lbs' : 'kg';

  // Filter history based on timeRange
  const filteredHistory = useMemo(() => {
    if (!data?.history) return [];
    if (timeRange === 'all') return data.history;

    const daysMap = { '30d': 30, '90d': 90, '1y': 365 };
    const cutoff = subDays(new Date(), daysMap[timeRange]);

    const filtered = data.history.filter((h) => {
      try {
        return isAfter(parseISO(h.date), cutoff);
      } catch {
        return true;
      }
    });

    return filtered.length > 0 ? filtered : data.history;
  }, [data?.history, timeRange]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl gradient-violet flex items-center justify-center animate-pulse mb-4">
          <img src="/app.png" alt="Forma" className="w-7 h-7 object-contain" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">Loading progress profile...</p>
      </div>
    );
  }

  // Private or Not Found screen
  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between p-4 md:p-8">
        <header className="max-w-4xl w-full mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/app.png" alt="Forma" className="w-7 h-7 rounded-xl object-contain shadow-sm" />
            <span className="font-bold text-gradient-violet text-lg">Forma</span>
          </Link>
          <ThemeToggle compact />
        </header>

        <main className="max-w-md w-full mx-auto my-auto py-12 text-center">
          <GlassCard className="p-8 space-y-5">
            <div className="w-16 h-16 rounded-3xl bg-secondary/80 border border-border flex items-center justify-center mx-auto shadow-inner text-muted-foreground">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Profile is Private</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                @{cleanUsername} has not shared their fitness progress publicly, or this profile does not exist.
              </p>
            </div>
            <div className="pt-2">
              <Link to="/login">
                <Button className="w-full gap-2">
                  <span>Track Your Own Progress</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </GlassCard>
        </main>

        <footer className="text-center text-xs text-muted-foreground py-4">
          Forma • Self-Hosted & Privacy-First Health Tech
        </footer>
      </div>
    );
  }

  const { profile, stats } = data;
  const isLoss = (stats.total_change ?? 0) < 0;
  const changeColor = isLoss ? 'text-emerald-400' : 'text-violet-400';
  const ChangeIcon = isLoss ? TrendingDown : TrendingUp;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-primary/20">
      {/* Top Bar */}
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <img src="/app.png" alt="Forma" className="w-8 h-8 rounded-xl object-contain shadow-md group-hover:scale-105 transition-transform" />
            <span className="font-bold text-gradient-violet text-lg tracking-tight">Forma</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <ThemeToggle compact />
            <Link to="/login">
              <Button size="sm" variant="outline" className="text-xs h-8">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Showcase */}
      <main className="max-w-5xl w-full mx-auto px-4 py-8 space-y-8 flex-1">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <GlassCard className="p-6 md:p-8">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
              {/* Avatar */}
              <div className="relative shrink-0">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name || profile.username}
                    className="w-24 h-24 rounded-3xl object-cover border-2 border-primary/30 shadow-xl shadow-primary/10"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-3xl gradient-violet flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-primary/20">
                    {(profile.display_name || profile.username).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-1 border-2 border-background" title="Verified Tracked Journey">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
              </div>

              {/* User Details */}
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                    {profile.display_name || profile.username}
                  </h1>
                  <Badge variant="outline" className="w-fit mx-auto sm:mx-0 text-xs text-primary border-primary/30 bg-primary/10">
                    Public Journey
                  </Badge>
                </div>
                <p className="text-sm font-medium text-muted-foreground">@{profile.username}</p>

                {profile.bio && (
                  <p className="text-sm text-foreground/90 leading-relaxed pt-1 max-w-2xl">
                    {profile.bio}
                  </p>
                )}

                <div className="flex items-center justify-center sm:justify-start gap-4 text-xs text-muted-foreground pt-2">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Member since {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </span>
                  <span>•</span>
                  <span>{stats.total_entries} total check-ins</span>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Highlight Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {/* Current Weight */}
          <GlassCard className="p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current Weight</p>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl md:text-3xl font-extrabold tabular-nums">
                {stats.current_weight !== null ? stats.current_weight : '—'}
              </span>
              <span className="text-xs text-muted-foreground font-medium">{unit}</span>
            </div>
            {stats.latest_date && (
              <p className="text-[11px] text-muted-foreground mt-1">Logged {stats.latest_date}</p>
            )}
          </GlassCard>

          {/* Total Change */}
          <GlassCard className="p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Progress</p>
            <div className="mt-2 flex items-baseline gap-1.5">
              {stats.total_change !== null ? (
                <>
                  <ChangeIcon className={`h-5 w-5 ${changeColor} self-center`} />
                  <span className={`text-2xl md:text-3xl font-extrabold tabular-nums ${changeColor}`}>
                    {Math.abs(stats.total_change)}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">{unit}</span>
                </>
              ) : (
                <span className="text-2xl font-extrabold text-muted-foreground">—</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {isLoss ? 'Weight reduction' : 'Weight gain / lean mass'}
            </p>
          </GlassCard>

          {/* Starting Weight */}
          <GlassCard className="p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Starting Weight</p>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl md:text-3xl font-extrabold tabular-nums">
                {stats.start_weight !== null ? stats.start_weight : '—'}
              </span>
              <span className="text-xs text-muted-foreground font-medium">{unit}</span>
            </div>
            {stats.first_date && (
              <p className="text-[11px] text-muted-foreground mt-1">Started {stats.first_date}</p>
            )}
          </GlassCard>

          {/* Goal Target */}
          <GlassCard className="p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Target Goal</p>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl md:text-3xl font-extrabold tabular-nums">
                {stats.goal_weight !== null ? stats.goal_weight : '—'}
              </span>
              <span className="text-xs text-muted-foreground font-medium">{unit}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {stats.goal_target_date ? `Target: ${stats.goal_target_date}` : 'Ongoing lifestyle'}
            </p>
          </GlassCard>
        </motion.div>

        {/* Interactive Progress Chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <GlassCard className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold tracking-tight">Weight Progress History</h2>
                <p className="text-xs text-muted-foreground">Verified progress timeline</p>
              </div>

              {/* Time Range Filter */}
              <div className="flex items-center gap-1 bg-secondary/60 p-1 rounded-xl w-fit border border-border/50">
                {(['30d', '90d', '1y', 'all'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      timeRange === r
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {r === 'all' ? 'All time' : r}
                  </button>
                ))}
              </div>
            </div>

            {filteredHistory.length > 0 ? (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={filteredHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="publicWeightGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(262 83% 58%)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(262 83% 58%)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.4)" />
                    <XAxis
                      dataKey="date"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `${val}`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const pt = payload[0].payload;
                        return (
                          <div className="glass-card p-3 shadow-xl rounded-xl border border-border text-xs space-y-1">
                            <p className="text-muted-foreground">{pt.date}</p>
                            <p className="font-bold text-base text-gradient-violet">
                              {pt.weight} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="weight"
                      stroke="hsl(262 83% 58%)"
                      strokeWidth={2.5}
                      fill="url(#publicWeightGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm">
                <Scale className="h-8 w-8 mb-2 opacity-50" />
                No weight records found for this period
              </div>
            )}
          </GlassCard>
        </motion.div>

        {/* Call to action card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <GlassCard className="p-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6 gradient-subtle">
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold">Ready to track your own transformation?</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Forma is self-hosted, 100% private, and open-source. Keep your health data completely in your control.
              </p>
            </div>
            <Link to="/setup">
              <Button className="gap-2 shrink-0">
                <span>Get Started with Forma</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </GlassCard>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground space-y-1">
        <p>Tracked with Forma • Privacy-First Health Analytics</p>
        <p className="text-[11px] opacity-75">Made with ❤️ by Dhruv Chaturvedi.</p>
      </footer>
    </div>
  );
}
