import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  CalendarClock,
  Clock3,
  FileClock,
  FileSpreadsheet,
  Fingerprint,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  LineChart,
  MessageSquare,
  Settings,
  ShieldCheck,
  SquareKanban,
  Users,
  Wallet,
  Waypoints,
} from 'lucide-react';

export type NavLinkItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  external?: boolean;
  externalPath?: string;
};

export type NavGroup = {
  label: string;
  to?: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  items?: NavLinkItem[];
  external?: boolean;
  externalPath?: string;
};

export const topNavigation: NavGroup[] = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Reports',
    icon: BarChart3,
    adminOnly: true,
    items: [
      { label: 'Attendance', to: '/reports/attendance', icon: CalendarClock, adminOnly: true },
      { label: 'Hours Tracked', to: '/reports/hours-tracked', icon: Clock3, adminOnly: true },
      { label: 'Projects & Tasks', to: '/reports/projects-tasks', icon: FolderKanban, adminOnly: true },
      { label: 'Timeline', to: '/reports/timeline', icon: Waypoints, adminOnly: true },
      { label: 'Web & App Usage', to: '/reports/web-app-usage', icon: Activity, adminOnly: true },
      { label: 'Productivity', to: '/reports/productivity', icon: LineChart, adminOnly: true },
      { label: 'Custom Export', to: '/reports/custom-export', icon: FileSpreadsheet, adminOnly: true },
    ],
  },
  {
    label: 'Attendance',
    icon: CalendarClock,
    items: [
      { label: 'Attendance Overview', to: '/attendance', icon: CalendarClock },
      { label: 'Monitoring', to: '/monitoring/productive-time', icon: Gauge, adminOnly: true },
      { label: 'Edit Time', to: '/edit-time', icon: FileClock },
    ],
  },
  {
    label: 'Payroll',
    to: '/payroll',
    icon: Wallet,
    adminOnly: true,
  },
  {
    label: 'Task',
    to: '/tasks',
    icon: SquareKanban,
  },
  {
    label: 'Chat',
    to: '/chat',
    icon: MessageSquare,
  },
  {
    label: 'Settings',
    icon: Settings,
    items: [
      { label: 'Employees', to: '/employees', icon: Users, adminOnly: true },
      { label: 'Approval Inbox', to: '/approval-inbox', icon: Fingerprint, adminOnly: true },
      { label: 'Audit Logs', to: '/audit-logs', icon: ShieldCheck, adminOnly: true },
    ],
  },
];
