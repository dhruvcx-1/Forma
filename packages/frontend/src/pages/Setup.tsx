import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

export default function Setup() {
  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <OnboardingWizard mode="setup" />
    </div>
  );
}
