import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, User, Lock, Sparkles, Scale, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { GlassCard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Setup() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/setup', {
        username: username.trim(),
        displayName: displayName.trim() || undefined,
        password,
      });

      // Save initial units
      try {
        await api.put('/settings', { unit_system: units });
      } catch {
        // non-blocking
      }

      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <img
            src="/app.png"
            alt="Forma logo"
            className="inline-block w-16 h-16 rounded-2xl mb-4 shadow-xl shadow-primary/25 object-contain"
          />
          <h1 className="text-3xl font-bold tracking-tight text-gradient-violet">Welcome to Forma</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your private, self-hosted body progress tracker
          </p>
        </div>

        <GlassCard className="border-border/60 shadow-2xl backdrop-blur-2xl">
          <CardHeader>
            <CardTitle className="text-lg">Create Master Profile</CardTitle>
            <CardDescription className="text-xs">
              Forma stores your personal health data completely private on this machine.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 text-xs bg-destructive/15 text-destructive border border-destructive/30 rounded-xl">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose your username"
                    className="pl-9"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="displayName">Display Name (optional)</Label>
                <div className="relative">
                  <Sparkles className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your Nick Name"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Master Password</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9"
                    required
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">Minimum 8 characters. Hashed with Argon2id.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <Label>Default Unit System</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setUnits('metric')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all ${units === 'metric'
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-border text-muted-foreground hover:bg-secondary'
                      }`}
                  >
                    <Scale className="w-4 h-4" />
                    <span>Metric (kg / cm)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnits('imperial')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all ${units === 'imperial'
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-border text-muted-foreground hover:bg-secondary'
                      }`}
                  >
                    <Scale className="w-4 h-4" />
                    <span>Imperial (lbs / in)</span>
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full mt-4 h-11 text-sm font-medium gap-2"
                disabled={loading}
              >
                <span>{loading ? 'Creating Profile...' : 'Complete Setup & Enter Forma'}</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          </CardContent>
        </GlassCard>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>100% Offline Capable &bull; Zero External Telemetry</span>
        </div>
      </motion.div>
    </div>
  );
}
