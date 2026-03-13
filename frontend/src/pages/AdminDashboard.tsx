import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  activityApi,
  attendanceApi,
  attendanceTimeEditApi,
  leaveApi,
  notificationApi,
  payrollApi,
  reportApi,
  reportGroupApi,
  screenshotApi,
  taskApi,
  timeEntryApi,
  userApi,
} from '@/services/api';
import DashboardDetailTabs from '@/components/dashboard/DashboardDetailTabs';
import DashboardFilterBar from '@/components/dashboard/DashboardFilterBar';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import DashboardInsightList from '@/components/dashboard/DashboardInsightList';
import DashboardKPIGrid from '@/components/dashboard/DashboardKPIGrid';
import DashboardTrendCard from '@/components/dashboard/DashboardTrendCard';
import DataTable from '@/components/dashboard/DataTable';
import EmptyStateCard from '@/components/dashboard/EmptyStateCard';
import SurfaceCard from '@/components/dashboard/SurfaceCard';
import { FeedbackBanner, PageErrorState } from '@/components/ui/PageState';
import {
  Activity,
  CalendarClock,
  Camera,
  CircleDollarSign,
  Clock3,
  Fingerprint,
  LayoutPanelTop,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';

type DashboardScope = 'organization' | 'employee';
type DatePreset = 'today' | '7d' | '30d' | 'custom';

interface PersistedFilterState {
  scope: DashboardScope;
  selectedEmployeeId: number | '';
  datePreset: DatePreset;
  startDate: string;
  endDate: string;
}

const FILTER_STORAGE_KEY = 'admin-dashboard-filters';

const toDate = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfToday = () => {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
};

const deriveDatesFromPreset = (preset: DatePreset) => {
  const end = endOfToday();
  const start = startOfToday();

  if (preset === '7d') {
    start.setDate(start.getDate() - 6);
  } else if (preset === '30d') {
    start.setDate(start.getDate() - 29);
  }

  return {
    startDate: toDate(start),
    endDate: toDate(end),
  };
};

const formatDuration = (seconds: number) => {
  const safe = Number.isFinite(Number(seconds)) ? Number(seconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const formatCurrency = (amount: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Not available';
  return new Date(value).toLocaleString();
};

const formatShortDate = (value?: string | null) => {
  if (!value) return 'Not available';
  return new Date(value).toLocaleDateString();
};

const percentage = (value: number, total: number) => {
  if (!total) return 0;
  return Math.round((value / total) * 100);
};

const normalizeToolLabel = (name: string, activityType: string) => {
  const trimmed = String(name || '').trim();
  const normalizedType = String(activityType || '').toLowerCase();

  if (!trimmed) {
    return normalizedType === 'url' ? 'unknown-site' : 'unknown-app';
  }

  if (normalizedType === 'url') {
    try {
      const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
      return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      const match = trimmed.match(/([a-z0-9-]+\.)+[a-z]{2,}/i);
      if (match?.[0]) {
        return match[0].replace(/^www\./, '').toLowerCase();
      }
    }
  }

  return trimmed.slice(0, 120);
};

const classifyProductivity = (toolLabel: string, activityType: string) => {
  const text = String(toolLabel || '').toLowerCase();
  const normalizedType = String(activityType || '').toLowerCase();
  const productiveKeywords = [
    'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'notion', 'slack', 'teams', 'zoom',
    'vscode', 'visual studio', 'intellij', 'pycharm', 'webstorm', 'phpstorm', 'terminal',
    'powershell', 'cmd', 'postman', 'figma', 'miro', 'docs.google', 'sheets.google', 'drive.google',
    'stackoverflow', 'learn.microsoft', 'developer.mozilla', 'trello', 'asana', 'linear', 'clickup',
    'outlook', 'gmail', 'calendar.google', 'word', 'excel', 'powerpoint', 'meet.google',
    'chat.openai', 'chatgpt', 'claude.ai', 'gemini.google', 'code', 'cursor', 'android studio',
    'datagrip', 'dbeaver', 'tableplus', 'mysql workbench', 'navicat',
  ];
  const unproductiveKeywords = [
    'youtube', 'netflix', 'primevideo', 'hotstar', 'spotify', 'instagram', 'facebook', 'twitter',
    'x.com', 'reddit', 'snapchat', 'tiktok', 'discord', 'twitch', 'pinterest', '9gag',
    'telegram', 'whatsapp', 'web.whatsapp', 'wa.me', 'fb.com', 'reels', 'shorts', 'cricbuzz', 'espncricinfo',
  ];

  const isProductive = productiveKeywords.some((keyword) => text.includes(keyword));
  const isUnproductive = unproductiveKeywords.some((keyword) => text.includes(keyword));

  if (isUnproductive && !isProductive) return 'unproductive';
  if (isProductive && !isUnproductive) return 'productive';
  if (normalizedType === 'idle') return 'neutral';
  if (normalizedType === 'url' || normalizedType === 'app') return 'productive';
  return 'neutral';
};

const productivityTone = (classification?: string | null) =>
  classification === 'productive'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : classification === 'unproductive'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';

const defaultFilters = (): PersistedFilterState => {
  const dates = deriveDatesFromPreset('today');
  return {
    scope: 'organization',
    selectedEmployeeId: '',
    datePreset: 'today',
    startDate: dates.startDate,
    endDate: dates.endDate,
  };
};

function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-52 rounded-[32px] bg-white/75" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-36 rounded-[28px] bg-white/75" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="h-80 rounded-[28px] bg-white/75" />
        <div className="h-80 rounded-[28px] bg-white/75" />
      </div>
      <div className="h-96 rounded-[28px] bg-white/75" />
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700">{eyebrow}</p>
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-slate-950">{title}</h2>
        <p className="max-w-3xl text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function StatStrip({
  items,
}: {
  items: Array<{ id: string; label: string; value: string | number; tone?: 'default' | 'warning' | 'good' }>;
}) {
  const toneClass = {
    default: 'bg-slate-50 text-slate-950',
    warning: 'bg-amber-50 text-amber-900',
    good: 'bg-emerald-50 text-emerald-900',
  };

  return (
    <SurfaceCard className="p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.id} className={`rounded-[22px] border border-slate-200/80 px-4 py-3 ${toneClass[item.tone || 'default']}`}>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
            <p className="mt-2 text-lg font-semibold tracking-[-0.03em]">{item.value}</p>
          </div>
        ))}
      </div>
    </SurfaceCard>
  );
}

