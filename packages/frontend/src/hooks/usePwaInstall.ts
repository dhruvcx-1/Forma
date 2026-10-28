import { useState, useEffect, useCallback } from 'react';

const DISMISS_KEY = 'forma_pwa_dismissed_until';
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
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);

  // Check if currently running in standalone display mode (already installed)
  const checkIsStandalone = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')
    );
  }, []);

  // Detect iOS Safari / WebKit environment
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as any).MSStream;

  useEffect(() => {
    if (checkIsStandalone()) {
      setIsInstalled(true);
      return;
    }

    // Check if user dismissed the prompt recently
    const dismissedUntil = localStorage.getItem(DISMISS_KEY);
    if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
      setIsDismissed(true);
    } else {
      setIsDismissed(false);
    }

    // Capture browser PWA install event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [checkIsStandalone]);

  const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
    } catch (err) {
      console.error('PWA install prompt error:', err);
    }
    return false;
  };

  const dismiss = () => {
    const expireTime = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(expireTime));
    setIsDismissed(true);
  };

  const isStandalone = checkIsStandalone();

  // Can install if:
  // 1) Not already running in standalone mode
  // 2) Not recently dismissed
  // 3) Supported by browser: either deferredPrompt fired (Android/Chrome/Edge/Desktop) OR iOS Safari
  const canInstall = !isStandalone && !isInstalled && !isDismissed && (deferredPrompt !== null || isIOS);

  return {
    canInstall,
    isStandalone,
    isIOS,
    hasDeferredPrompt: deferredPrompt !== null,
    promptInstall,
    dismiss,
  };
}
