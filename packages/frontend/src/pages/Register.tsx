import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { useSetupStatus } from '@/hooks/useAuth';
import { GlassCard, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

export default function Register() {
  const { data: setupStatus } = useSetupStatus();
  const isRegistrationClosed = setupStatus?.registrationEnabled === false;

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      {isRegistrationClosed ? (
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
            <h1 className="text-2xl font-bold tracking-tight text-gradient-violet">
              Create Your Account
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-1">
              Start tracking your body progress privately
            </p>
          </div>

          <GlassCard className="border-border/60 shadow-2xl backdrop-blur-2xl">
            <CardContent className="pt-6 pb-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground text-base">
                  Registration is Closed
                </h3>
                <p className="text-xs text-muted-foreground">
                  The administrator has disabled new user registrations for this instance.
                </p>
              </div>
              <Button asChild className="w-full">
                <Link to="/login" className="flex items-center justify-center gap-2">
                  <span>Go to Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </CardContent>
          </GlassCard>
        </motion.div>
      ) : (
        <OnboardingWizard mode="register" />
      )}
    </div>
  );
}
