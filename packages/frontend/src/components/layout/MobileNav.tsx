import { NavLink } from 'react-router-dom';
import { Activity, Scale, Ruler, Target, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: Activity, exact: true },
  { to: '/log', label: 'Log', icon: Scale },
  { to: '/measurements', label: 'Measure', icon: Ruler },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/photos', label: 'Photos', icon: Camera },
];

export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background/90 border-t border-border backdrop-blur-sm md:hidden safe-area-inset-bottom">
      <div className="flex items-center">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')}
                />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
