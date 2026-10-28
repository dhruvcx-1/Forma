import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Copy,
  Check,
  RefreshCw,
  Share2,
  ExternalLink,
  Code2,
  ShieldCheck,
  Sparkles,
  Link as LinkIcon,
  Globe,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FastingShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FastingShareModal({ isOpen, onClose }: FastingShareModalProps) {
  const queryClient = useQueryClient();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isConfirmingRegen, setIsConfirmingRegen] = useState(false);

  // Fetch or create widget token
  const { data, isLoading } = useQuery<{ token: string }>({
    queryKey: ['fasting-widget-token'],
    queryFn: () => api.get<{ token: string }>('/fasting/widget-token'),
    enabled: isOpen,
  });

  // Regenerate token mutation
  const regenerateMutation = useMutation({
    mutationFn: () => api.post<{ token: string }>('/fasting/widget-token/regenerate', {}),
    onSuccess: (newRes) => {
      queryClient.setQueryData(['fasting-widget-token'], newRes);
      setIsConfirmingRegen(false);
    },
  });

  if (!isOpen) return null;

  const origin = window.location.origin;
  const token = data?.token || '';
  const widgetUrl = token ? `${origin}/fasting/widget?token=${token}` : '';
  const directUrl = `${origin}/fasting`;
  const iframeCode = `<iframe src="${widgetUrl}" width="360" height="420" frameborder="0" style="border-radius: 20px; overflow: hidden; border: 1px solid rgba(120,120,120,0.2);"></iframe>`;
  const apiUrl = token ? `${origin}/api/public/fasting/widget?token=${token}` : '';

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Share2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Fasting Widget & Share Link</h2>
            <p className="text-xs text-muted-foreground">
              Add your live fasting countdown to widgets, Notion, dashboards, or share it.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <span className="text-xs text-muted-foreground font-mono">Generating secure widget token...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Widget URL */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-primary" />
                  <span>Standalone Widget Link</span>
                </Label>
                <a
                  href={widgetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                >
                  <span>Preview</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={widgetUrl}
                  className="text-xs font-mono bg-secondary/50 select-all"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy('widget', widgetUrl)}
                  className="shrink-0 gap-1.5 min-w-[90px]"
                >
                  {copiedKey === 'widget' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-500 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Opens a distraction-free glassmorphic timer. Perfect for browser tabs, Notion embeds, and Home Assistant.
              </p>
            </div>

            {/* iFrame Embed Code */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-purple-500" />
                <span>Embed Code (iFrame)</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={iframeCode}
                  className="text-xs font-mono bg-secondary/50 select-all"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy('iframe', iframeCode)}
                  className="shrink-0 gap-1.5 min-w-[90px]"
                >
                  {copiedKey === 'iframe' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-500 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Paste directly into web dashboards, Obsidian notes, or external blogs.
              </p>
            </div>

            {/* Live JSON API */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Live Telemetry JSON API</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={apiUrl}
                  className="text-xs font-mono bg-secondary/50 select-all"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy('api', apiUrl)}
                  className="shrink-0 gap-1.5 min-w-[90px]"
                >
                  {copiedKey === 'api' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-500 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Fetch active fast telemetry for Apple Shortcuts, Scriptable widgets, or ESP32 e-ink screens.
              </p>
            </div>

            {/* Direct App Link */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-blue-500" />
                <span>Direct App Link</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={directUrl}
                  className="text-xs font-mono bg-secondary/50 select-all"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy('direct', directUrl)}
                  className="shrink-0 gap-1.5 min-w-[90px]"
                >
                  {copiedKey === 'direct' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-500 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Security Banner & Token Regeneration */}
            <div className="p-3.5 rounded-xl bg-secondary/40 border border-border/50 text-xs text-muted-foreground space-y-2 mt-2">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Privacy Protected:</strong> Anyone with your widget token can view your live fast status and stage. Private notes and personal weight entries are never shared.
                </span>
              </div>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                <span className="text-[11px]">Need to revoke access?</span>
                {isConfirmingRegen ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-destructive font-medium">Revoke old links?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs px-2.5"
                      onClick={() => regenerateMutation.mutate()}
                      disabled={regenerateMutation.isPending}
                    >
                      {regenerateMutation.isPending ? 'Regenerating...' : 'Yes, Revoke'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2"
                      onClick={() => setIsConfirmingRegen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsConfirmingRegen(true)}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2.5"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Regenerate Token</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={onClose} className="text-xs">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
