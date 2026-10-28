import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Share, X, Sparkles, Smartphone } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { GlassCard, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function PwaInstallPrompt() {
  const { canInstall, isIOS, hasDeferredPrompt, promptInstall, dismiss } = usePwaInstall();
  const [installing, setInstalling] = useState(false);

  if (!canInstall) {
    return null;
  }

  const handleInstallClick = async () => {
    setInstalling(true);
    await promptInstall();
    setInstalling(false);
  };

  return (
    <AnimatePresence>
      <motion.aside
        aria-label="Install Forma Application"
        initial={{ opacity: 0, y: 35, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 25, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed z-50 bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 shadow-2xl pointer-events-auto"
      >
        <GlassCard className="border-primary/30 shadow-2xl bg-card/95 backdrop-blur-2xl relative overflow-hidden ring-1 ring-primary/20">
          {/* Subtle accent glow */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/20 rounded-full blur-2xl pointer-events-none" />

          <CardContent className="p-4 space-y-3">
            {/* Header: Icon + Title + Close */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/app.png"
                  alt="Forma Icon"
                  className="w-10 h-10 rounded-xl object-contain shadow-md border border-primary/30 shrink-0"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-foreground">Install Forma</h3>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-primary/40 text-primary bg-primary/10">
                      App
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Faster, standalone experience</p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={dismiss}
                className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg shrink-0 -mr-1 -mt-1"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content Body */}
            {isIOS && !hasDeferredPrompt ? (
              // iOS Safari instruction guide
              <div className="p-2.5 rounded-xl bg-secondary/40 border border-border/50 text-xs text-muted-foreground space-y-2">
                <p className="text-[11px] leading-relaxed">
                  Install on your iPhone or iPad: tap the{' '}
                  <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                    <Share className="h-3.5 w-3.5 text-primary inline" /> Share
                  </span>{' '}
                  button in Safari, then select{' '}
                  <span className="font-semibold text-foreground">Add to Home Screen</span>.
                </p>
                <div className="pt-1 flex justify-end">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={dismiss}
                    className="h-7 text-xs px-3 rounded-lg"
                  >
                    Got it
                  </Button>
                </div>
              </div>
            ) : (
              // Standard Chromium / Android / Desktop 1-click install prompt
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Add Forma to your home screen or desktop for instant access, offline support, and full-screen tracking.
                </p>
                <div className="flex items-center justify-end gap-2 pt-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={dismiss}
                    className="text-xs h-8 px-3 rounded-lg text-muted-foreground hover:text-foreground"
                  >
                    Maybe Later
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleInstallClick}
                    disabled={installing}
                    className="text-xs h-8 px-3.5 gap-1.5 rounded-lg shadow-md shadow-primary/25"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{installing ? 'Installing...' : 'Install App'}</span>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </GlassCard>
      </motion.aside>
    </AnimatePresence>
  );
}
