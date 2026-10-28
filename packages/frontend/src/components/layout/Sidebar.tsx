import { NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  Scale,
  Ruler,
  Target,
  Camera,
  Settings2,
  Database,
  LogOut,
  User2,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useLogout } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: Activity, exact: true },
  { to: '/log', label: 'Log Weight', icon: Scale },
  { to: '/measurements', label: 'Measurements', icon: Ruler },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/photos', label: 'Photos', icon: Camera },
  { to: '/settings', label: 'Settings', icon: Settings2 },
  { to: '/data', label: 'Data', icon: Database },
];

interface SidebarProps {
  collapsed?: boolean;
  onClose?: () => void;
}

export function Sidebar({ collapsed = false, onClose }: SidebarProps) {
  const { data: auth } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-background-secondary border-r border-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-border', collapsed && 'justify-center px-2')}>
        <img
          src="/app.png"
          alt="Forma logo"
          className="w-8 h-8 rounded-xl object-contain shadow-md shrink-0"
        />
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="text-lg font-bold text-gradient-violet overflow-hidden whitespace-nowrap"
            >
              Forma
            </motion.span>
          )}
        </AnimatePresence>

        {onClose && !collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="ml-auto text-muted-foreground hover:text-foreground h-8 w-8"
            title="Close menu"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto no-scrollbar">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group select-none',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'bg-primary/10 text-primary font-semibold shadow-sm'
                  : 'text-foreground/75 hover:text-foreground hover:bg-secondary/80'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-colors',
                    isActive ? 'text-primary' : 'text-foreground/60 group-hover:text-foreground'
                  )}
                />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="overflow-hidden whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: theme + user */}
      <div className={cn('border-t border-border py-3 px-2 space-y-1.5', collapsed && 'items-center flex flex-col')}>
        <div className={cn('px-1', collapsed && 'flex justify-center')}>
          <ThemeToggle compact={collapsed} />
        </div>
        {auth?.user && (
          <div
            onClick={() => {
              navigate('/settings');
              onClose?.();
            }}
            className={cn(
              'flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-secondary group cursor-pointer transition-colors',
              collapsed && 'justify-center'
            )}
            title="Account settings"
          >
            {auth.user.avatar_url ? (
              <img
                src={auth.user.avatar_url}
                alt={auth.user.displayName || auth.user.username}
                className="w-7 h-7 rounded-full object-cover border border-primary/30 shrink-0 shadow-sm"
              />
            ) : (
              <div className="w-7 h-7 rounded-full gradient-violet flex items-center justify-center shrink-0 shadow-sm">
                <User2 className="h-3.5 w-3.5 text-white" />
              </div>
            )}
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="flex-1 overflow-hidden min-w-0"
                >
                  <p className="text-xs font-medium truncate">
                    {auth.user.displayName || auth.user.username}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">@{auth.user.username}</p>
                </motion.div>
              )}
            </AnimatePresence>
            {!collapsed && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLogout();
                  onClose?.();
                }}
                className="opacity-80 hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
