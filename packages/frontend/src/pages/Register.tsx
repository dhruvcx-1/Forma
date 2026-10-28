import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, User, ArrowRight, ShieldCheck, UserPlus, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSetupStatus } from '@/hooks/useAuth';
import { GlassCard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Register() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: setupStatus } = useSetupStatus();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3) {
      setError('Username must be at least 3 characters long');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
      setError('Username may only contain letters, numbers, underscores, and dashes');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/register', {
        username: cleanUsername,
        displayName: displayName.trim() || undefined,
        password,
      });

      // Invalidate queries so AuthGuard picks up the new authenticated user
      await queryClient.invalidateQueries({ queryKey: ['auth'] });
      await queryClient.invalidateQueries({ queryKey: ['setup-status'] });

      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check your inputs.');
      setLoading(false);
    }
  };

  const isRegistrationClosed = setupStatus?.registrationEnabled === false;

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="text-center mb-6">
          <img
            src="/app.png"
            alt="Forma logo"
            className="inline-block w-16 h-16 rounded-2xl mb-3 shadow-xl shadow-primary/25 object-contain"
          />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gradient-violet">
            Create Your Account
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Start tracking your body progress privately
          </p>
        </div>

        <GlassCard className="border-border/60 shadow-2xl backdrop-blur-2xl">
          {isRegistrationClosed ? (
            <CardContent className="pt-6 pb-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">Registration Closed</h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  New user registrations are currently disabled by the administrator of this Forma instance.
                </p>
              </div>
              <Link to="/login" className="block w-full">
                <Button variant="outline" className="w-full text-xs h-10 gap-1.5">
                  <ArrowRight className="w-4 h-4 rotate-180" />
                  <span>Back to Sign In</span>
                </Button>
              </Link>
            </CardContent>
          ) : (
            <>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" />
                  <span>Account Details</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  All metrics remain strictly isolated in your private account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-3.5">
                  {error && (
                    <div className="p-3 text-xs bg-destructive/15 text-destructive border border-destructive/30 rounded-xl leading-relaxed">
                      {error}
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label htmlFor="username" className="text-xs">Username</Label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g. alex"
                        className="pl-9 h-9 text-xs"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="displayName" className="text-xs">Display Name (optional)</Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Alex Mercer"
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="password" className="text-xs">Password</Label>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="pl-9 h-9 text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="confirmPassword" className="text-xs">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pl-9 h-9 text-xs"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full mt-2 h-10 text-xs font-medium gap-2"
                    disabled={loading}
                  >
                    <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </GlassCard>

        {/* Navigation link to Login */}
        <div className="mt-4 text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Sign In
          </Link>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Local SQLite Storage &bull; Argon2id Encryption</span>
        </div>
      </motion.div>
    </div>
  );
}
