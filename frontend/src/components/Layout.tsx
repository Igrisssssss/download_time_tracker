import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDesktopTracker } from '@/hooks/useDesktopTracker';
import { hasAdminAccess } from '@/lib/permissions';
import { notificationApi } from '@/services/api';
import DashboardTopbar from '@/components/dashboard/DashboardTopbar';
import AdaptiveSurface from '@/components/ui/AdaptiveSurface';
import { topNavigation } from '@/navigation/dashboardNavigation';
import {
  CalendarClock,
  Clock,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function Layout() {
  const { user, logout, token } = useAuth();
  useDesktopTracker();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const isAdminView = hasAdminAccess(user);
  const isDesktopShell = Boolean(window.desktopTracker);
  const webAppBaseUrl = (import.meta.env.VITE_WEB_APP_URL || window.location.origin).replace(/\/+$/, '');

  const openWebDashboard = (path: string) => {
    const target = path.startsWith('/') ? path : `/${path}`;
    const nextUrl = new URL(`${webAppBaseUrl}${target}`);
    if (token) {
      nextUrl.searchParams.set('desktop_token', token);
    }
    window.open(nextUrl.toString(), '_blank', 'noopener,noreferrer');
  };

  const primaryNavigation = useMemo(
    () => {
      const navigationGroups = isDesktopShell
        ? [
            {
              label: 'Timer',
              to: '/dashboard',
              icon: Clock,
            },
            {
              label: 'Attendance',
              icon: CalendarClock,
              items: [
                { label: 'Attendance Overview', to: '/attendance', icon: CalendarClock },
                { label: 'Edit Time', to: '/edit-time', icon: CalendarClock },
              ],
            },
            {
              label: 'Dashboard',
              to: '/desktop-web-dashboard',
              externalPath: '/dashboard',
              external: true,
              icon: LayoutDashboard,
            },
            {
              label: 'Chat',
              to: '/chat',
              icon: MessageSquare,
            },
          ]
        : topNavigation;

      return navigationGroups
        .filter((group) => (group.adminOnly ? isAdminView : true))
        .map((group) => ({
          ...group,
          items: group.items?.filter((item) => (item.adminOnly ? isAdminView : true)),
        }))
        .filter((group) => group.to || (group.items?.length || 0) > 0);
    },
    [isAdminView, isDesktopShell]
  );

  const handleLogout = async () => {
    await logout();
  };

  useEffect(() => {
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (notificationsOpen && notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }

      if (profileOpen && profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [notificationsOpen, profileOpen]);

  useEffect(() => {
    let active = true;

    const loadNotifications = async () => {
      try {
        const response = await notificationApi.list({ limit: 20 });
        if (!active) return;
        setNotifications(response.data?.data || []);
        setUnreadNotifications(Number(response.data?.unread_count || 0));
      } catch {
        if (active) {
          setNotifications([]);
          setUnreadNotifications(0);
        }
      }
    };

    loadNotifications();
    const interval = setInterval(loadNotifications, 8000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#eef5ff_45%,#f8fafc_100%)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[320px] bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.2),transparent_60%)]" />
      <div className="relative">
        <DashboardTopbar
          user={user}
          groups={primaryNavigation}
          unreadNotifications={unreadNotifications}
          notificationsOpen={notificationsOpen}
          profileOpen={profileOpen}
          mobileNavigationOpen={mobileNavigationOpen}
          onToggleMobileNavigation={() => {
            setMobileNavigationOpen((prev) => !prev);
            setNotificationsOpen(false);
            setProfileOpen(false);
          }}
          onToggleNotifications={() => {
            setNotificationsOpen((prev) => !prev);
            setProfileOpen(false);
            setMobileNavigationOpen(false);
          }}
          onToggleProfile={() => {
            setProfileOpen((prev) => !prev);
            setNotificationsOpen(false);
            setMobileNavigationOpen(false);
          }}
          onCloseMobileNavigation={() => setMobileNavigationOpen(false)}
          onOpenExternal={openWebDashboard}
          notificationPanel={
            <div ref={notificationsRef}>
            {notificationsOpen && (
              <AdaptiveSurface
                className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[24px] border border-white/80 bg-white/95 shadow-[0_32px_90px_-48px_rgba(15,23,42,0.55)] backdrop-blur-2xl"
                tone="light"
                backgroundColor="rgba(255,255,255,0.95)"
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold contrast-text-primary">Notifications</p>
                  <div className="flex items-center gap-3">
                    <Link
                      to="/notifications"
                      onClick={() => setNotificationsOpen(false)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                    >
                      View all
                    </Link>
                    <button
                      className="text-xs font-semibold text-sky-700 hover:underline"
                      onClick={async () => {
                        await notificationApi.markAllRead();
                        setUnreadNotifications(0);
                        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
                      }}
                    >
                      Mark all read
                    </button>
                  </div>
                </div>
                <div className="max-h-80 overflow-auto">
                  {notifications.length === 0 ? (
                    <p className="p-4 text-sm contrast-text-muted">No notifications</p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={async () => {
                          if (!n.is_read) {
                            await notificationApi.markRead(n.id);
                            setNotifications((prev) => prev.map((item) => item.id === n.id ? { ...item, is_read: true } : item));
                            setUnreadNotifications((prev) => Math.max(0, prev - 1));
                          }
                        }}
                        className={`w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50/80 ${n.is_read ? '' : 'bg-sky-50/70'}`}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] contrast-text-muted">{n.type?.replace('_', ' ')}</p>
                        <p className="mt-1 text-sm font-semibold contrast-text-primary">{n.title}</p>
                        <p className="mt-1 text-xs leading-6 contrast-text-secondary">{n.message}</p>
                      </button>
                    ))
                  )}
                </div>
              </AdaptiveSurface>
            )}
            </div>
          }
          profilePanel={
            <div ref={profileRef}>
              {profileOpen && (
                <AdaptiveSurface
                  className="absolute right-0 top-full z-50 mt-3 w-64 overflow-hidden rounded-[24px] border border-white/80 bg-white/95 p-2 shadow-[0_32px_90px_-48px_rgba(15,23,42,0.55)] backdrop-blur-2xl"
                  tone="light"
                  backgroundColor="rgba(255,255,255,0.95)"
                >
                  <div className="border-b border-slate-100 px-3 py-3">
                    <p className="text-sm font-semibold contrast-text-primary">{user?.name || 'Admin'}</p>
                    <p className="text-xs capitalize contrast-text-muted">{user?.role || 'user'}</p>
                  </div>
                  <div className="space-y-1 p-2">
                    <Link
                      to="/settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 rounded-[18px] px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                    >
                      <Settings className="h-4 w-4 text-slate-400" />
                      Settings
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        setProfileOpen(false);
                        await handleLogout();
                      }}
                      className="flex w-full items-center gap-3 rounded-[18px] px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </AdaptiveSurface>
              )}
            </div>
          }
        />

        <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 xl:px-12 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
