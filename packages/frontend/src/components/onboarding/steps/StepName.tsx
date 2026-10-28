import React from 'react';
import { UserCheck, Sparkles, Smile } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OnboardingData } from '../types';

interface StepNameProps {
  data: OnboardingData;
  updateData: (fields: Partial<OnboardingData>) => void;
}

export const StepName: React.FC<StepNameProps> = ({ data, updateData }) => {
  const previewName = data.displayName.trim() || data.username.trim() || 'Champion';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>What should we call you?</span>
          <Smile className="w-6 h-6 text-primary animate-pulse" />
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Enter your preferred full name or nickname. This will appear on your dashboard, reports, and greeting.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ob-displayname" className="text-xs font-medium">
          Full Name / Display Name
        </Label>
        <div className="relative">
          <UserCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            id="ob-displayname"
            type="text"
            placeholder="e.g. Alex Johnson"
            value={data.displayName}
            onChange={(e) => updateData({ displayName: e.target.value })}
            className="pl-10 h-12 bg-background/50 text-base font-medium"
            autoFocus
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          You can change this anytime from your profile settings.
        </p>
      </div>

      {/* Live Preview Card */}
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-violet-500 text-white flex items-center justify-center font-bold text-sm shadow-md">
          {previewName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dashboard Preview</span>
          </div>
          <p className="text-sm font-medium text-foreground truncate">
            Welcome back, {previewName}!
          </p>
        </div>
      </div>
    </div>
  );
};
