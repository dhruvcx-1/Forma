import React, { useState, useEffect } from 'react';
import { User, Lock, CheckCircle2, XCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { OnboardingData, OnboardingMode } from '../types';

interface StepAccountProps {
  data: OnboardingData;
  updateData: (fields: Partial<OnboardingData>) => void;
  mode: OnboardingMode;
  error?: string | null;
}

export const StepAccount: React.FC<StepAccountProps> = ({
  data,
  updateData,
  mode,
  error,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'available' | 'taken' | 'invalid'
  >('idle');

  // Debounced username availability check
  useEffect(() => {
    const trimmed = data.username.trim();
    if (!trimmed) {
      setUsernameStatus('idle');
      return;
    }

    if (trimmed.length < 3 || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setUsernameStatus('invalid');
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingUsername(true);
      try {
        const res = await api.get<{ available: boolean }>(
          `/auth/check-username?username=${encodeURIComponent(trimmed)}`
        );
        setUsernameStatus(res.available ? 'available' : 'taken');
      } catch {
        // Fallback if check fails or endpoint not ready
        setUsernameStatus('idle');
      } finally {
        setIsCheckingUsername(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [data.username]);

  // Password strength score
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (pwd.length >= 12) score += 1;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score += 1;
    return score; // 0 to 4
  };

  const strength = getPasswordStrength(data.password);
  const passwordsMatch =
    data.confirmPassword.length > 0 && data.password === data.confirmPassword;
  const passwordsMismatch =
    data.confirmPassword.length > 0 && data.password !== data.confirmPassword;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          {mode === 'setup' ? 'Create Admin Account' : 'Account Credentials'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === 'setup'
            ? 'Set up your master administrative credentials to protect your data.'
            : 'Choose your private login credentials to get started.'}
        </p>
      </div>

      {error && (
        <div className="p-3 text-xs bg-destructive/15 text-destructive border border-destructive/30 rounded-xl">
          {error}
        </div>
      )}

      {/* Username */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="ob-username" className="text-xs font-medium">
            Username
          </Label>
          {isCheckingUsername && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              Checking availability...
            </span>
          )}
          {!isCheckingUsername && usernameStatus === 'available' && (
            <span className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Username available
            </span>
          )}
          {!isCheckingUsername && usernameStatus === 'taken' && (
            <span className="text-[11px] text-destructive font-medium flex items-center gap-1">
              <XCircle className="w-3 h-3" />
              Username already taken
            </span>
          )}
          {!isCheckingUsername && usernameStatus === 'invalid' && (
            <span className="text-[11px] text-amber-500 font-medium">
              3+ alphanumeric characters
            </span>
          )}
        </div>
        <div className="relative">
          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            id="ob-username"
            type="text"
            placeholder="e.g. alex"
            autoComplete="username"
            value={data.username}
            onChange={(e) => updateData({ username: e.target.value })}
            className={`pl-10 h-11 bg-background/50 text-sm transition-colors ${
              usernameStatus === 'taken'
                ? 'border-destructive focus-visible:ring-destructive'
                : usernameStatus === 'available'
                ? 'border-emerald-500/50 focus-visible:ring-emerald-500'
                : ''
            }`}
            autoFocus
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <Label htmlFor="ob-password" className="text-xs font-medium">
          Password
        </Label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            id="ob-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            value={data.password}
            onChange={(e) => updateData({ password: e.target.value })}
            className="pl-10 pr-10 h-11 bg-background/50 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 transition-colors"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Password Strength Indicator */}
        {data.password.length > 0 && (
          <div className="space-y-1 pt-1">
            <div className="flex gap-1.5 h-1.5">
              {[1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={`flex-1 rounded-full transition-colors duration-300 ${
                    strength >= level
                      ? strength <= 1
                        ? 'bg-destructive'
                        : strength <= 2
                        ? 'bg-amber-500'
                        : strength <= 3
                        ? 'bg-blue-500'
                        : 'bg-emerald-500'
                      : 'bg-muted'
                  }`}
                />
              ))}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground px-0.5">
              <span>
                {strength <= 1
                  ? 'Too weak'
                  : strength <= 2
                  ? 'Moderate'
                  : strength <= 3
                  ? 'Strong'
                  : 'Very strong'}
              </span>
              <span>Min. 8 characters</span>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Password */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="ob-confirm-password" className="text-xs font-medium">
            Confirm Password
          </Label>
          {passwordsMatch && (
            <span className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Passwords match
            </span>
          )}
          {passwordsMismatch && (
            <span className="text-[11px] text-destructive font-medium flex items-center gap-1">
              <XCircle className="w-3 h-3" />
              Does not match
            </span>
          )}
        </div>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            id="ob-confirm-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Re-enter password"
            autoComplete="new-password"
            value={data.confirmPassword}
            onChange={(e) => updateData({ confirmPassword: e.target.value })}
            className={`pl-10 h-11 bg-background/50 text-sm transition-colors ${
              passwordsMismatch
                ? 'border-destructive focus-visible:ring-destructive'
                : passwordsMatch
                ? 'border-emerald-500/50 focus-visible:ring-emerald-500'
                : ''
            }`}
          />
        </div>
      </div>
    </div>
  );
};
