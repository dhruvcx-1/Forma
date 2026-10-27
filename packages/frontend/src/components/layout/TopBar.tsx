import { useLocation, NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, Menu, Database, User2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/log': 'Log Weight',
  '/measurements': 'Measurements',
  '/goals': 'Goals',
  '/photos': 'Photos',
  '/settings': 'Settings',
  '/data': 'Data',
};

interface TopBarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileMenu?: () => void;
}

export function TopBar({ sidebarCollapsed, onToggleSidebar, onOpenMobileMenu }: TopBarProps) {
  const { pathname } = useLocation();
  const { data: auth } = useAuth();

  // Try exact match first, then prefix match
  const title =
    PAGE_TITLES[pathname] ??
    Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path) && path !== '/')?.[1] ??
    'Forma';

  const userInitial = (auth?.user?.displayName || auth?.user?.username || 'U').charAt(0).toUpperCase();

  return (
    <header className="h-14 flex items-center justify-between px-3 md:px-4 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {/* Desktop sidebar toggle button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="hidden md:flex"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>

        {/* Mobile menu drawer toggle button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobileMenu}
          className="md:hidden text-muted-foreground hover:text-foreground h-9 w-9"
          title="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Brand icon on mobile */}
        <img
          src="/app.png"
          alt="Forma"
          className="w-6 h-6 rounded-lg object-contain md:hidden shrink-0"
        />

        <h1 className="text-base font-semibold truncate">{title}</h1>
      </div>

      {/* Right side shortcuts on mobile */}
      <div className="flex items-center gap-1.5 md:hidden">
        {/* Mobile quick link to Data tab */}
        <NavLink
          to="/data"
          className={({ isActive }) =>
            cn(
              'flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors',
              isActive && 'bg-primary/15 text-primary'
            )
          }
          title="Data Management"
        >
          <Database className="h-4 w-4" />
        </NavLink>

        {/* Mobile quick link to User / Settings tab */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center justify-center p-0.5 rounded-full transition-transform active:scale-95',
              isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            )
          }
          title="User Profile & Settings"
        >
          <div className="w-7 h-7 rounded-full gradient-violet flex items-center justify-center text-[11px] font-bold text-white shadow-sm">
            {userInitial || <User2 className="h-3.5 w-3.5" />}
          </div>
        </NavLink>
      </div>
    </header>
  );
}
