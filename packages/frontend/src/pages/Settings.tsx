import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Camera,
  Upload,
  Globe,
  Copy,
  ExternalLink,
  Sparkles,
  Heart,
  Code2,
  Lock,
  CheckCheck,
  LogOut,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { MeasurementDefinition, AdminUser, AdminSettings } from '@/types/api';
import { useAuth, useLogout } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useUnits } from '@/hooks/useUnits';
import { GlassCard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

export default function Settings() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: auth } = useAuth();
  const logout = useLogout();
  const { theme, setTheme } = useTheme();
  const { units } = useUnits();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarCameraRef = useRef<HTMLInputElement>(null);

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch (err) {
      console.warn('Logout error, clearing state locally:', err);
    } finally {
      queryClient.setQueryData(['auth'], null);
      navigate('/login');
    }
  };

  // Queries
  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, string>>('/settings'),
  });

  const { data: definitions = [] } = useQuery<MeasurementDefinition[]>({
    queryKey: ['measurement-definitions'],
    queryFn: () => api.get<MeasurementDefinition[]>('/measurements/definitions'),
  });

  // Local Form State - Settings
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [heightCm, setHeightCm] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | 'other'>('male');
  const [dob, setDob] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Local Form State - Profile & Public
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Sync settings when fetched
  useEffect(() => {
    if (settings.unit_system) setUnitSystem(settings.unit_system as any);
    if (settings.height_cm) setHeightCm(settings.height_cm);
    if (settings.sex) setSex(settings.sex as any);
    if (settings.date_of_birth) setDob(settings.date_of_birth);
  }, [settings]);

  // Sync profile when auth fetched
  useEffect(() => {
    if (auth?.user) {
      setDisplayName(auth.user.displayName || auth.user.display_name || '');
      setBio(auth.user.bio || '');
      setIsPublic(Boolean(auth.user.is_public || auth.user.isPublic));
    }
  }, [auth]);

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

  // Profile Mutation
  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      return api.put('/profile', {
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        is_public: isPublic,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      queryClient.invalidateQueries({ queryKey: ['public-profile'] });
      setProfileSaveSuccess(true);
      setTimeout(() => setProfileSaveSuccess(false), 3000);
    },
  });

  // Avatar Upload Mutation
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      setAvatarError(null);
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      queryClient.invalidateQueries({ queryKey: ['public-profile'] });
    },
    onError: (err: any) => {
      setAvatarError(err.message || 'Failed to upload avatar');
    },
  });

  // Avatar Delete Mutation
  const deleteAvatarMutation = useMutation({
    mutationFn: async () => {
      return api.delete('/profile/avatar');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      queryClient.invalidateQueries({ queryKey: ['public-profile'] });
    },
  });

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadAvatarMutation.mutate(file);
    }
    e.target.value = '';
  };

  const handleCopyPublicLink = () => {
    if (!auth?.user?.username) return;
    const url = `${window.location.origin}/@${auth.user.username}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Custom definition delete
  const [deleteDefId, setDeleteDefId] = useState<string | number | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

  const isAdmin = auth?.user?.role === 'admin';

  // Admin Queries
  const { data: adminSettings } = useQuery<AdminSettings>({
    queryKey: ['admin-settings'],
    queryFn: () => api.get<AdminSettings>('/admin/settings'),
    enabled: isAdmin,
  });

  const { data: adminUsers = [] } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: () => api.get<AdminUser[]>('/admin/users'),
    enabled: isAdmin,
  });

  // Admin Mutations
  const toggleRegistrationMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put('/admin/settings', { registration_enabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      queryClient.invalidateQueries({ queryKey: ['setup-status'] });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'admin' | 'user' }) =>
      api.put(`/admin/users/${userId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setDeleteUserId(null);
    },
  });

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

  const publicProfileUrl = auth?.user?.username ? `${window.location.origin}/@${auth.user.username}` : '';

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Settings2 className="h-7 w-7 text-primary" />
            <span>Settings & Preferences</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Customize your profile, public sharing, appearance, and biometrics.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 self-start sm:self-auto gap-1.5 shrink-0"
          title="Sign out of your account"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </Button>
      </div>

      <div className="space-y-6">
        {/* Section 1: User Profile & Picture */}
        <GlassCard className="border-border/70 shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">User Profile & Picture</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Personalize your public presence, avatar, and account display details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar Section */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <div className="relative group shrink-0">
                {auth?.user?.avatar_url ? (
                  <img
                    src={auth.user.avatar_url}
                    alt="Profile Avatar"
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-primary/30 shadow-md"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl gradient-violet flex items-center justify-center text-white text-2xl font-bold shadow-md">
                    {(displayName || auth?.user?.username || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                {uploadAvatarMutation.isPending && (
                  <div className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center text-xs text-white">
                    Uploading...
                  </div>
                )}
              </div>

              <div className="space-y-2 text-center sm:text-left flex-1">
                <p className="text-xs font-semibold text-foreground">Profile Picture</p>
                <p className="text-[11px] text-muted-foreground">
                  Upload a photo in JPEG, PNG, or WebP format (max 5 MB).
                </p>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                  <input
                    type="file"
                    ref={avatarInputRef}
                    onChange={handleAvatarFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                  <input
                    type="file"
                    ref={avatarCameraRef}
                    onChange={handleAvatarFileChange}
                    accept="image/*"
                    capture="user"
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => avatarCameraRef.current?.click()}
                    disabled={uploadAvatarMutation.isPending}
                    className="h-8 text-xs gap-1.5"
                    title="Take picture with camera"
                  >
                    <Camera className="h-3.5 w-3.5 text-primary" />
                    <span>Camera</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadAvatarMutation.isPending}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload Picture</span>
                  </Button>

                  {auth?.user?.avatar_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAvatarMutation.mutate()}
                      disabled={deleteAvatarMutation.isPending}
                      className="h-8 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      <span>Remove</span>
                    </Button>
                  )}
                </div>

                {avatarError && (
                  <p className="text-[11px] text-destructive pt-1">{avatarError}</p>
                )}
              </div>
            </div>

            {/* Display Name & Bio */}
            <div className="space-y-4 pt-2 border-t border-border/40">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="display_name" className="text-xs font-medium">Display Name</Label>
                  <Input
                    id="display_name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Your Name"
                    className="h-9 text-xs"
                    maxLength={64}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-xs font-medium">Username</Label>
                  <Input
                    id="username"
                    value={`@${auth?.user?.username || ''}`}
                    disabled
                    className="h-9 text-xs bg-muted/50 cursor-not-allowed opacity-80"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bio" className="text-xs font-medium">Bio & Fitness Notes</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell visitors about your training goals, current milestones, or fitness background..."
                  className="text-xs min-h-[70px] resize-none"
                  maxLength={256}
                />
                <p className="text-[10px] text-muted-foreground text-right">{bio.length}/256</p>
              </div>

              <div className="flex items-center justify-between pt-1">
                {profileSaveSuccess && (
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5" /> Profile updated successfully!
                  </span>
                )}
                <div className="ml-auto">
                  <Button
                    type="button"
                    onClick={() => saveProfileMutation.mutate()}
                    disabled={saveProfileMutation.isPending}
                    className="rounded-xl text-xs h-9 px-4 gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{saveProfileMutation.isPending ? 'Saving...' : 'Save Profile'}</span>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </GlassCard>

        {/* Section 2: Public Profile Sharing */}
        <GlassCard className="border-border/70 shadow-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">Public Progress Showcase</CardTitle>
              </div>
              <Badge variant={isPublic ? 'default' : 'outline'} className="text-[10px]">
                {isPublic ? 'Publicly Active' : 'Private (Default)'}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Allow anyone with your link to view your verified weight timeline and progress chart.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/60 bg-secondary/30">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-semibold text-foreground">Make Profile Public</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Default is disabled. When enabled, your public profile is accessible at{' '}
                  <span className="text-primary font-mono text-[10px]">appurl/@[username]</span>.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                onClick={() => {
                  const next = !isPublic;
                  setIsPublic(next);
                  api.put('/profile', { is_public: next }).then(() => {
                    queryClient.invalidateQueries({ queryKey: ['auth'] });
                  });
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isPublic ? 'bg-primary' : 'bg-muted'
                  }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isPublic ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>

            {isPublic ? (
              <div className="space-y-3 p-3.5 rounded-xl border border-primary/20 bg-primary/5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs font-semibold text-primary truncate">Your Public Profile Link:</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleCopyPublicLink}
                      className="h-7 text-[11px] gap-1 px-2.5"
                    >
                      {copiedLink ? <CheckCheck className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                    </Button>
                    <a
                      href={publicProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] h-7 px-2.5 rounded-lg border border-border bg-background hover:bg-secondary text-foreground transition-colors"
                    >
                      <span>View</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-background/80 border border-border/50 text-[11px] font-mono text-muted-foreground select-all break-all">
                  {publicProfileUrl}
                </div>

                <p className="text-[10px] text-muted-foreground italic flex items-center gap-1 pt-1">
                  <Shield className="h-3 w-3 text-primary shrink-0" />
                  <span>
                    Privacy Shield Active: Only weight metrics and goals are visible. Circumference logs, photos, and personal notes are never shared.
                  </span>
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 rounded-xl border border-border/40 bg-secondary/20">
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>Your profile is currently private. Visitors to your profile link will see a locked screen.</span>
              </div>
            )}
          </CardContent>
        </GlassCard>

        {/* Section 3: Appearance */}
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
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold capitalize transition-all ${theme === t
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

        {/* Section 4: Unit System */}
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
                className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border text-xs font-semibold transition-all ${unitSystem === 'metric'
                    ? 'border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary'
                    : 'border-border text-muted-foreground hover:bg-secondary'
                  }`}
              >
                <span>Metric (Kilograms & Centimeters)</span>
              </button>
              <button
                type="button"
                onClick={() => setUnitSystem('imperial')}
                className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border text-xs font-semibold transition-all ${unitSystem === 'imperial'
                    ? 'border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary'
                    : 'border-border text-muted-foreground hover:bg-secondary'
                  }`}
              >
                <span>Imperial (Pounds & Inches)</span>
              </button>
            </div>
          </CardContent>
        </GlassCard>

        {/* Section 5: Biometrics (for US Navy formula & BMI) */}
        <GlassCard className="border-border/70 shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Biometrics & Body Composition</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Used in conjunction with neck, waist, and hip measurements to compute US Navy body-fat estimates and BMI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="height_cm" className="text-xs font-medium">Height (cm)</Label>
                <Input
                  id="height_cm"
                  type="number"
                  step="any"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  placeholder="e.g. 178"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sex" className="text-xs font-medium">Biological Sex</Label>
                <select
                  id="sex"
                  value={sex}
                  onChange={(e) => setSex(e.target.value as any)}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="male">Male (Neck + Waist)</option>
                  <option value="female">Female (Neck + Waist + Hips)</option>
                  <option value="other">Other / Custom</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dob" className="text-xs font-medium">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {saveSuccess && (
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" /> Settings saved successfully!
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

        {/* Section 6: Custom Measurement Sites */}
        <GlassCard className="border-border/70 shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Ruler className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Custom Measurement Sites</CardTitle>
            </div>
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

        {/* Section 7 (Admin Only): Instance Administration & User Directory */}
        {isAdmin && (
          <GlassCard className="border-border/70 shadow-xl overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-violet-400" />
                  <CardTitle className="text-base font-semibold">Instance Administration</CardTitle>
                </div>
                <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/30 text-[10px]">
                  Admin Access
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Manage instance-wide registration, access policies, and registered user accounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Registration Toggle Card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border/50 bg-secondary/20 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-foreground">Public User Registration</p>
                    <Badge
                      variant={adminSettings?.registration_enabled ? 'default' : 'secondary'}
                      className={
                        adminSettings?.registration_enabled
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5'
                          : 'bg-muted text-muted-foreground text-[10px] px-2 py-0.5'
                      }
                    >
                      {adminSettings?.registration_enabled ? 'Open' : 'Closed'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground max-w-md leading-relaxed">
                    Allow new visitors to register at <code className="text-primary font-mono text-[11px]">/register</code>. Manageable via <code className="font-mono text-[11px]">ALLOW_REGISTRATION</code> env or this toggle.
                  </p>
                </div>

                <Button
                  variant={adminSettings?.registration_enabled ? 'destructive' : 'default'}
                  size="sm"
                  onClick={() =>
                    toggleRegistrationMutation.mutate(!adminSettings?.registration_enabled)
                  }
                  disabled={toggleRegistrationMutation.isPending}
                  className="rounded-xl text-xs h-9 px-4 shrink-0"
                >
                  {adminSettings?.registration_enabled ? 'Disable Registration' : 'Enable Registration'}
                </Button>
              </div>

              {/* User Directory */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <p className="text-xs font-semibold text-foreground">Registered User Accounts</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {adminUsers.length} {adminUsers.length === 1 ? 'user' : 'users'}
                  </span>
                </div>

                <div className="divide-y divide-border/40 border border-border/40 rounded-xl overflow-hidden bg-background/50">
                  {adminUsers.map((user) => {
                    const isSelf = String(user.id) === String(auth?.user?.id);
                    return (
                      <div
                        key={user.id}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-secondary/20 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt={user.display_name || user.username}
                              className="w-9 h-9 rounded-full object-cover border border-primary/20 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full gradient-violet flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {(user.display_name || user.username).charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-semibold text-foreground truncate">
                                {user.display_name || user.username}
                              </p>
                              {isSelf && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 border-primary/40 text-primary">
                                  You
                                </Badge>
                              )}
                              <Badge
                                className={
                                  user.role === 'admin'
                                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30 text-[9px] py-0 px-1.5'
                                    : 'bg-secondary text-secondary-foreground text-[9px] py-0 px-1.5'
                                }
                              >
                                {user.role === 'admin' ? 'Admin' : 'User'}
                              </Badge>
                              {user.is_public && (
                                <Badge className="text-[9px] py-0 px-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  Public Profile
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">
                              @{user.username} &bull; {user.weightCount} weigh-ins &bull; {user.measurementCount} measurements
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        {!isSelf && (
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[11px] h-7 px-2.5 rounded-lg"
                              disabled={updateRoleMutation.isPending}
                              onClick={() =>
                                updateRoleMutation.mutate({
                                  userId: user.id,
                                  role: user.role === 'admin' ? 'user' : 'admin',
                                })
                              }
                            >
                              {user.role === 'admin' ? 'Demote to User' : 'Make Admin'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeleteUserId(user.id)}
                              className="text-muted-foreground hover:text-destructive h-7 w-7 rounded-lg"
                              title="Delete user account"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </GlassCard>
        )}

        {/* Section 8: About Forma (Application Details & Creator Credit) */}
        <GlassCard className="border-border/70 shadow-xl overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src="/app.png" alt="Forma Logo" className="w-6 h-6 rounded-lg object-contain shadow-sm" />
                <CardTitle className="text-base font-semibold">About Forma</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono text-primary border-primary/30 bg-primary/10">
                v1.1.0-stable
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Premium, self-hosted body measurement and weight tracking architecture.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Forma combines the aesthetic refinement of Apple Health and Linear with privacy-first self-hosting.
              Your metrics, body composition formulas, and progress records remain strictly under your control on your local machine.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
              <div className="p-2.5 rounded-xl border border-border/50 bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Database</p>
                <p className="text-xs font-medium text-foreground mt-0.5">SQLite (WAL)</p>
              </div>
              <div className="p-2.5 rounded-xl border border-border/50 bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Backend</p>
                <p className="text-xs font-medium text-foreground mt-0.5">Fastify + Node 22</p>
              </div>
              <div className="p-2.5 rounded-xl border border-border/50 bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Frontend</p>
                <p className="text-xs font-medium text-foreground mt-0.5">React 18 + Vite</p>
              </div>
              <div className="p-2.5 rounded-xl border border-border/50 bg-secondary/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Privacy</p>
                <p className="text-xs font-medium text-emerald-400 mt-0.5">Zero Telemetry</p>
              </div>
            </div>

            {/* Creator Credit */}
            <div className="pt-3 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-foreground/90 font-medium">
                <Heart className="h-4 w-4 text-rose-500 fill-rose-500/20" />
                <span>Made with ❤️ by Dhruv Chaturvedi.</span>
              </div>
              <a
                href="https://github.com/dhruvcx-1/Forma"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors text-xs"
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>github.com/dhruvcx-1/Forma</span>
              </a>
            </div>
          </CardContent>
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

      {/* Delete User Account Confirmation */}
      <ConfirmDialog
        open={deleteUserId !== null}
        onOpenChange={(open) => !open && setDeleteUserId(null)}
        title="Delete User Account"
        description="Are you sure you want to delete this user? All of their weight entries, circumference logs, goals, and progress photos will be permanently deleted."
        confirmText="Delete Account"
        destructive
        onConfirm={() => deleteUserId && deleteUserMutation.mutate(deleteUserId)}
      />
    </div>
  );
}
