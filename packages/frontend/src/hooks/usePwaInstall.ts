import { useState, useEffect, useCallback } from 'react';

const DISMISS_KEY = 'forma_pwa_dismissed_until';
const INSTALLED_KEY = 'forma_pwa_installed';
const DISMISS_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Check if previously marked as installed in localStorage
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(INSTALLED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [isDismissed, setIsDismissed] = useState<boolean>(true);

  // Check if currently running in standalone display mode (already installed & opened as PWA)
  const checkIsStandalone = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')
    );
  }, []);

  // Detect iOS Safari / WebKit environment
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as any).MSStream;

  const markAsInstalled = useCallback(() => {
    try {
      localStorage.setItem(INSTALLED_KEY, 'true');
    } catch {
      // localStorage may fail in strict private browsing modes
    }
    setIsInstalled(true);
  }, []);

  useEffect(() => {
    // 1. If currently opened as standalone PWA, mark installed permanently and suppress
    if (checkIsStandalone()) {
      markAsInstalled();
      return;
    }

    // 2. If already marked installed in storage, stop here
    try {
      if (localStorage.getItem(INSTALLED_KEY) === 'true') {
        setIsInstalled(true);
        return;
      }
    } catch {
      // fallback
    }

    // 3. Check getInstalledRelatedApps() API if supported (Chrome 80+, Edge on Desktop & Android)
    if (typeof navigator !== 'undefined' && 'getInstalledRelatedApps' in navigator) {
      (navigator as any)
        .getInstalledRelatedApps()
        .then((relatedApps: any[]) => {
          if (Array.isArray(relatedApps) && relatedApps.length > 0) {
            markAsInstalled();
          }
        })
        .catch(() => {
          // ignore error
        });
    }

    // 4. Listen for dynamic display-mode changes (e.g. app launched or window transitioned)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        markAsInstalled();
      }
    };
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    } else if ((mediaQuery as any).addListener) {
      (mediaQuery as any).addListener(handleDisplayModeChange);
    }

    // 5. Check if user dismissed the prompt recently
    try {
      const dismissedUntil = localStorage.getItem(DISMISS_KEY);
      if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
        setIsDismissed(true);
      } else {
        setIsDismissed(false);
      }
    } catch {
      setIsDismissed(false);
    }

    // 6. Capture browser PWA install event
    const handleBeforeInstallPrompt = (e: Event) => {
      // If already installed, never prompt
      try {
        if (localStorage.getItem(INSTALLED_KEY) === 'true') {
          return;
        }
      } catch {}

      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      markAsInstalled();
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      } else if ((mediaQuery as any).removeListener) {
        (mediaQuery as any).removeListener(handleDisplayModeChange);
      }
    };
  }, [checkIsStandalone, markAsInstalled]);

  const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        markAsInstalled();
        setDeferredPrompt(null);
        return true;
      }
    } catch (err) {
      console.error('PWA install prompt error:', err);
    }
    return false;
  };

  const dismiss = useCallback(() => {
    const expireTime = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    try {
      localStorage.setItem(DISMISS_KEY, String(expireTime));
    } catch {}
    setIsDismissed(true);
  }, []);

  const isStandalone = checkIsStandalone();

  // Can install if:
  // 1) Not already running in standalone/fullscreen mode
  // 2) Not marked as installed (via standalone session, getInstalledRelatedApps, or prior install)
  // 3) Not recently dismissed
  // 4) Supported by browser: deferredPrompt available OR iOS Safari
  const canInstall = !isStandalone && !isInstalled && !isDismissed && (deferredPrompt !== null || isIOS);

  return {
    canInstall,
    isStandalone,
    isInstalled,
    isIOS,
    hasDeferredPrompt: deferredPrompt !== null,
    promptInstall,
    dismiss,
    markAsInstalled,
  };
}
