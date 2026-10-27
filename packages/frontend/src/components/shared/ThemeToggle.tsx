import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  if (compact) {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    const icon =
      theme === 'dark' ? <Moon className="h-4 w-4" /> :
      theme === 'light' ? <Sun className="h-4 w-4" /> :
      <Monitor className="h-4 w-4" />;
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(next)}
        title={`Current theme: ${theme}`}
      >
        {icon}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary">
      {(['light', 'dark', 'system'] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTheme(t)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
            theme === t
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t === 'light' && <Sun className="h-3.5 w-3.5" />}
          {t === 'dark' && <Moon className="h-3.5 w-3.5" />}
          {t === 'system' && <Monitor className="h-3.5 w-3.5" />}
          <span className="capitalize">{t}</span>
        </button>
      ))}
    </div>
  );
}
