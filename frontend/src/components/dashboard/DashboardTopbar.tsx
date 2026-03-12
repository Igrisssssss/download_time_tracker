import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Menu, X } from 'lucide-react';
import type { User } from '@/types';
import AdaptiveSurface from '@/components/ui/AdaptiveSurface';
import TopNavigation from '@/components/dashboard/TopNavigation';
import type { NavGroup } from '@/navigation/dashboardNavigation';
import BrandLogo from '@/components/branding/BrandLogo';

interface DashboardTopbarProps {
  user?: User | null;
  groups: NavGroup[];
  unreadNotifications: number;
  notificationsOpen: boolean;
  profileOpen: boolean;
  mobileNavigationOpen: boolean;
  onToggleMobileNavigation: () => void;
  onToggleNotifications: () => void;
  onToggleProfile: () => void;
  onCloseMobileNavigation: () => void;
  onOpenExternal?: (path: string) => void;
  notificationPanel?: ReactNode;
  profilePanel?: ReactNode;
}

export default function DashboardTopbar({
  user,
  groups,
  unreadNotifications,
  notificationsOpen,
  profileOpen,
  mobileNavigationOpen,
  onToggleMobileNavigation,
  onToggleNotifications,
  onToggleProfile,
  onCloseMobileNavigation,
  onOpenExternal,
  notificationPanel,
  profilePanel,
}: DashboardTopbarProps) {
  const location = useLocation();
  const notificationsActive = location.pathname === '/notifications';
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollY;
      const scrollingUp = scrollDelta < 0;

      if (currentScrollY < 24) {
        setIsVisible(true);
      } else if (scrollingUp) {
        setIsVisible(true);
      } else if (scrollDelta > 3) {
        setIsVisible(false);
      }

      lastScrollY = currentScrollY;
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className={`sticky top-0 z-30 px-4 py-3 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform sm:px-6 lg:px-8 ${
        isVisible || mobileNavigationOpen || notificationsOpen || profileOpen ? 'translate-y-0' : '-translate-y-[115%]'
      }`}
    >
      <AdaptiveSurface
        className="relative overflow-visible w-full rounded-[30px] border border-white/75 bg-white/84 px-4 py-3 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.28)] backdrop-blur-2xl sm:px-5"
        tone="light"
        backgroundColor="rgba(255,255,255,0.82)"
      >
        <div className="flex items-center gap-3 lg:gap-4 xl:gap-6">
          <div className="hidden min-w-0 items-center md:flex md:max-w-[14rem] lg:max-w-[16rem]">
            <BrandLogo variant="full" size="sm" className="max-w-full" />
          </div>

          <button
            type="button"
            className="rounded-full border border-slate-200/90 bg-white/95 p-2.5 contrast-text-secondary shadow-sm lg:hidden"
            onClick={onToggleMobileNavigation}
            aria-label={mobileNavigationOpen ? 'Close navigation' : 'Open navigation'}
          >
            {mobileNavigationOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex min-w-0 items-center md:hidden">
            <BrandLogo variant="icon" size="sm" className="rounded-xl" />
          </div>

          <div className="hidden min-w-0 flex-1 lg:flex lg:justify-center">
            <TopNavigation groups={groups} onOpenExternal={onOpenExternal} />
          </div>

          <div className="ml-auto flex items-center justify-end gap-2 sm:gap-3 lg:flex-[0_1_auto]">
            <div className="relative">
              <button
                onClick={onToggleNotifications}
                aria-label="Notifications"
                className={`relative rounded-2xl border px-3.5 py-2.5 shadow-sm transition ${
                  notificationsOpen || notificationsActive
                    ? 'border-sky-200 bg-sky-50 text-sky-700'
                    : 'border-slate-200/90 bg-white/95 contrast-text-secondary hover:bg-white'
                }`}
              >
                <Bell className="h-5 w-5" />
                {unreadNotifications > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                ) : null}
              </button>
              {notificationPanel}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={onToggleProfile}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                className={`flex items-center gap-3.5 rounded-full border px-3 py-2 shadow-sm transition ${
                  profileOpen
                    ? 'border-sky-200 bg-sky-50 text-sky-900'
                    : 'border-white/80 bg-white/88 hover:bg-white'
                }`}
              >
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name || 'Profile'} className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#0f172a,#0284c7)] text-sm font-semibold text-white">
                    {user?.name?.charAt(0).toUpperCase() || 'A'}
                  </div>
                )}
                <div className="hidden text-left sm:block">
                  <p className="max-w-[9rem] truncate text-sm font-semibold contrast-text-primary">{user?.name || 'Admin'}</p>
                  <p className="text-xs capitalize contrast-text-muted">{user?.role || 'user'}</p>
                </div>
              </button>
              {profilePanel}
            </div>
          </div>
        </div>

        {mobileNavigationOpen ? (
          <div className="mt-4 border-t border-slate-200/70 pt-4 lg:hidden">
            <TopNavigation
              groups={groups}
              mobile
              onNavigate={onCloseMobileNavigation}
              onOpenExternal={onOpenExternal}
            />
          </div>
        ) : null}
      </AdaptiveSurface>
    </div>
  );
}