function CompactList({
  title,
  description,
  rows,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  description: string;
  rows: Array<{ id: string; title: string; subtitle?: string; value?: string }>;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <SurfaceCard className="p-5">
      <h3 className="text-lg font-semibold tracking-[-0.04em] text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyStateCard title={emptyTitle} description={emptyDescription} icon={LayoutPanelTop} />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-3 rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-950">{row.title}</p>
                {row.subtitle ? <p className="mt-1 text-sm text-slate-500">{row.subtitle}</p> : null}
              </div>
              {row.value ? <span className="shrink-0 text-sm font-semibold text-slate-950">{row.value}</span> : null}
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
}

export default function AdminDashboard() {
  const [filters, setFilters] = useState<PersistedFilterState>(() => {
    const fallback = defaultFilters();
    const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return fallback;

    try {
      const parsed = JSON.parse(raw) as Partial<PersistedFilterState>;
      return {
        scope: parsed.scope === 'employee' ? 'employee' : 'organization',
        selectedEmployeeId:
          typeof parsed.selectedEmployeeId === 'number' && parsed.selectedEmployeeId > 0
            ? parsed.selectedEmployeeId
            : '',
        datePreset: ['today', '7d', '30d', 'custom'].includes(String(parsed.datePreset))
          ? (parsed.datePreset as DatePreset)
          : fallback.datePreset,
        startDate: parsed.startDate || fallback.startDate,
        endDate: parsed.endDate || fallback.endDate,
      };
    } catch {
      return fallback;
    }
  });
  const [exportFeedback, setExportFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const usersQuery = useQuery({
    queryKey: ['admin-dashboard-users'],
    queryFn: async () => {
      const response = await userApi.getAll({ period: 'all' });
      return (response.data || []).filter((item: any) => item.role === 'employee');
    },
  });

  const employees = usersQuery.data || [];

  useEffect(() => {
    if (filters.scope === 'employee' && filters.selectedEmployeeId === '' && employees.length > 0) {
      setFilters((current) => ({ ...current, selectedEmployeeId: employees[0].id }));
    }
  }, [employees, filters.scope, filters.selectedEmployeeId]);

  const organizationQuery = useQuery({
    queryKey: ['admin-dashboard-organization', filters.startDate, filters.endDate],
    enabled: filters.scope === 'organization',
    queryFn: async () => {
      const payrollMonth = filters.endDate.slice(0, 7);
      const [
        attendanceResponse,
        overallResponse,
        insightsResponse,
        websiteActivityResponse,
        leaveResponse,
        timeEditResponse,
        payrollResponse,
        notificationsResponse,
        groupsResponse,
        tasksResponse,
      ] = await Promise.all([
        attendanceApi.summary({ start_date: filters.startDate, end_date: filters.endDate }),
        reportApi.overall({ start_date: filters.startDate, end_date: filters.endDate }),
        reportApi.employeeInsights({ start_date: filters.startDate, end_date: filters.endDate }),
        activityApi.getAll({ start_date: filters.startDate, end_date: filters.endDate, type: 'url', page: 1 }),
        leaveApi.list({ status: 'pending' }),
        attendanceTimeEditApi.list({ status: 'pending' }),
        payrollApi.getRecords({ payroll_month: payrollMonth }),
        notificationApi.list({ limit: 6 }),
        reportGroupApi.list(),
        taskApi.getAll({ status: 'done' }),
      ]);

      return {
        attendance: attendanceResponse.data,
        overall: overallResponse.data,
        insights: insightsResponse.data,
        websiteActivity: websiteActivityResponse.data?.data || [],
        pendingLeaves: leaveResponse.data?.data || [],
        pendingTimeEdits: timeEditResponse.data?.data || [],
        payrollRecords: payrollResponse.data?.data || [],
        notifications: notificationsResponse.data?.data || [],
        groups: groupsResponse.data?.data || [],
        completedTasks: tasksResponse.data || [],
      };
    },
  });

  const employeeQuery = useQuery({
    queryKey: ['admin-dashboard-employee', filters.selectedEmployeeId, filters.startDate, filters.endDate],
    enabled: filters.scope === 'employee' && Boolean(filters.selectedEmployeeId),
    queryFn: async () => {
      const userId = Number(filters.selectedEmployeeId);
      const month = filters.endDate.slice(0, 7);
      const [
        profileResponse,
        insightsResponse,
        overallResponse,
        attendanceCalendarResponse,
        timeEntriesResponse,
        screenshotsResponse,
      ] = await Promise.all([
        userApi.getProfile360(userId, { start_date: filters.startDate, end_date: filters.endDate }),
        reportApi.employeeInsights({ start_date: filters.startDate, end_date: filters.endDate, user_id: userId }),
        reportApi.overall({ start_date: filters.startDate, end_date: filters.endDate, user_ids: [userId] }),
        attendanceApi.calendar({ month, user_id: userId }),
        timeEntryApi.getAll({ user_id: userId, start_date: filters.startDate, end_date: filters.endDate, page: 1 }),
        screenshotApi.getAll({ user_id: userId, page: 1 }),
      ]);

      return {
        profile: profileResponse.data,
        insights: insightsResponse.data,
        overall: overallResponse.data,
        calendar: attendanceCalendarResponse.data,
        timeEntries: timeEntriesResponse.data?.data || [],
        screenshots: screenshotsResponse.data?.data || [],
      };
    },
  });

  const activeQuery = filters.scope === 'organization' ? organizationQuery : employeeQuery;

  const handleScopeChange = (scope: DashboardScope) => {
    setExportFeedback(null);
    setFilters((current) => ({
      ...current,
      scope,
      selectedEmployeeId:
        scope === 'employee'
          ? current.selectedEmployeeId || employees[0]?.id || ''
          : current.selectedEmployeeId,
    }));
  };

  const handleDatePresetChange = (preset: DatePreset) => {
    setExportFeedback(null);
    if (preset === 'custom') {
      setFilters((current) => ({ ...current, datePreset: preset }));
      return;
    }

    const dates = deriveDatesFromPreset(preset);
    setFilters((current) => ({
      ...current,
      datePreset: preset,
      startDate: dates.startDate,
      endDate: dates.endDate,
    }));
  };

  const handleExport = async () => {
    setExportFeedback(null);
    setIsExporting(true);

    try {
      const response = await reportApi.export({
        start_date: filters.startDate,
        end_date: filters.endDate,
        user_ids: filters.scope === 'employee' && filters.selectedEmployeeId ? [Number(filters.selectedEmployeeId)] : undefined,
      });

      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', `dashboard-${filters.scope}-${filters.startDate}-to-${filters.endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);

      setExportFeedback({ tone: 'success', message: 'Dashboard export completed.' });
    } catch (error: any) {
      setExportFeedback({
        tone: 'error',
        message: error?.response?.data?.message || 'Failed to export dashboard data.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (usersQuery.isLoading || activeQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  if (usersQuery.isError || activeQuery.isError) {
    return (
      <PageErrorState
        message={
          (usersQuery.error as any)?.response?.data?.message ||
          (activeQuery.error as any)?.response?.data?.message ||
          'Failed to load the admin dashboard.'
        }
        onRetry={() => {
          void usersQuery.refetch();
          void activeQuery.refetch();
        }}
      />
    );
  }

  if (filters.scope === 'employee' && !filters.selectedEmployeeId) {
    return (
      <div className="space-y-8 pb-6">
        <DashboardHeader
          eyebrow="Admin dashboard"
          title="Employee analytics view"
          description="Switch to a single employee to review attendance, productivity, activity, leave, payroll, and monitoring from one calmer workspace."
        >
          <DashboardFilterBar
            scope={filters.scope}
            onScopeChange={handleScopeChange}
            selectedEmployeeId={filters.selectedEmployeeId}
            onEmployeeChange={(value) => setFilters((current) => ({ ...current, selectedEmployeeId: value }))}
            employees={employees}
            datePreset={filters.datePreset}
            onDatePresetChange={handleDatePresetChange}
            startDate={filters.startDate}
            endDate={filters.endDate}
            onStartDateChange={(value) => setFilters((current) => ({ ...current, startDate: value }))}
            onEndDateChange={(value) => setFilters((current) => ({ ...current, endDate: value }))}
            onRefresh={() => void usersQuery.refetch()}
            onExport={handleExport}
            isRefreshing={usersQuery.isFetching}
            isExporting={isExporting}
          />
        </DashboardHeader>
        <EmptyStateCard title="No employees available" description="Add employees first to unlock the single-employee dashboard view." icon={Users} />
      </div>
    );
  }

  const selectedEmployee = employees.find((employee: any) => employee.id === filters.selectedEmployeeId) || null;
  const organizationData: any = organizationQuery.data;
  const employeeData: any = employeeQuery.data;

  const attendanceRows = organizationData?.attendance?.data || [];
  const overallSummary = organizationData?.overall?.summary || {};
  const overallByUser = organizationData?.overall?.by_user || [];
  const overallByDay = organizationData?.overall?.by_day || [];
  const organizationSummary = organizationData?.insights?.organization_summary || {};
  const liveMonitoring = organizationData?.insights?.live_monitoring || {
    employees_active: [],
    employees_inactive: [],
    employees_on_leave: [],
  };
  const teamRankings = organizationData?.insights?.team_rankings?.by_efficiency || [];
  const payrollRecords = organizationData?.payrollRecords || [];
  const organizationWebsiteActivity = organizationData?.websiteActivity || [];
  const pendingLeaves = organizationData?.pendingLeaves || [];
  const pendingTimeEdits = organizationData?.pendingTimeEdits || [];
  const notifications = organizationData?.notifications || [];
  const groups = organizationData?.groups || [];
  const completedTasks = organizationData?.completedTasks || [];
  const presentEmployees = attendanceRows.filter((row: any) => Number(row.present_days || row.days_present || 0) > 0).length;
  const lateEmployees = attendanceRows.filter((row: any) => Number(row.late_days || 0) > 0).length;
  const absentEmployees = Math.max(attendanceRows.length - presentEmployees, 0);
  const topPerformers = [...overallByUser]
    .sort((a: any, b: any) => Number(b.billable_duration || 0) - Number(a.billable_duration || 0))
    .slice(0, 5);
  const attentionEmployees = [...overallByUser]
    .sort((a: any, b: any) => Number(b.idle_percentage || 0) - Number(a.idle_percentage || 0))
    .slice(0, 5);
  const payrollTotal = payrollRecords.reduce((sum: number, row: any) => sum + Number(row.net_salary || 0), 0);
  const payrollPaidCount = payrollRecords.filter((row: any) => row.payroll_status === 'paid').length;
  const totalPendingApprovals = pendingLeaves.length + pendingTimeEdits.length;

  const profile: any = employeeData?.profile;
  const employeeInsights: any = employeeData?.insights;
  const employeeOverall: any = employeeData?.overall;
  const employeeCalendar: any = employeeData?.calendar;
  const employeeEntries = employeeData?.timeEntries || [];
  const employeeScreenshots = employeeData?.screenshots || [];
  const employeeSummary: any = profile?.summary || {};
  const employeeStatus: any = profile?.status || {};
  const employeeStats: any = employeeInsights?.stats || {};
  const selectedUserTools = employeeInsights?.selected_user_tools || { productive: [], unproductive: [], neutral: [] };
  const employeeTrend = employeeOverall?.by_day || [];
  const calendarSummary: any = employeeCalendar?.summary || {};
  const latestAttendance: any = employeeStatus.latest_attendance;
  const employeeLiveMonitoring: any = employeeInsights?.live_monitoring?.selected_user || null;
  const monthlyAttendancePercentage = percentage(
    Number(calendarSummary.present_days || 0),
    Number(calendarSummary.present_days || 0) + Number(calendarSummary.absent_days || 0)
  );
  const employeeProductivity = percentage(
    Number(employeeSummary.billable_duration || 0),
    Number(employeeSummary.total_duration || 0)
  );
  const toolMix = {
    productive: Number(selectedUserTools.productive?.reduce((sum: number, item: any) => sum + Number(item.total_duration || 0), 0) || 0),
    unproductive: Number(selectedUserTools.unproductive?.reduce((sum: number, item: any) => sum + Number(item.total_duration || 0), 0) || 0),
    neutral: Number(selectedUserTools.neutral?.reduce((sum: number, item: any) => sum + Number(item.total_duration || 0), 0) || 0),
  };
  const websiteUsageByEmployee = organizationWebsiteActivity.reduce((rows: any[], item: any) => {
    const website = normalizeToolLabel(item.name || '', item.type || 'url');
    const employeeName = item.user?.name || 'Unknown';
    const classification = classifyProductivity(website, item.type || 'url');
    const existing = rows.find((row) => row.employeeName === employeeName && row.website === website && row.classification === classification);

    if (existing) {
      existing.duration += Number(item.duration || 0);
      existing.events += 1;
      existing.lastUsedAt =
        item.recorded_at && (!existing.lastUsedAt || +new Date(item.recorded_at) > +new Date(existing.lastUsedAt))
          ? item.recorded_at
          : existing.lastUsedAt;
      return rows;
    }

    rows.push({
      employeeName,
      website,
      classification,
      duration: Number(item.duration || 0),
      events: 1,
      lastUsedAt: item.recorded_at || null,
    });

    return rows;
  }, []).sort((a: any, b: any) => Number(b.duration || 0) - Number(a.duration || 0));

  const pageTitle =
    filters.scope === 'organization'
      ? {
          eyebrow: 'Admin dashboard',
          title: 'Organization command center',
          description: 'A cleaner executive view of attendance, tracked work, productivity, approvals, and payroll readiness.',
        }
      : {
          eyebrow: 'Admin dashboard',
          title: selectedEmployee ? `${selectedEmployee.name} overview` : 'Employee analytics view',
          description: 'A focused employee view that prioritizes status, attendance, productivity, activity, and only then operational detail.',
        };

  return (
    <div className="space-y-8 pb-6">
      <DashboardHeader eyebrow={pageTitle.eyebrow} title={pageTitle.title} description={pageTitle.description}>
        <DashboardFilterBar
          scope={filters.scope}
          onScopeChange={handleScopeChange}
          selectedEmployeeId={filters.selectedEmployeeId}
          onEmployeeChange={(value) => {
            setExportFeedback(null);
            setFilters((current) => ({ ...current, selectedEmployeeId: value }));
          }}
          employees={employees}
          datePreset={filters.datePreset}
          onDatePresetChange={handleDatePresetChange}
          startDate={filters.startDate}
          endDate={filters.endDate}
          onStartDateChange={(value) => setFilters((current) => ({ ...current, startDate: value, datePreset: 'custom' }))}
          onEndDateChange={(value) => setFilters((current) => ({ ...current, endDate: value, datePreset: 'custom' }))}
          onRefresh={() => void activeQuery.refetch()}
          onExport={handleExport}
          isRefreshing={activeQuery.isFetching}
          isExporting={isExporting}
        />
      </DashboardHeader>

      {exportFeedback ? <FeedbackBanner tone={exportFeedback.tone} message={exportFeedback.message} /> : null}

      {filters.scope === 'organization' ? (
        <>
          <section className="space-y-4">
            <SectionHeader
              eyebrow="Key metrics"
              title="Operational summary"
              description="The most important signals are surfaced first; lower-priority counters stay compressed below."
            />
            <DashboardKPIGrid
              items={[
                {
                  id: 'present',
                  label: 'Present today',
                  value: presentEmployees,
                  caption: `${employees.length} employees in scope`,
                  meta: `${absentEmployees} absent`,
                  icon: CalendarClock,
                  accent: 'emerald',
                },
                {
                  id: 'active-now',
                  label: 'Total active employees',
                  value: liveMonitoring.employees_active?.length || 0,
                  caption: `${liveMonitoring.employees_inactive?.length || 0} inactive right now`,
                  meta: `${liveMonitoring.employees_on_leave?.length || 0} on leave`,
                  icon: Activity,
                  accent: 'sky',
                },
                {
                  id: 'tracked-hours',
                  label: 'Total hours tracked',
                  value: formatDuration(overallSummary.total_duration || 0),
                  caption: `${formatDuration(overallSummary.billable_duration || 0)} billable`,
                  meta: `${formatDuration(overallSummary.idle_duration || 0)} idle`,
                  icon: Clock3,
                  accent: 'violet',
                },
                {
                  id: 'avg-productivity',
                  label: 'Average productivity',
                  value: `${Number(organizationSummary.productive_share || 0).toFixed(1)}%`,
                  caption: 'Organization-wide productive share',
                  meta: `${overallSummary.active_users || 0} active users tracked`,
                  icon: TrendingUp,
                  accent: 'amber',
                },
              ]}
              secondaryItems={[
                { id: 'late', label: 'Late check-ins', value: lateEmployees },
                { id: 'approvals', label: 'Pending approvals', value: totalPendingApprovals },
                { id: 'teams', label: 'Departments / groups', value: groups.length },
                { id: 'payroll-ready', label: 'Payroll processed', value: `${payrollPaidCount}/${payrollRecords.length}` },
              ]}
            />
          </section>

          <section className="space-y-4">
            <SectionHeader
              eyebrow="Trends"
              title="Hours, productivity, and attendance"
              description="Charts get more breathing room so the organization can be understood in a few seconds."
            />
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <DashboardTrendCard
                title="Weekly hours trend"
                description="Tracked duration by day for the selected range."
                points={overallByDay.map((item: any) => ({
                  id: item.date,
                  label: item.date,
                  value: Number(item.total_duration || 0),
                  formattedValue: formatDuration(item.total_duration || 0),
                  hint: `${formatDuration(item.billable_duration || 0)} billable`,
                }))}
                colorClassName="bg-sky-500"
              />
              <DashboardTrendCard
                title="Productivity trend"
                description="Billable output against idle time using the current reporting dataset."
                points={overallByDay.map((item: any) => ({
                  id: `productivity-${item.date}`,
                  label: item.date,
                  value: Number(item.billable_duration || 0),
                  formattedValue: `${percentage(Number(item.billable_duration || 0), Number(item.total_duration || 0))}%`,
                  hint: `${formatDuration(item.idle_duration || 0)} idle`,
                }))}
                colorClassName="bg-emerald-500"
              />
            </div>
            <SurfaceCard className="p-5 sm:p-6">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Attendance trend</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{presentEmployees}</p>
                  <p className="mt-1 text-sm text-slate-500">Employees with attendance in the selected period.</p>
                </div>
                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Attention required</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{attentionEmployees.length}</p>
                  <p className="mt-1 text-sm text-slate-500">Employees currently leading idle-share risk.</p>
                </div>
                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Completed tasks</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{completedTasks.length}</p>
                  <p className="mt-1 text-sm text-slate-500">Finished tasks returned by the current task API.</p>
                </div>
              </div>
            </SurfaceCard>
          </section>

          <section className="space-y-4">
            <SectionHeader
              eyebrow="Insights"
              title="Top performers, risks, teams, and alerts"
              description="Only the most useful insight groups stay visible here; detailed records move lower into tabs."
            />
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-4">
              <DashboardInsightList
                title="Top performers"
                description="Highest billable output in the selected range."
                items={topPerformers.map((row: any) => ({
                  id: String(row.user?.id || row.user?.email),
                  title: row.user?.name || 'Unknown',
                  subtitle: `${formatDuration(row.total_duration || 0)} total tracked`,
                  value: formatDuration(row.billable_duration || 0),
                  tone: 'good',
                }))}
                emptyDescription="No performer data is available for the current selection."
              />
              <DashboardInsightList
                title="Employees needing attention"
                description="Highest idle share in the selected range."
                items={attentionEmployees.map((row: any) => ({
                  id: String(row.user?.id || row.user?.email),
                  title: row.user?.name || 'Unknown',
                  subtitle: `${formatDuration(row.idle_duration || 0)} idle time`,
                  value: `${Number(row.idle_percentage || 0).toFixed(1)}% idle`,
                  tone: Number(row.idle_percentage || 0) > 25 ? 'critical' : 'warning',
                }))}
                emptyDescription="No attention list is available for the current selection."
              />
              <DashboardInsightList
                title="Department summary"
                description="Most efficient groups from the current reporting backend."
                items={teamRankings.slice(0, 4).map((row: any) => ({
                  id: String(row.group?.id || row.group_name || row.name),
                  title: row.group?.name || row.group_name || row.name || 'Unknown group',
                  subtitle: `${row.members_count || 0} members`,
                  value: `${Number(row.efficiency || row.productive_share || 0).toFixed(1)}%`,
                  tone: 'default',
                }))}
                emptyDescription="No department-level summary was returned."
              />
              <DashboardInsightList
                title="Operational alerts"
                description="Approvals and notifications that need an admin eye."
                items={[
                  {
                    id: 'pending-leave',
                    title: 'Pending leave requests',
                    subtitle: 'Awaiting approval workflow action',
                    value: String(pendingLeaves.length),
                    tone: pendingLeaves.length > 0 ? 'warning' : 'default',
                  },
                  {
                    id: 'pending-time-edits',
                    title: 'Pending time edits',
                    subtitle: 'Attendance corrections requiring review',
                    value: String(pendingTimeEdits.length),
                    tone: pendingTimeEdits.length > 0 ? 'warning' : 'default',
                  },
                  {
                    id: 'notifications',
                    title: notifications[0]?.title || 'No new notifications',
                    subtitle: notifications[0]?.message || 'Admin notifications are clear.',
                    value: String(notifications.length),
                    tone: notifications.length > 0 ? 'default' : 'good',
                  },
                ]}
              />
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader
              eyebrow="Detailed records"
              title="Attendance, approvals, payroll, and updates"
              description="Lower-priority operational detail is grouped into tabs so the page stays shorter and easier to scan."
            />
            <DashboardDetailTabs
              title="Operations detail"
              description="View deeper records only when needed."
              tabs={[
                {
                  id: 'attendance',
                  label: 'Attendance',
                  content: (
                    <DataTable
                      title="Attendance breakdown"
                      description="Attendance summary rows for the selected range."
                      rows={attendanceRows}
                      emptyMessage="No attendance rows found for the selected range."
                      columns={[
                        {
                          key: 'employee',
                          header: 'Employee',
                          render: (row: any) => (
                            <div>
                              <p className="font-medium text-slate-950">{row.user?.name || 'Unknown'}</p>
                              <p className="text-xs text-slate-500">{row.user?.email || 'No email'}</p>
                            </div>
                          ),
                        },
                        { key: 'present', header: 'Present', render: (row: any) => `${row.present_days || row.days_present || 0} day(s)` },
                        { key: 'late', header: 'Late', render: (row: any) => `${row.late_days || 0} day(s)` },
                        { key: 'worked', header: 'Worked', render: (row: any) => formatDuration(row.total_worked_seconds || row.worked_seconds || 0) },
                        { key: 'status', header: 'Working now', render: (row: any) => (row.is_checked_in || row.is_working ? 'Checked in' : 'Offline') },
                      ]}
                    />
                  ),
                },
                {
                  id: 'approvals',
                  label: 'Approvals',
                  content: (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <CompactList
                        title="Leave approvals"
                        description="Pending leave requests from the existing leave backend."
                        rows={pendingLeaves.slice(0, 5).map((item: any) => ({
                          id: String(item.id),
                          title: item.user?.name || 'Unknown employee',
                          subtitle: `${item.start_date} to ${item.end_date}`,
                          value: item.status || 'pending',
                        }))}
                        emptyTitle="No leave approvals pending"
                        emptyDescription="Leave requests that need action will appear here."
                      />
                      <CompactList
                        title="Time edit approvals"
                        description="Pending attendance corrections."
                        rows={pendingTimeEdits.slice(0, 5).map((item: any) => ({
                          id: String(item.id),
                          title: item.user?.name || 'Unknown employee',
                          subtitle: item.message || `Attendance date ${item.attendance_date}`,
                          value: item.status || 'pending',
                        }))}
                        emptyTitle="No time edits pending"
                        emptyDescription="Attendance corrections that need action will appear here."
                      />
                    </div>
                  ),
                },
                {
                  id: 'payroll',
                  label: 'Payroll',
                  content: payrollRecords.length === 0 ? (
                    <EmptyStateCard
                      title="No payroll snapshot available"
                      description="The current payroll query did not return records for the selected period."
                      icon={CircleDollarSign}
                    />
                  ) : (
                    <div className="space-y-4">
                      <StatStrip
                        items={[
                          { id: 'net-payroll', label: 'Net payroll total', value: formatCurrency(payrollTotal), tone: 'good' },
                          { id: 'paid-count', label: 'Paid records', value: `${payrollPaidCount}/${payrollRecords.length}` },
                          { id: 'completed-tasks', label: 'Completed tasks', value: completedTasks.length },
                          { id: 'groups', label: 'Groups loaded', value: groups.length },
                        ]}
                      />
                      <DataTable
                        title="Payroll records"
                        description="Current month payroll records from the existing payroll backend."
                        rows={payrollRecords.slice(0, 8)}
                        emptyMessage="No payroll records found."
                        columns={[
                          { key: 'employee', header: 'Employee', render: (row: any) => row.user?.name || row.employee_name || 'Unknown' },
                          { key: 'month', header: 'Payroll month', render: (row: any) => row.payroll_month || row.period_month || 'N/A' },
                          { key: 'net', header: 'Net salary', render: (row: any) => formatCurrency(row.net_salary || 0, row.currency || 'INR') },
                          { key: 'status', header: 'Status', render: (row: any) => row.payroll_status || row.payment_status || 'pending' },
                        ]}
                      />
                    </div>
                  ),
                },
                {
                  id: 'notifications',
                  label: 'Updates',
                  content: (
                    <CompactList
                      title="Admin notifications"
                      description="Latest admin-facing notifications available to the signed-in user."
                      rows={notifications.map((item: any) => ({
                        id: String(item.id),
                        title: item.title,
                        subtitle: item.message,
                        value: formatShortDate(item.created_at),
                      }))}
                      emptyTitle="No admin notifications"
                      emptyDescription="This admin account has no recent notifications."
                    />
                  ),
                },
                {
                  id: 'monitoring',
                  label: 'Monitoring',
                  content: (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <CompactList
                          title="Live employee activity"
                          description="Current tool and productivity state from live monitoring."
                          rows={(liveMonitoring.all_users || []).slice(0, 6).map((row: any) => ({
                            id: String(row.user?.id || row.user?.email),
                            title: row.user?.name || 'Unknown employee',
                            subtitle: `${row.current_tool || 'No active tool'} • ${row.work_status || 'inactive'}`,
                            value: row.classification || 'neutral',
                          }))}
                          emptyTitle="No live monitoring data"
                          emptyDescription="No employee live activity rows were returned."
                        />
                        <SurfaceCard className="p-5">
                          <h3 className="text-lg font-semibold tracking-[-0.04em] text-slate-950">Website usage by employee</h3>
                          <p className="mt-1 text-sm text-slate-500">When all employees are selected, this shows which websites were used and whether they were productive.</p>
                          <div className="mt-4">
                            <DataTable
                              title="Organization website monitoring"
                              description="Per-employee website usage with productivity labels."
                              rows={websiteUsageByEmployee.slice(0, 10)}
                              emptyMessage="No website activity was returned for the selected range."
                              columns={[
                                { key: 'employee', header: 'Employee', render: (row: any) => row.employeeName },
                                { key: 'website', header: 'Website', render: (row: any) => row.website },
                                {
                                  key: 'classification',
                                  header: 'Productivity',
                                  render: (row: any) => (
                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${productivityTone(row.classification)}`}>
                                      {row.classification}
                                    </span>
                                  ),
                                },
                                { key: 'duration', header: 'Duration', render: (row: any) => formatDuration(row.duration || 0) },
                              ]}
                            />
                          </div>
                        </SurfaceCard>
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </section>
        </>
      ) : (
        <>
          <section className="space-y-4">
            <SectionHeader
              eyebrow="Employee overview"
              title="Status first, details second"
              description="The employee view prioritizes personal status and productivity before attendance, leave, payroll, or monitoring detail."
            />
            <SurfaceCard className="overflow-hidden border-0 bg-[linear-gradient(135deg,#0f172a_0%,#12314a_42%,#155e75_100%)] p-6 text-white shadow-[0_38px_100px_-48px_rgba(2,6,23,0.92)]">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-white/10 text-xl font-semibold">
                      {selectedEmployee?.name?.charAt(0).toUpperCase() || 'E'}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/70">Selected employee</p>
                      <h3 className="text-2xl font-semibold tracking-[-0.04em] text-white">{selectedEmployee?.name || 'Employee overview'}</h3>
                      <p className="text-sm text-cyan-50/80">{selectedEmployee?.email || 'No email available'}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                      <p className="text-xs text-cyan-100/70">Today status</p>
                      <p className="mt-2 text-lg font-semibold">
                        {employeeStatus.is_working ? 'Working' : latestAttendance?.status || 'Offline'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                      <p className="text-xs text-cyan-100/70">Current project</p>
                      <p className="mt-2 text-lg font-semibold">{employeeStatus.current_project || 'No active project'}</p>
                    </div>
                    <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                      <p className="text-xs text-cyan-100/70">Latest attendance</p>
                      <p className="mt-2 text-lg font-semibold">{formatShortDate(latestAttendance?.attendance_date)}</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                    <p className="text-xs text-cyan-100/70">Worked hours</p>
                    <p className="mt-2 text-2xl font-semibold">{formatDuration(employeeSummary.total_duration || 0)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                    <p className="text-xs text-cyan-100/70">Productivity</p>
                    <p className="mt-2 text-2xl font-semibold">{employeeProductivity}%</p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                    <p className="text-xs text-cyan-100/70">Attendance</p>
                    <p className="mt-2 text-2xl font-semibold">{monthlyAttendancePercentage}%</p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                    <p className="text-xs text-cyan-100/70">Idle time</p>
                    <p className="mt-2 text-2xl font-semibold">{formatDuration(employeeStats.idle_total_duration || 0)}</p>
                  </div>
                </div>
              </div>
            </SurfaceCard>
            <DashboardKPIGrid
              items={[
                {
                  id: 'today-status',
                  label: 'Today status',
                  value: employeeStatus.is_working ? 'Working' : latestAttendance?.status || 'Offline',
                  caption: employeeStatus.current_project || 'No active project',
                  meta: `Timer started ${formatDateTime(employeeStatus.current_timer_started_at)}`,
                  icon: Fingerprint,
                  accent: 'sky',
                },
                {
                  id: 'worked-hours',
                  label: 'Worked hours',
                  value: formatDuration(employeeSummary.total_duration || 0),
                  caption: `${employeeSummary.entries_count || 0} tracked sessions`,
                  meta: `Check in ${latestAttendance?.check_in_at ? new Date(latestAttendance.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}`,
                  icon: Clock3,
                  accent: 'emerald',
                },
                {
                  id: 'active-vs-idle',
                  label: 'Active vs idle',
                  value: `${formatDuration(employeeSummary.billable_duration || 0)} / ${formatDuration(employeeStats.idle_total_duration || 0)}`,
                  caption: 'Billable compared with idle time',
                  meta: `${employeeStats.activity_events || 0} activity events`,
                  icon: Sparkles,
                  accent: 'violet',
                },
                {
                  id: 'productivity',
                  label: 'Productivity score',
                  value: `${employeeProductivity}%`,
                  caption: 'Billable share in the selected range',
                  meta: `${monthlyAttendancePercentage}% monthly attendance`,
                  icon: TrendingUp,
                  accent: 'amber',
                },
              ]}
              secondaryItems={[
                { id: 'present-days', label: 'Present days', value: calendarSummary.present_days || 0 },
                { id: 'late-days', label: 'Late days', value: calendarSummary.late_days || 0 },
                { id: 'approved-leaves', label: 'Approved leaves', value: profile?.leave_requests?.filter((row: any) => row.status === 'approved').length || 0 },
                { id: 'screenshots', label: 'Screenshots', value: employeeScreenshots.length },
              ]}
            />
          </section>

          <section className="space-y-4">
            <SectionHeader
              eyebrow="Trends"
              title="Attendance and productivity patterns"
              description="The employee mode keeps trends focused on personal progress instead of repeating company-wide cards."
            />
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <DashboardTrendCard
                title="Weekly hours trend"
                description="Daily worked duration for the selected employee."
                points={employeeTrend.map((item: any) => ({
                  id: item.date,
                  label: item.date,
                  value: Number(item.total_duration || 0),
                  formattedValue: formatDuration(item.total_duration || 0),
                  hint: `${formatDuration(item.billable_duration || 0)} billable`,
                }))}
                colorClassName="bg-sky-500"
              />
              <DashboardTrendCard
                title="Attendance trend"
                description="Current month attendance snapshot from the attendance calendar endpoint."
                points={[
                  {
                    id: 'present-days',
                    label: 'Present days',
                    value: Number(calendarSummary.present_days || 0),
                    formattedValue: String(calendarSummary.present_days || 0),
                  },
                  {
                    id: 'absent-days',
                    label: 'Absent days',
                    value: Number(calendarSummary.absent_days || 0),
                    formattedValue: String(calendarSummary.absent_days || 0),
                  },
                  {
                    id: 'late-days',
                    label: 'Late days',
                    value: Number(calendarSummary.late_days || 0),
                    formattedValue: String(calendarSummary.late_days || 0),
                  },
                ]}
                colorClassName="bg-violet-500"
                footer="This uses the month containing the selected end date because the current backend exposes attendance calendar data month by month."
              />
            </div>
            <SurfaceCard className="p-5 sm:p-6">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Productive usage</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{formatDuration(toolMix.productive)}</p>
                  <p className="mt-1 text-sm text-slate-500">Time spent in productive monitored tools.</p>
                </div>
                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Unproductive usage</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{formatDuration(toolMix.unproductive)}</p>
                  <p className="mt-1 text-sm text-slate-500">Time spent in unproductive monitored tools.</p>
                </div>
                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Neutral usage</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{formatDuration(toolMix.neutral)}</p>
                  <p className="mt-1 text-sm text-slate-500">Remaining time that is not categorized either way.</p>
                </div>
              </div>
            </SurfaceCard>
          </section>

          <section className="space-y-4">
            <SectionHeader
              eyebrow="Insights"
              title="Attendance, performance, activity, and monitoring"
              description="Only the most useful personal insight groups remain at this level."
            />
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-4">
              <DashboardInsightList
                title="Attendance"
                description="Current employee attendance context."
                items={[
                  {
                    id: 'attendance-status',
                    title: latestAttendance?.status || 'No current attendance status',
                    subtitle: `Check in ${latestAttendance?.check_in_at ? new Date(latestAttendance.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'} / Check out ${latestAttendance?.check_out_at ? new Date(latestAttendance.check_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}`,
                    value: `${monthlyAttendancePercentage}%`,
                    tone: monthlyAttendancePercentage >= 85 ? 'good' : 'warning',
                  },
                  {
                    id: 'late-days',
                    title: 'Late days this month',
                    subtitle: 'Based on the attendance calendar summary',
                    value: String(calendarSummary.late_days || 0),
                    tone: Number(calendarSummary.late_days || 0) > 0 ? 'warning' : 'good',
                  },
                ]}
              />
              <DashboardInsightList
                title="Performance"
                description="Work output and latest context."
                items={[
                  {
                    id: 'current-project',
                    title: employeeStatus.current_project || 'No active project',
                    subtitle: `Timer started: ${formatDateTime(employeeStatus.current_timer_started_at)}`,
                    value: employeeStatus.is_working ? 'Active' : 'Inactive',
                    tone: employeeStatus.is_working ? 'good' : 'default',
                  },
                  {
                    id: 'entries',
                    title: `${employeeSummary.entries_count || 0} tracked sessions`,
                    subtitle: `${formatDuration(employeeSummary.total_duration || 0)} total worked`,
                    value: `${employeeProductivity}%`,
                    tone: employeeProductivity >= 70 ? 'good' : 'warning',
                  },
                ]}
              />
              <DashboardInsightList
                title="Activity"
                description="Top productive and unproductive tools."
                items={[
                  ...(selectedUserTools.productive || []).slice(0, 2).map((item: any) => ({
                    id: `productive-${item.label}`,
                    title: item.label,
                    subtitle: `Productive ${item.type}`,
                    value: formatDuration(item.total_duration || 0),
                    tone: 'good' as const,
                  })),
                  ...(selectedUserTools.unproductive || []).slice(0, 2).map((item: any) => ({
                    id: `unproductive-${item.label}`,
                    title: item.label,
                    subtitle: `Unproductive ${item.type}`,
                    value: formatDuration(item.total_duration || 0),
                    tone: 'warning' as const,
                  })),
                ]}
                emptyDescription="No tool-level monitoring data exists for the current selection."
              />
              <DashboardInsightList
                title="Leave and payroll"
                description="Recent approved and pending employee operations."
                items={[
                  ...(profile?.leave_requests || []).slice(0, 2).map((item: any) => ({
                    id: `leave-${item.id}`,
                    title: `${item.start_date} to ${item.end_date}`,
                    subtitle: item.reason || 'No leave reason provided',
                    value: item.status,
                    tone: item.status === 'approved' ? ('good' as const) : item.status === 'pending' ? ('warning' as const) : ('critical' as const),
                  })),
                  ...(profile?.time_edit_requests || []).slice(0, 2).map((item: any) => ({
                    id: `time-edit-${item.id}`,
                    title: `Time edit for ${item.attendance_date}`,
                    subtitle: item.message || 'No message provided',
                    value: item.status,
                    tone: item.status === 'approved' ? ('good' as const) : item.status === 'pending' ? ('warning' as const) : ('critical' as const),
                  })),
                ]}
                emptyDescription="No leave or time edit requests were found for this employee."
              />
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader
              eyebrow="Detailed records"
              title="Activity, leave, payroll, and monitoring"
              description="Personal records are grouped under meaningful tabs so the employee page does not reveal everything at once."
            />
            <DashboardDetailTabs
              title="Employee detail"
              description="Open the section you need without carrying the full detail load on screen."
              tabs={[
                {
                  id: 'activity',
                  label: 'Activity',
                  content: (
                    <DataTable
                      title="Recent activity timeline"
                      description="Latest tracked sessions for the selected employee."
                      rows={employeeEntries.slice(0, 8)}
                      emptyMessage="No recent time entries were found."
                      columns={[
                        {
                          key: 'project',
                          header: 'Project',
                          render: (row: any) => (
                            <div>
                              <p className="font-medium text-slate-950">{row.project?.name || 'General work'}</p>
                              <p className="text-xs text-slate-500">{row.description || 'No description provided'}</p>
                            </div>
                          ),
                        },
                        { key: 'start', header: 'Start', render: (row: any) => formatDateTime(row.start_time) },
                        { key: 'duration', header: 'Worked', render: (row: any) => formatDuration(row.duration || 0) },
                        { key: 'billable', header: 'Billable', render: (row: any) => (row.billable ? 'Yes' : 'No') },
                      ]}
                    />
                  ),
                },
                {
                  id: 'leave-payroll',
                  label: 'Leave & Payroll',
                  content: (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <CompactList
                        title="Leave and approval history"
                        description="Latest leave and time edit actions returned by profile 360."
                        rows={[
                          ...(profile?.leave_requests || []).slice(0, 4).map((item: any) => ({
                            id: `leave-${item.id}`,
                            title: `${item.start_date} to ${item.end_date}`,
                            subtitle: item.reason || 'No leave reason provided',
                            value: item.status,
                          })),
                          ...(profile?.time_edit_requests || []).slice(0, 3).map((item: any) => ({
                            id: `time-edit-${item.id}`,
                            title: `Time edit for ${item.attendance_date}`,
                            subtitle: item.message || 'No message provided',
                            value: item.status,
                          })),
                        ]}
                        emptyTitle="No leave or time edits"
                        emptyDescription="The current employee profile response does not include leave or time edit items."
                      />
                      {(profile?.payslips || []).length === 0 ? (
                        <EmptyStateCard
                          title="No payslip data"
                          description="No payslips were returned for this employee in the current backend response."
                          icon={CircleDollarSign}
                        />
                      ) : (
                        <CompactList
                          title="Payroll snapshot"
                          description="Latest payslips returned by the employee profile response."
                          rows={(profile?.payslips || []).slice(0, 4).map((item: any) => ({
                            id: String(item.id),
                            title: item.period_month,
                            subtitle: item.payment_status || 'pending payment status',
                            value: formatCurrency(item.net_salary || 0, item.currency || 'INR'),
                          }))}
                          emptyTitle="No payslips found"
                          emptyDescription="No payroll records are available for this employee."
                        />
                      )}
                    </div>
                  ),
                },
                {
                  id: 'monitoring',
                  label: 'Monitoring',
                  content: (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <CompactList
                          title="Monitoring pulse"
                          description="Signals from the employee monitoring analytics endpoint."
                          rows={[
                            {
                              id: 'event-count',
                              title: 'Recorded activity events',
                              subtitle: 'App, website, and idle event count in the selected range',
                              value: String(employeeStats.activity_events || 0),
                            },
                            {
                              id: 'idle-duration',
                              title: 'Idle duration',
                              subtitle: 'Measured idle time from monitoring analytics',
                              value: formatDuration(employeeStats.idle_total_duration || 0),
                            },
                            {
                              id: 'screenshots-count',
                              title: 'Screenshot captures',
                              subtitle: 'Loaded from the screenshots endpoint',
                              value: String(employeeScreenshots.length),
                            },
                          ]}
                          emptyTitle="No monitoring data"
                          emptyDescription="The current monitoring response did not return summary signals."
                        />
                        <SurfaceCard className="p-5">
                          <h3 className="text-lg font-semibold tracking-[-0.04em] text-slate-950">Live activity status</h3>
                          <p className="mt-1 text-sm text-slate-500">What this employee is doing right now and whether it is productive.</p>
                          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current tool</p>
                              <p className="mt-2 font-semibold text-slate-950">{employeeLiveMonitoring?.current_tool || 'No active tool detected'}</p>
                              <p className="mt-1 text-sm capitalize text-slate-500">{employeeLiveMonitoring?.tool_type || employeeLiveMonitoring?.activity_type || 'No tool type'}</p>
                            </div>
                            <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Work status</p>
                              <p className="mt-2 font-semibold capitalize text-slate-950">{employeeLiveMonitoring?.work_status?.replace('_', ' ') || 'inactive'}</p>
                              <p className="mt-1 text-sm text-slate-500">{employeeLiveMonitoring?.is_working ? 'Timer active now' : 'No active timer right now'}</p>
                            </div>
                            <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Productivity</p>
                              <div className="mt-2">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${productivityTone(employeeLiveMonitoring?.classification)}`}>
                                  {employeeLiveMonitoring?.classification || 'neutral'}
                                </span>
                              </div>
                              <p className="mt-2 text-sm text-slate-500">{formatDateTime(employeeLiveMonitoring?.last_activity_at)}</p>
                            </div>
                          </div>
                        </SurfaceCard>
                      </div>
                      {employeeScreenshots.length === 0 ? (
                        <EmptyStateCard
                          title="No screenshots found"
                          description="The screenshot endpoint did not return captures for this employee."
                          icon={Camera}
                        />
                      ) : (
                        <SurfaceCard className="p-5">
                          <h3 className="text-lg font-semibold tracking-[-0.04em] text-slate-950">Employee screenshots</h3>
                          <p className="mt-1 text-sm text-slate-500">Recent captures for the selected employee with image previews.</p>
                          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                            {employeeScreenshots.slice(0, 8).map((shot: any) => (
                              <a
                                key={shot.id}
                                href={shot.path}
                                target="_blank"
                                rel="noreferrer"
                                className="overflow-hidden rounded-[22px] border border-slate-200 bg-white transition hover:border-sky-200"
                              >
                                <img src={shot.path} alt={shot.filename || `Screenshot ${shot.id}`} className="h-40 w-full object-cover" />
                                <div className="space-y-1 p-4">
                                  <p className="font-medium text-slate-950">{formatDateTime(shot.recorded_at)}</p>
                                  <p className="text-xs text-slate-500">{shot.filename || 'Captured screenshot'}</p>
                                </div>
                              </a>
                            ))}
                          </div>
                        </SurfaceCard>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </section>
        </>
      )}

      {activeQuery.isFetching ? (
        <div className="rounded-[22px] border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-700">
          Dashboard data is refreshing for the current filter selection.
        </div>
      ) : null}
    </div>
  );
}
