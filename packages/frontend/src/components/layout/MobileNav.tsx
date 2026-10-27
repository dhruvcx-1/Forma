import { NavLink, useLocation } from 'react-router-dom';
import { Activity, Scale, Ruler, Camera, Database, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: Activity, exact: true },
  { to: '/log', label: 'Log', icon: Scale },
  { to: '/measurements', label: 'Measure', icon: Ruler },
  { to: '/photos', label: 'Photos', icon: Camera },
  { to: '/data', label: 'Data', icon: Database },
];

interface MobileNavProps {
  onOpenMenu: () => void;
  menuOpen?: boolean;
}

export function MobileNav({ onOpenMenu, menuOpen = false }: MobileNavProps) {
  const location = useLocation();
  const isMoreActive =
    menuOpen ||
    ['/settings', '/goals'].some((p) => location.pathname.startsWith(p));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 border-t border-border backdrop-blur-md md:hidden safe-area-inset-bottom">
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors select-none',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'h-5 w-5 transition-transform active:scale-90',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <span className="truncate max-w-[54px]">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* More / Menu Drawer Toggle */}
        <button
          type="button"
          onClick={onOpenMenu}
          className={cn(
            'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors select-none',
            isMoreActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
          title="More options and menu"
        >
          <Menu
            className={cn(
              'h-5 w-5 transition-transform active:scale-90',
              isMoreActive ? 'text-primary' : 'text-muted-foreground'
            )}
          />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}
