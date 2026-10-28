import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  ShieldCheck,
  User,
  Heart,
  Ruler,
  Scale,
  Target,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StepAccount } from './steps/StepAccount';
import { StepName } from './steps/StepName';
import { StepGender } from './steps/StepGender';
import { StepHeight } from './steps/StepHeight';
import { StepWeight } from './steps/StepWeight';
import { StepGoal } from './steps/StepGoal';
import {
  type OnboardingData,
  type OnboardingMode,
  INITIAL_ONBOARDING_DATA,
} from './types';

const STORAGE_KEY = 'forma_onboarding_draft';

const STEPS_CONFIG = [
  { id: 1, title: 'Account', icon: User },
  { id: 2, title: 'Name', icon: ShieldCheck },
  { id: 3, title: 'Profile', icon: Heart },
  { id: 4, title: 'Height', icon: Ruler },
  { id: 5, title: 'Weight', icon: Scale },
  { id: 6, title: 'Goal', icon: Target },
];

interface OnboardingWizardProps {
  mode: OnboardingMode;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ mode }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward
  const [data, setData] = useState<OnboardingData>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...INITIAL_ONBOARDING_DATA,
          ...parsed,
          // Never persist credentials
          password: '',
          confirmPassword: '',
        };
      }
    } catch {
      // ignore JSON errors
    }
    return INITIAL_ONBOARDING_DATA;
  });

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync draft to sessionStorage
  useEffect(() => {
    try {
      const draft = { ...data, password: '', confirmPassword: '' };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage errors
    }
  }, [data]);

  const updateData = (fields: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...fields }));
    if (error) setError(null);
  };

  // Step Validation logic
  const isStepValid = (stepNum: number): boolean => {
    switch (stepNum) {
      case 1: {
        const usernameValid =
          data.username.trim().length >= 3 &&
          /^[a-zA-Z0-9_-]+$/.test(data.username.trim());
        const passwordValid = data.password.length >= 8;
        const match = data.password === data.confirmPassword;
        return usernameValid && passwordValid && match;
      }
      case 2:
        return true; // Display name is optional
      case 3:
        return !!data.sex;
      case 4:
        return (
          data.heightCm !== null &&
          data.heightCm >= 50 &&
          data.heightCm <= 270
        );
      case 5:
        return (
          data.weightValue !== null &&
          data.weightValue >= 20 &&
          data.weightValue <= 500
        );
      case 6:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (!isStepValid(step)) {
      if (step === 1) {
        if (data.username.trim().length < 3) {
          setError('Username must be at least 3 characters long');
        } else if (!/^[a-zA-Z0-9_-]+$/.test(data.username.trim())) {
          setError(
            'Username can only contain alphanumeric characters, underscores, and dashes'
          );
        } else if (data.password.length < 8) {
          setError('Password must be at least 8 characters long');
        } else if (data.password !== data.confirmPassword) {
          setError('Passwords do not match');
        }
      } else if (step === 4) {
        setError('Please enter a valid height between 50 cm and 270 cm');
      } else if (step === 5) {
        setError('Please enter a valid body weight');
      }
      return;
    }

    setError(null);
    if (step < STEPS_CONFIG.length) {
      setDirection(1);
      setStep((s) => s + 1);
    } else {
      handleFinalSubmit();
    }
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) {
      setDirection(-1);
      setStep((s) => s - 1);
    }
  };

  const handleJumpToStep = (targetStep: number) => {
    if (targetStep < step) {
      setError(null);
      setDirection(-1);
      setStep(targetStep);
    } else if (targetStep > step) {
      // Only jump forward if all intermediary steps are valid
      let allValid = true;
      for (let s = step; s < targetStep; s++) {
        if (!isStepValid(s)) {
          allValid = false;
          break;
        }
      }
      if (allValid) {
        setError(null);
        setDirection(1);
        setStep(targetStep);
      }
    }
  };

  // Keyboard navigation: Enter triggers Next
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isSubmitting) {
        // Prevent enter on textarea
        if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, data, isSubmitting]);

  // Final Atomic Submission
  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Create Profile / Setup
      const endpoint = mode === 'setup' ? '/auth/setup' : '/auth/register';
      await api.post(endpoint, {
        username: data.username.trim(),
        displayName: data.displayName.trim() || undefined,
        password: data.password,
      });

      // 2. Save User Settings
      try {
        await api.put('/settings', {
          unit_system: data.unitSystem,
          height_cm: String(data.heightCm || 175),
          sex: data.sex,
        });
      } catch (settingsErr) {
        console.warn('Failed saving initial settings:', settingsErr);
      }

      // 3. Record Initial Baseline Weight
      if (data.weightValue && data.weightValue > 0) {
        try {
          await api.post('/weight', {
            value: data.weightValue,
            unit: data.weightUnit,
            recorded_at: new Date().toISOString(),
            notes: 'Baseline starting weight during onboarding',
          });
        } catch (weightErr) {
          console.warn('Failed recording initial weight:', weightErr);
        }
      }

      // 4. Save Initial Goal (if target provided)
      if (data.targetWeight && data.targetWeight > 0) {
        try {
          await api.post('/goals', {
            starting_weight: data.weightValue ?? undefined,
            starting_weight_unit: data.weightUnit,
            target_weight: data.targetWeight,
            target_weight_unit: data.weightUnit,
            target_date: data.targetDate || undefined,
            notes: `Initial ${data.goalType} goal configured during onboarding`,
          });
        } catch (goalErr) {
          console.warn('Failed creating initial goal:', goalErr);
        }
      }

      // Clear session draft
      sessionStorage.removeItem(STORAGE_KEY);

      // Invalidate queries so session state and status are fresh
      await queryClient.invalidateQueries({ queryKey: ['auth'] });
      await queryClient.invalidateQueries({ queryKey: ['setup-status'] });

      // Navigate to app
      window.location.href = '/';
    } catch (err: any) {
      setError(
        err.message ||
          'Failed to complete onboarding. Please verify your credentials.'
      );
      setIsSubmitting(false);
    }
  };

  const progressPercentage = Math.round((step / STEPS_CONFIG.length) * 100);

  // Framer motion variants
  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 35 : -35,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -35 : 35,
      opacity: 0,
    }),
  };

  return (
    <div className="w-full max-w-lg mx-auto relative z-10">
      {/* Brand Header */}
      <div className="text-center mb-6">
        <img
          src="/app.png"
          alt="Forma logo"
          className="inline-block w-14 h-14 rounded-2xl mb-3 shadow-lg shadow-primary/20 object-contain"
        />
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gradient-violet">
          {mode === 'setup' ? 'Welcome to Forma' : 'Join Forma'}
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
          {mode === 'setup'
            ? 'Initial setup: configure your private body tracker'
            : 'Track your body measurements, composition & progress'}
        </p>
      </div>

      <GlassCard className="border-border/60 shadow-2xl backdrop-blur-2xl overflow-hidden">
        {/* Stepper Progress Bar */}
        <div className="p-5 pb-3 border-b border-border/40">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-2">
            <span>
              Step {step} of {STEPS_CONFIG.length}: {STEPS_CONFIG[step - 1].title}
            </span>
            <span className="text-primary font-bold">{progressPercentage}%</span>
          </div>

          {/* Continuous progress bar line */}
          <div className="w-full h-1.5 bg-secondary/80 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-violet-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {/* Clickable Step Pills */}
          <div className="flex justify-between items-center mt-3 pt-1">
            {STEPS_CONFIG.map((s) => {
              const Icon = s.icon;
              const isPassed = step > s.id;
              const isCurrent = step === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={s.id > step && !isStepValid(step)}
                  onClick={() => handleJumpToStep(s.id)}
                  title={s.title}
                  className={`flex flex-col items-center group transition-transform ${
                    isCurrent ? 'scale-105' : 'hover:scale-105'
                  }`}
                >
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isPassed
                        ? 'bg-primary text-white shadow-sm'
                        : isCurrent
                        ? 'bg-primary/20 text-primary border-2 border-primary ring-2 ring-primary/20'
                        : 'bg-secondary/70 text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    {isPassed ? (
                      <Check className="w-4 h-4 stroke-[3]" />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span
                    className={`text-[10px] mt-1 font-medium hidden sm:block ${
                      isCurrent
                        ? 'text-foreground font-semibold'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {s.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Wizard Body */}
        <div className="p-5 sm:p-6 min-h-[360px] flex flex-col justify-between">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full flex-1"
            >
              {step === 1 && (
                <StepAccount
                  data={data}
                  updateData={updateData}
                  mode={mode}
                  error={error}
                />
              )}
              {step === 2 && (
                <StepName data={data} updateData={updateData} />
              )}
              {step === 3 && (
                <StepGender data={data} updateData={updateData} />
              )}
              {step === 4 && (
                <StepHeight data={data} updateData={updateData} />
              )}
              {step === 5 && (
                <StepWeight data={data} updateData={updateData} />
              )}
              {step === 6 && (
                <StepGoal data={data} updateData={updateData} />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Inline step-level error (for steps 2-6) */}
          {error && step !== 1 && (
            <div className="mt-4 p-3 text-xs bg-destructive/15 text-destructive border border-destructive/30 rounded-xl">
              {error}
            </div>
          )}

          {/* Bottom Actions Navigation */}
          <div className="flex items-center justify-between gap-3 pt-6 mt-4 border-t border-border/40">
            {step > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleBack}
                disabled={isSubmitting}
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </Button>
            ) : mode === 'register' ? (
              <Link
                to="/login"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Already have an account? <strong className="text-primary underline">Sign In</strong>
              </Link>
            ) : (
              <div />
            )}

            <Button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting || !isStepValid(step)}
              className="ml-auto min-w-[130px] gap-2 shadow-lg shadow-primary/25"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : step === STEPS_CONFIG.length ? (
                <>
                  <span>Complete Setup</span>
                  <Check className="w-4 h-4 stroke-[2.5]" />
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Footer reassurance */}
      <p className="text-center text-[11px] text-muted-foreground mt-4">
        🔒 All personal data is stored 100% locally on your private instance.
      </p>
    </div>
  );
};
