import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDesktopTracker } from '@/hooks/useDesktopTracker';
import { chatApi, notificationApi } from '@/services/api';
import { 
  LayoutDashboard, 
  Clock, 
  FolderKanban, 
  CheckSquare, 
  Users, 
  Monitor,
  MessageSquare,
  BarChart3, 
  FileText, 
  Wallet,
  Settings, 
  LogOut,
  Play,
  Bell,
  Menu,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function Layout() {
  const { user, logout } = useAuth();
  useDesktopTracker();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadSenders, setUnreadSenders] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const isAdminView = user?.role === 'admin' || user?.role === 'manager';
  const navigation = useMemo(
    () => [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, adminOnly: false },
      { name: 'Projects', href: '/projects', icon: FolderKanban, adminOnly: false },
      { name: 'Tasks', href: '/tasks', icon: CheckSquare, adminOnly: false },
      { name: 'Chat', href: '/chat', icon: MessageSquare, adminOnly: false },
      { name: 'Attendance', href: '/attendance', icon: Clock, adminOnly: false },
      { name: 'Team', href: '/team', icon: Users, adminOnly: true },
      { name: 'Monitoring', href: '/monitoring', icon: Monitor, adminOnly: true },
      { name: 'Reports', href: '/reports', icon: BarChart3, adminOnly: true },
      { name: 'Invoices', href: '/invoices', icon: FileText, adminOnly: true },
      { name: 'Payroll', href: '/payroll', icon: Wallet, adminOnly: true },
      { name: 'Settings', href: '/settings', icon: Settings, adminOnly: false },
    ].filter((item) => (item.adminOnly ? isAdminView : true)),
    [isAdminView]
  );

  const handleLogout = async () => {
    await logout();
  };

  useEffect(() => {
    let active = true;

    const loadUnread = async () => {
      try {
        const response = await chatApi.getUnreadSummary();
        if (!active) {
          return;
        }
        setUnreadSenders(Number(response.data?.unread_senders || 0));
      } catch {
        if (active) {
          setUnreadSenders(0);
        }
      }
    };

    loadUnread();
    const interval = setInterval(loadUnread, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (!notificationsOpen) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [notificationsOpen]);

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
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-lg">
        <SidebarContent 
          navigation={navigation} 
          location={location} 
          user={user} 
          unreadSenders={unreadSenders}
          onLogout={handleLogout}
          onClose={() => setSidebarOpen(false)}
        />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64 lg:bg-white lg:border-r lg:border-gray-200">
        <SidebarContent 
          navigation={navigation} 
          location={location} 
          user={user} 
          unreadSenders={unreadSenders}
          onLogout={handleLogout}
        />
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top header */}
        <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            
            <div className="flex-1" />
            
            <div className="flex items-center gap-4">
              <div className="relative" ref={notificationsRef}>
                <button
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                  className="relative p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <Bell className="h-5 w-5 text-gray-600" />
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center">
                      {unreadNotifications > 99 ? '99+' : unreadNotifications}
                    </span>
                  )}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                    <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900">Notifications</p>
                      <button
                        className="text-xs text-primary-700 hover:underline"
                        onClick={async () => {
                          await notificationApi.markAllRead();
                          setUnreadNotifications(0);
                          setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
                        }}
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-80 overflow-auto">
                      {notifications.length === 0 ? (
                        <p className="p-3 text-sm text-gray-500">No notifications</p>
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
                            className={`w-full text-left p-3 border-b border-gray-100 hover:bg-gray-50 ${n.is_read ? '' : 'bg-blue-50'}`}
                          >
                            <p className="text-xs uppercase tracking-wide text-gray-500">{n.type?.replace('_', ' ')}</p>
                            <p className="text-sm font-medium text-gray-900">{n.title}</p>
                            <p className="text-xs text-gray-600 mt-1">{n.message}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ navigation, location, unreadSenders, onLogout, onClose }: any) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary-600 flex items-center justify-center">
            <Clock className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">TimeTrack</span>
        </Link>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navigation.map((item: any) => {
            const isActive = location.pathname === item.href;
            return (
              <li key={item.name}>
                <Link
                  to={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={onClose}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} />
                  <span>{item.name}</span>
                  {item.href === '/chat' && unreadSenders > 0 && (
                    <span className="ml-auto min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center">
                      {unreadSenders > 99 ? '99+' : unreadSenders}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section */}
      <div className="border-t border-gray-200 p-4">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          <LogOut className="h-5 w-5 text-gray-400" />
          Sign out
        </button>
      </div>
    </div>
  );
}
