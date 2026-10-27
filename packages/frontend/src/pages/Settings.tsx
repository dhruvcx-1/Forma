import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Settings2,
  User2,
  Scale,
  SunMoon,
  Trash2,
  Check,
  Shield,
  Ruler,
  HelpCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { MeasurementDefinition } from '@/types/api';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useUnits } from '@/hooks/useUnits';
import { GlassCard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

export default function Settings() {
  const queryClient = useQueryClient();
  const { data: auth } = useAuth();
  const { theme, setTheme } = useTheme();
  const { units } = useUnits();

  // Queries
  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, string>>('/settings'),
  });

  const { data: definitions = [] } = useQuery<MeasurementDefinition[]>({
    queryKey: ['measurement-definitions'],
    queryFn: () => api.get<MeasurementDefinition[]>('/measurements/definitions'),
  });

  // Local Form State
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [heightCm, setHeightCm] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | 'other'>('male');
  const [dob, setDob] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync settings when fetched
  useEffect(() => {
    if (settings.unit_system) setUnitSystem(settings.unit_system as any);
    if (settings.height_cm) setHeightCm(settings.height_cm);
    if (settings.sex) setSex(settings.sex as any);
    if (settings.date_of_birth) setDob(settings.date_of_birth);
  }, [settings]);

  // Settings Mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = {
        unit_system: unitSystem,
      };
      if (heightCm.trim()) payload.height_cm = heightCm.trim();
      if (sex) payload.sex = sex;
      if (dob) payload.date_of_birth = dob;

      return api.put('/settings', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      queryClient.invalidateQueries({ queryKey: ['body-composition'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  // Custom definition delete
  const [deleteDefId, setDeleteDefId] = useState<string | number | null>(null);
  const deleteDefMutation = useMutation({
    mutationFn: (id: string | number) => api.delete(`/measurements/definitions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurement-definitions'] });
      setDeleteDefId(null);
    },
  });

  const customDefs = useMemo(() => {
    return definitions.filter((d) => !d.is_system && !d.isBuiltIn);
  }, [definitions]);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <Settings2 className="h-7 w-7 text-primary" />
          <span>Settings & Preferences</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Customize your measurement units, appearance theme, and personal biometrics.
        </p>
      </div>

      <div className="space-y-6">
        {/* Section 1: Appearance */}
        <GlassCard className="border-border/70 shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <SunMoon className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Appearance & Theme</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Toggle between refined glassmorphism Dark and Light color palettes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 max-w-md">
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                    theme === t
                      ? 'border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary'
                      : 'border-border text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  <span>{t}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </GlassCard>

        {/* Section 2: Unit System */}
        <GlassCard className="border-border/70 shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Measurement Units</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Controls display formatting across weight, circumferences, and charts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
              <button
                type="button"
                onClick={() => setUnitSystem('metric')}
                className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border text-xs font-semibold transition-all ${
                  unitSystem === 'metric'
                    ? 'border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary'
                    : 'border-border text-muted-foreground hover:bg-secondary'
                }`}
              >
                <span>Metric (Kilograms & Centimeters)</span>
              </button>
              <button
                type="button"
                onClick={() => setUnitSystem('imperial')}
                className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border text-xs font-semibold transition-all ${
                  unitSystem === 'imperial'
                    ? 'border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary'
                    : 'border-border text-muted-foreground hover:bg-secondary'
                }`}
              >
                <span>Imperial (Pounds & Inches)</span>
              </button>
            </div>
          </CardContent>
        </GlassCard>

        {/* Section 3: Biometrics (for US Navy formula & BMI) */}
        <GlassCard className="border-border/70 shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Ruler className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Body Composition Biometrics</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Required to calculate US Navy circumference body fat percentage and BMI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="heightCm" className="text-xs">
                  Height (cm)
                </Label>
                <Input
                  id="heightCm"
                  type="number"
                  step="0.5"
                  placeholder="e.g. 178"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="rounded-xl h-9 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">e.g. 5'10" ≈ 178 cm</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Biological Sex</Label>
                <select
                  value={sex}
                  onChange={(e: any) => setSex(e.target.value)}
                  className="w-full h-9 rounded-xl bg-secondary border border-border px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="male">Male (waist + neck formula)</option>
                  <option value="female">Female (waist + hips + neck formula)</option>
                  <option value="other">Other</option>
                </select>
                <p className="text-[10px] text-muted-foreground">Selects formula equations</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dob" className="text-xs">
                  Date of Birth
                </Label>
                <Input
                  id="dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="rounded-xl h-9 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {saveSuccess && (
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" />
                  <span>Preferences saved successfully</span>
                </span>
              )}
              <div className="ml-auto">
                <Button
                  onClick={() => saveSettingsMutation.mutate()}
                  disabled={saveSettingsMutation.isPending}
                  className="rounded-xl text-xs h-9 px-4 gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{saveSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </GlassCard>

        {/* Section 4: Custom Measurement Sites */}
        <GlassCard className="border-border/70 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Custom Measurement Sites</CardTitle>
            <CardDescription className="text-xs">
              Manage custom body sites you have created. Built-in sites cannot be deleted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {customDefs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No custom measurement sites created yet. You can add them from the Measurements page.
              </p>
            ) : (
              <div className="divide-y divide-border/40">
                {customDefs.map((def) => (
                  <div key={def.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">{def.name}</p>
                      <p className="text-[10px] text-muted-foreground">Base unit: {def.unit}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteDefId(def.id)}
                      className="text-muted-foreground hover:text-destructive h-8 w-8 rounded-lg"
                      title="Delete site"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </GlassCard>

        {/* Section 5: Profile Info */}
        <GlassCard className="border-border/70 shadow-xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl gradient-violet flex items-center justify-center text-white font-bold text-sm">
              <User2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">
                {auth?.user?.displayName || auth?.user?.username || 'User Profile'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                @{auth?.user?.username} &bull; Self-hosted Master Profile
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px]">
            Single-User Active
          </Badge>
        </GlassCard>
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDefId !== null}
        onOpenChange={(open) => !open && setDeleteDefId(null)}
        title="Delete Measurement Site"
        description="Are you sure you want to delete this custom measurement site? Historical entries recorded for this site will also be deleted."
        confirmText="Delete"
        destructive
        onConfirm={() => deleteDefId && deleteDefMutation.mutate(deleteDefId)}
      />
    </div>
  );
}
