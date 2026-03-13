import { useEffect, useMemo, useState } from 'react';
import { activityApi, attendanceApi, attendanceTimeEditApi, leaveApi, organizationApi, reportApi, reportGroupApi, screenshotApi, userApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasAdminAccess } from '@/lib/permissions';
import PageHeader from '@/components/dashboard/PageHeader';
import SurfaceCard from '@/components/dashboard/SurfaceCard';
import FilterPanel from '@/components/dashboard/FilterPanel';
import MetricCard from '@/components/dashboard/MetricCard';
import Button from '@/components/ui/Button';
import { FeedbackBanner, PageEmptyState, PageLoadingState } from '@/components/ui/PageState';
import { FieldLabel, TextInput, TextareaInput } from '@/components/ui/FormField';
import StatusBadge from '@/components/ui/StatusBadge';
import { Briefcase, CalendarDays, Clock, FolderKanban, Layers3, Users } from 'lucide-react';
import type { UserProfile360 } from '@/types';

const formatDuration = (seconds: number) => {
  const safe = Number.isFinite(Number(seconds)) ? Number(seconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours}h ${minutes}m`;
};
const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString() : 'Not available');
const normalizeToolLabel = (name: string, activityType: string) => {
  const trimmed = String(name || '').trim();
  const normalizedType = String(activityType || '').toLowerCase();

  if (!trimmed) return normalizedType === 'url' ? 'unknown-site' : 'unknown-app';

  if (normalizedType === 'url') {
    try {
      const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
      return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      const match = trimmed.match(/([a-z0-9-]+\.)+[a-z]{2,}/i);
      if (match?.[0]) return match[0].replace(/^www\./, '').toLowerCase();
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
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : classification === 'unproductive'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-slate-200 bg-slate-100 text-slate-600';

const pad2 = (n: number) => String(n).padStart(2, '0');
const formatMonth = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const formatLocalDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseTimeToMinutes = (time: string) => {
  // expected "HH:mm:ss" (from backend env ATTENDANCE_LATE_AFTER)
  const [hh, mm] = time.split(':').map((v) => Number(v));
  const h = Number.isFinite(hh) ? hh : 0;
  const m = Number.isFinite(mm) ? mm : 0;
  return h * 60 + m;
};

const getDateOnly = (iso?: string | null) => (iso ? iso.split('T')[0] : null);

const buildMonthGrid = (month: string) => {
  // month: YYYY-MM
  const [y, m] = month.split('-').map((v) => Number(v));
  const first = new Date(y, (m || 1) - 1, 1);
  const start = new Date(first);
  // Monday-based grid
  const day = start.getDay(); // 0 Sun ... 6 Sat
  const diffToMonday = (day + 6) % 7;
  start.setDate(start.getDate() - diffToMonday);

  const weeks: Date[][] = [];
  const cursor = new Date(start);

  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return { first, weeks };
};

type AttendanceProps = {
  mode?: 'full' | 'time-edit';
};

export default function Attendance({ mode = 'full' }: AttendanceProps) {
  const { user, organization } = useAuth();
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState(formatLocalDate(new Date(new Date().setDate(1))));
  const [endDate, setEndDate] = useState(formatLocalDate(new Date()));
  const [rows, setRows] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [workingDays, setWorkingDays] = useState(0);
  const [weekendDays, setWeekendDays] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [todayRecord, setTodayRecord] = useState<null | {
    id: number;
    attendance_date: string;
    check_in_at?: string | null;
    check_out_at?: string | null;
    worked_seconds: number;
    manual_adjustment_seconds: number;
    late_minutes: number;
    status: string;
    is_checked_in: boolean;
    total_break_seconds: number;
    shift_target_seconds: number;
    remaining_shift_seconds: number;
    completed_shift: boolean;
    punches: Array<{
      id: number;
      punch_in_at: string;
      punch_out_at?: string | null;
      worked_seconds: number;
    }>;
  }>(null);
  const [hasApprovedLeaveToday, setHasApprovedLeaveToday] = useState(false);
  const [lateAfter, setLateAfter] = useState('09:30:00');
  const [isPunchLoading, setIsPunchLoading] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState(formatMonth(new Date()));
  const [calendarDays, setCalendarDays] = useState<any[]>([]);
  const [calendarSummary, setCalendarSummary] = useState<any | null>(null);
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [isLeaveLoading, setIsLeaveLoading] = useState(false);
  const [isLeaveSubmitting, setIsLeaveSubmitting] = useState(false);
  const [leaveStartDate, setLeaveStartDate] = useState(formatLocalDate(new Date()));
  const [leaveEndDate, setLeaveEndDate] = useState(formatLocalDate(new Date()));
  const [leaveReason, setLeaveReason] = useState('');
  const [timeEditRequests, setTimeEditRequests] = useState<any[]>([]);
  const [isTimeEditLoading, setIsTimeEditLoading] = useState(false);
  const [isTimeEditSubmitting, setIsTimeEditSubmitting] = useState(false);
  const [timeEditDate, setTimeEditDate] = useState(formatLocalDate(new Date()));
  const [extraMinutes, setExtraMinutes] = useState(60);
  const [timeEditMessage, setTimeEditMessage] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [employeeProfile, setEmployeeProfile] = useState<UserProfile360 | null>(null);
  const [employeeMonitoring, setEmployeeMonitoring] = useState<any | null>(null);
  const [employeeMonitoringScreenshots, setEmployeeMonitoringScreenshots] = useState<any[]>([]);
  const [employeeWebsiteUsage, setEmployeeWebsiteUsage] = useState<any[]>([]);
  const [employeeGroups, setEmployeeGroups] = useState<Array<{ id: number; name: string }>>([]);
  const [organizationMembersCount, setOrganizationMembersCount] = useState(0);
  const [isEmployeePanelLoading, setIsEmployeePanelLoading] = useState(false);

  const isAdmin = hasAdminAccess(user);
  const setFeedback = (nextMessage = '', nextError = '') => {
    setMessage(nextMessage);
    setError(nextError);
  };

  const fetchAttendance = async () => {
    setIsLoading(true);
    try {
      const response = await reportApi.attendance({
        start_date: startDate,
        end_date: endDate,
        q: isAdmin ? query || undefined : undefined,
      });
      const payload = response.data as any;
      const nextRows = payload?.data || [];
      setRows(nextRows);
      setWorkingDays(Number(payload?.working_days || 0));
      setWeekendDays(Number(payload?.weekend_days || 0));
      if (!selectedUserId && nextRows.length > 0) {
        setSelectedUserId(nextRows[0].user.id);
      }
    } catch (error) {
      console.error('Attendance fetch failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchToday = async () => {
    try {
      const res = await attendanceApi.today();
      setTodayRecord(res.data.record);
      setLateAfter(res.data.late_after || '09:30:00');
      setHasApprovedLeaveToday(Boolean((res.data as any).has_approved_leave_today));
    } catch (e) {
      console.error('Attendance today fetch failed:', e);
    }
  };

  const doCheckIn = async () => {
    setIsPunchLoading(true);
    setFeedback();
    try {
      const res = await attendanceApi.checkIn();
      const payload = res.data as any;
      if (payload?.record) setTodayRecord(payload.record);
      await Promise.all([fetchAttendance(), fetchCalendar(), fetchToday()]);
    } catch (e) {
      console.error('Check-in failed:', e);
      setFeedback('', (e as any)?.response?.data?.message || 'Check-in failed');
    } finally {
      setIsPunchLoading(false);
    }
  };

  const doCheckOut = async () => {
    setIsPunchLoading(true);
    setFeedback();
    try {
      const res = await attendanceApi.checkOut();
      const payload = res.data as any;
      if (payload?.record) setTodayRecord(payload.record);
      await Promise.all([fetchAttendance(), fetchCalendar(), fetchToday()]);
    } catch (e) {
      console.error('Check-out failed:', e);
      setFeedback('', (e as any)?.response?.data?.message || 'Check-out failed');
    } finally {
      setIsPunchLoading(false);
    }
  };

  const fetchCalendar = async () => {
    setIsCalendarLoading(true);
    try {
      const res = await attendanceApi.calendar({
        month: calendarMonth,
        user_id: isAdmin ? selectedUserId || undefined : undefined,
      });

      setCalendarDays(res.data.days || []);
      setCalendarSummary(res.data.summary || null);
    } catch (e) {
      console.error('Attendance calendar fetch failed:', e);
    } finally {
      setIsCalendarLoading(false);
    }
  };

  const fetchLeaveRequests = async () => {
    setIsLeaveLoading(true);
    try {
      const res = await leaveApi.list();
      setLeaveRequests((res.data as any).data || []);
    } catch (e) {
      console.error('Leave requests fetch failed:', e);
    } finally {
      setIsLeaveLoading(false);
    }
  };

  const submitLeaveRequest = async () => {
    if (!leaveStartDate || !leaveEndDate) {
      setFeedback('', 'Please select start and end date');
      return;
    }

    setIsLeaveSubmitting(true);
    setFeedback();
    try {
      await leaveApi.create({
        start_date: leaveStartDate,
        end_date: leaveEndDate,
        reason: leaveReason || undefined,
      });
      setLeaveReason('');
      await fetchLeaveRequests();
      setFeedback('Leave request submitted');
    } catch (e) {
      console.error('Leave request submit failed:', e);
      setFeedback('', (e as any)?.response?.data?.message || 'Failed to submit leave request');
    } finally {
      setIsLeaveSubmitting(false);
    }
  };

  const approveLeave = async (id: number) => {
    setFeedback();
    try {
      await leaveApi.approve(id);
      await Promise.all([fetchLeaveRequests(), fetchAttendance(), fetchCalendar(), fetchToday()]);
      setFeedback('Leave request approved');
    } catch (e) {
      console.error('Approve leave failed:', e);
      setFeedback('', (e as any)?.response?.data?.message || 'Failed to approve leave request');
    }
  };

  const rejectLeave = async (id: number) => {
    setFeedback();
    try {
      await leaveApi.reject(id);
      await fetchLeaveRequests();
      setFeedback('Leave request rejected');
    } catch (e) {
      console.error('Reject leave failed:', e);
      setFeedback('', (e as any)?.response?.data?.message || 'Failed to reject leave request');
    }
  };

  const requestLeaveRevoke = async (id: number) => {
    setFeedback();
    try {
      await leaveApi.requestRevoke(id);
      await fetchLeaveRequests();
      setFeedback('Leave revoke request submitted');
    } catch (e) {
      console.error('Leave revoke request failed:', e);
      setFeedback('', (e as any)?.response?.data?.message || 'Failed to request leave revoke');
    }
  };

  const approveLeaveRevoke = async (id: number) => {
    setFeedback();
    try {
      await leaveApi.approveRevoke(id);
      await Promise.all([fetchLeaveRequests(), fetchCalendar(), fetchAttendance(), fetchToday()]);
      setFeedback('Leave revoke approved');
    } catch (e) {
      console.error('Approve leave revoke failed:', e);
      setFeedback('', (e as any)?.response?.data?.message || 'Failed to approve leave revoke');
    }
  };

  const rejectLeaveRevoke = async (id: number) => {
    setFeedback();
    try {
      await leaveApi.rejectRevoke(id);
      await fetchLeaveRequests();
      setFeedback('Leave revoke rejected');
    } catch (e) {
      console.error('Reject leave revoke failed:', e);
      setFeedback('', (e as any)?.response?.data?.message || 'Failed to reject leave revoke');
    }
  };

  const fetchTimeEditRequests = async () => {
    setIsTimeEditLoading(true);
    try {
      const res = await attendanceTimeEditApi.list();
      setTimeEditRequests((res.data as any).data || []);
    } catch (e) {
      console.error('Time edit requests fetch failed:', e);
    } finally {
      setIsTimeEditLoading(false);
    }
  };

  const submitTimeEditRequest = async () => {
    if (!timeEditDate || !extraMinutes || extraMinutes <= 0) {
      setFeedback('', 'Please enter a valid date and extra minutes');
      return;
    }

    setIsTimeEditSubmitting(true);
    setFeedback();
    try {
      await attendanceTimeEditApi.create({
        attendance_date: timeEditDate,
        extra_minutes: extraMinutes,
        message: timeEditMessage || undefined,
      });
      setTimeEditMessage('');
      await fetchTimeEditRequests();
      setFeedback('Time edit request submitted');
    } catch (e) {
      console.error('Time edit request submit failed:', e);
      setFeedback('', (e as any)?.response?.data?.message || 'Failed to submit time edit request');
    } finally {
      setIsTimeEditSubmitting(false);
    }
  };

  const approveTimeEdit = async (id: number) => {
    setFeedback();
    try {
      await attendanceTimeEditApi.approve(id);
      await Promise.all([fetchTimeEditRequests(), fetchAttendance(), fetchCalendar(), fetchToday()]);
      setFeedback('Time edit request approved');
    } catch (e) {
      console.error('Approve time edit failed:', e);
      setFeedback('', (e as any)?.response?.data?.message || 'Failed to approve time edit request');
    }
  };

  const rejectTimeEdit = async (id: number) => {
    setFeedback();
    try {
      await attendanceTimeEditApi.reject(id);
      await fetchTimeEditRequests();
      setFeedback('Time edit request rejected');
    } catch (e) {
      console.error('Reject time edit failed:', e);
      setFeedback('', (e as any)?.response?.data?.message || 'Failed to reject time edit request');
    }
  };

  useEffect(() => {
    if (mode !== 'full') return;
    fetchAttendance();
  }, [startDate, endDate, mode]);

  useEffect(() => {
    fetchTimeEditRequests();
    if (mode !== 'full') return;
    fetchToday();
    fetchLeaveRequests();
  }, [mode]);

  useEffect(() => {
    if (mode !== 'full') return;
    if (selectedUserId || !isAdmin) {
      fetchCalendar();
    }
  }, [calendarMonth, isAdmin, mode, selectedUserId]);

  useEffect(() => {
    if (mode !== 'full' || isAdmin || !user?.id) return;

    let active = true;

    const fetchEmployeePanel = async () => {
      setIsEmployeePanelLoading(true);
      try {
        const requests: Promise<any>[] = [
          userApi.getProfile360(user.id, { start_date: startDate, end_date: endDate }),
          reportGroupApi.list(),
        ];

        if (organization?.id) {
          requests.push(organizationApi.getMembers(organization.id));
        }

        const [profileResponse, groupsResponse, membersResponse] = await Promise.all(requests);

        if (!active) return;

        setEmployeeProfile(profileResponse.data || null);
        setEmployeeGroups(
          ((groupsResponse.data?.data || []) as any[])
            .filter((group) => (group.users || []).some((member: any) => member.id === user.id))
            .map((group) => ({ id: group.id, name: group.name }))
        );
        setOrganizationMembersCount(Array.isArray((membersResponse as any)?.data) ? (membersResponse as any).data.length : 0);
      } catch (fetchError) {
        console.error('Employee attendance panel fetch failed:', fetchError);
        if (active) {
          setEmployeeProfile(null);
          setEmployeeGroups([]);
          setOrganizationMembersCount(0);
        }
      } finally {
        if (active) {
          setIsEmployeePanelLoading(false);
        }
      }
    };

    void fetchEmployeePanel();

    return () => {
      active = false;
    };
  }, [endDate, isAdmin, mode, organization?.id, startDate, user?.id]);

  useEffect(() => {
    if (mode !== 'full') return;

    const monitoringUserId = isAdmin ? selectedUserId : user?.id;
    if (!monitoringUserId) return;

    let active = true;

    const fetchMonitoringPanel = async () => {
      try {
        const [insightsResponse, screenshotsResponse, websiteResponse] = await Promise.all([
          reportApi.employeeInsights({ start_date: startDate, end_date: endDate, user_id: monitoringUserId }),
          screenshotApi.getAll({ user_id: monitoringUserId, page: 1 }),
          activityApi.getAll({ user_id: monitoringUserId, type: 'url', start_date: startDate, end_date: endDate, page: 1 }),
        ]);

        if (!active) return;

        const websiteRows = ((websiteResponse.data as any)?.data || []).reduce((rows: any[], item: any) => {
          const website = normalizeToolLabel(item.name || '', item.type || 'url');
          const classification = classifyProductivity(website, item.type || 'url');
          const existing = rows.find((row) => row.website === website && row.classification === classification);

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
            website,
            classification,
            duration: Number(item.duration || 0),
            events: 1,
            lastUsedAt: item.recorded_at || null,
          });
          return rows;
        }, []).sort((a: any, b: any) => Number(b.duration || 0) - Number(a.duration || 0));

        setEmployeeMonitoring((insightsResponse.data as any) || null);
        setEmployeeMonitoringScreenshots(((screenshotsResponse.data as any)?.data || []).slice(0, 8));
        setEmployeeWebsiteUsage(websiteRows);
      } catch (monitoringError) {
        console.error('Attendance monitoring panel fetch failed:', monitoringError);
        if (active) {
          setEmployeeMonitoring(null);
          setEmployeeMonitoringScreenshots([]);
          setEmployeeWebsiteUsage([]);
        }
      }
    };

    void fetchMonitoringPanel();

    return () => {
      active = false;
    };
  }, [endDate, isAdmin, mode, selectedUserId, startDate, user?.id]);

  const selectedRow = rows.find((row) => row.user.id === selectedUserId) || rows[0];
  const employeePanelUser = employeeProfile?.user || user;
  const attendancePanelUser = isAdmin ? selectedRow?.user : employeePanelUser;
  const pendingLeaveRequests = useMemo(
    () => leaveRequests.filter((item) => item.status === 'pending'),
    [leaveRequests]
  );
  const pendingTimeEditRequests = useMemo(
    () => timeEditRequests.filter((item) => item.status === 'pending'),
    [timeEditRequests]
  );

  const lateLabel = useMemo(() => {
    if (!todayRecord?.check_in_at) return null;
    const checkIn = new Date(todayRecord.check_in_at);
    const mins = checkIn.getHours() * 60 + checkIn.getMinutes();
    const lateMins = Math.max(0, mins - parseTimeToMinutes(lateAfter));
    if (lateMins <= 0) return null;
    return `${lateMins} min late`;
  }, [todayRecord?.check_in_at, lateAfter]);

  const monthGrid = useMemo(() => buildMonthGrid(calendarMonth), [calendarMonth]);
  const todayDate = useMemo(() => formatLocalDate(new Date()), []);
  const canRequestRevoke = (item: any) => {
    if (!item || item.status !== 'approved' || item.revoke_status) return false;
    const [y, m, d] = String(item.start_date || '').split('-').map((v: string) => Number(v));
    if (!y || !m || !d) return false;
    const deadline = new Date(y, m - 1, d - 1);
    return todayDate <= formatLocalDate(deadline);
  };
  const calendarMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const d of calendarDays) map.set(d.date, d);
    return map;
  }, [calendarDays]);
  const employeeSummaryStats = useMemo(
    () => [
      {
        label: 'Workspace Users',
        value: String(organizationMembersCount || 0),
        hint: 'People in your organization',
        icon: Users,
      },
      {
        label: 'Groups',
        value: String(employeeGroups.length),
        hint: employeeGroups.length ? employeeGroups.map((group) => group.name).join(', ') : 'No group assigned yet',
        icon: Layers3,
      },
      {
        label: 'Current Project',
        value: employeeProfile?.status.current_project || 'No active project',
        hint: employeeProfile?.status.is_working ? 'You are currently working' : 'No active timer right now',
        icon: Briefcase,
      },
      {
        label: 'Recent Projects',
        value: String(new Set((employeeProfile?.recent_time_entries || []).map((entry) => entry.project?.id).filter(Boolean)).size),
        hint:
          (employeeProfile?.recent_time_entries || [])
            .map((entry) => entry.project?.name)
            .filter(Boolean)
            .filter((value, index, list) => list.indexOf(value) === index)
            .slice(0, 3)
            .join(', ') || 'Projects will appear here after time is tracked',
        icon: FolderKanban,
      },
    ],
    [employeeGroups, employeeProfile, organizationMembersCount]
  );
  const employeeLiveMonitoring = employeeMonitoring?.live_monitoring?.selected_user || null;

  if (mode === 'time-edit') {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader eyebrow="Attendance adjustments" title="Edit Time" description="Request overtime or attendance time adjustments and review approval status." />
        {message ? <FeedbackBanner tone="success" message={message} /> : null}
        {error ? <FeedbackBanner tone="error" message={error} /> : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SurfaceCard className="p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Request Time Edit / Overtime</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FieldLabel>Attendance Date</FieldLabel>
                <TextInput type="date" value={timeEditDate} onChange={(e) => setTimeEditDate(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Extra Minutes</FieldLabel>
                <TextInput
                  type="number"
                  min={1}
                  max={600}
                  value={extraMinutes}
                  onChange={(e) => setExtraMinutes(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="mt-3">
              <FieldLabel>Message to Admin</FieldLabel>
              <TextareaInput
                value={timeEditMessage}
                onChange={(e) => setTimeEditMessage(e.target.value)}
                rows={3}
                placeholder="Example: I worked 1 hour extra after shift due to release deployment."
              />
            </div>
            <div className="mt-3">
              <Button onClick={submitTimeEditRequest} disabled={isTimeEditSubmitting}>
                {isTimeEditSubmitting ? 'Submitting...' : 'Submit Time Edit Request'}
              </Button>
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Time Edit Requests</h2>
              <Button onClick={fetchTimeEditRequests} variant="ghost" size="sm">Refresh</Button>
            </div>
            {isTimeEditLoading ? (
              <PageLoadingState label="Loading requests..." />
            ) : timeEditRequests.length === 0 ? (
              <PageEmptyState title="No time edit requests found" description="Submitted overtime and time adjustments will appear here." />
            ) : (
              <div className="mt-3 space-y-2 max-h-72 overflow-auto">
                {timeEditRequests.map((item) => (
                  <div key={item.id} className="rounded-[22px] border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {item.user?.name || 'You'}: {item.attendance_date} (+{formatDuration(item.extra_seconds)})
                      </p>
                      <StatusBadge tone={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'}>{item.status}</StatusBadge>
                    </div>
                    {item.message ? <p className="text-xs text-gray-600 mt-1">{item.message}</p> : null}
                    {isAdmin && item.status === 'pending' ? (
                      <div className="mt-2 flex gap-2">
                        <Button onClick={() => approveTimeEdit(item.id)} size="sm" className="bg-emerald-600 shadow-[0_18px_40px_-24px_rgba(5,150,105,0.6)] hover:bg-emerald-700">Approve</Button>
                        <Button onClick={() => rejectTimeEdit(item.id)} variant="danger" size="sm">Reject</Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {isAdmin && pendingTimeEditRequests.length > 0 ? (
              <p className="text-xs text-gray-500 mt-2">Pending approvals: {pendingTimeEditRequests.length}</p>
            ) : null}
          </SurfaceCard>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader eyebrow="Attendance operations" title="Attendance" description={isAdmin ? 'Track attendance, punches, leave, and overtime requests across the team.' : 'Review your attendance, punches, leave requests, and overtime history.'} />
      {message ? <FeedbackBanner tone="success" message={message} /> : null}
      {error ? <FeedbackBanner tone="error" message={error} /> : null}

      <FilterPanel className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <FieldLabel>Start Date</FieldLabel>
          <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <FieldLabel>End Date</FieldLabel>
          <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {isAdmin && (
          <div>
            <FieldLabel>Employee Name/Email</FieldLabel>
            <TextInput
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search employee..."
            />
          </div>
        )}
        <div className="flex items-end">
          <Button onClick={fetchAttendance} className="w-full">Apply</Button>
        </div>
      </FilterPanel>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <MetricCard label="Working Days" value={workingDays} hint="Excluding weekends" icon={CalendarDays} accent="sky" />
        <MetricCard label="Weekend Days" value={weekendDays} hint="Within selected range" icon={Clock} accent="amber" />
        <MetricCard label="Employees in View" value={rows.length} hint={isAdmin ? 'Based on current filter' : 'Your own attendance view'} icon={Users} accent="emerald" />

        {!isAdmin ? (
          <SurfaceCard className="lg:col-span-3 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">Attendance Workspace</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">
                  {employeePanelUser?.name || 'Your profile'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {employeePanelUser?.email || 'No email available'}
                  {employeePanelUser?.role ? <span className="ml-2 capitalize">• {employeePanelUser.role}</span> : null}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {organization?.name || 'Organization workspace'}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                {isEmployeePanelLoading ? (
                  <p>Loading workspace details...</p>
                ) : (
                  <>
                    <p>
                      Working now: <span className="font-semibold text-slate-950">{employeeProfile?.status.is_working ? 'Yes' : 'No'}</span>
                    </p>
                    <p className="mt-1">
                      Last seen:{' '}
                      <span className="font-semibold text-slate-950">
                        {employeeProfile?.status.last_seen_at ? new Date(employeeProfile.status.last_seen_at).toLocaleString() : 'Unavailable'}
                      </span>
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {employeeSummaryStats.map((item) => (
                <div key={item.label} className="rounded-[24px] border border-slate-200 bg-white/85 p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.25)]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <item.icon className="h-4 w-4 text-sky-700" />
                  </div>
                  <p className="mt-3 text-lg font-semibold text-slate-950">{item.value}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>
        ) : null}

        <SurfaceCard className="lg:col-span-3 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">Monitoring Panel</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">
                {attendancePanelUser?.name || employeePanelUser?.name || 'Employee monitoring'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">Live activity, screenshot previews, and website productivity directly inside attendance.</p>
            </div>
            <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${productivityTone(employeeLiveMonitoring?.classification)}`}>
              {employeeLiveMonitoring?.classification || 'neutral'}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current tool</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{employeeLiveMonitoring?.current_tool || 'No active tool detected'}</p>
              <p className="mt-1 text-xs capitalize text-slate-500">{employeeLiveMonitoring?.tool_type || employeeLiveMonitoring?.activity_type || 'No tool type'}</p>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Work status</p>
              <p className="mt-2 text-sm font-semibold capitalize text-slate-950">{employeeLiveMonitoring?.work_status?.replace('_', ' ') || 'inactive'}</p>
              <p className="mt-1 text-xs text-slate-500">{employeeLiveMonitoring?.is_working ? 'Timer active now' : 'No active timer right now'}</p>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Last activity</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{formatDateTime(employeeLiveMonitoring?.last_activity_at)}</p>
              <p className="mt-1 text-xs text-slate-500">{employeeMonitoring?.stats?.activity_events || 0} activity events in selected range</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[24px] border border-slate-200 bg-white/85 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-950">Screenshot captures</h3>
                <span className="text-xs text-slate-500">{employeeMonitoringScreenshots.length} shown</span>
              </div>
              {employeeMonitoringScreenshots.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No screenshots found for the selected employee in this attendance panel.</p>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {employeeMonitoringScreenshots.map((shot: any) => (
                    <a
                      key={shot.id}
                      href={shot.path}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-[20px] border border-slate-200 bg-white transition hover:border-sky-200"
                    >
                      <img src={shot.path} alt={shot.filename || `Screenshot ${shot.id}`} className="h-32 w-full object-cover" />
                      <div className="space-y-1 p-3">
                        <p className="text-xs font-semibold text-slate-950">{formatDateTime(shot.recorded_at)}</p>
                        <p className="text-[11px] text-slate-500">{shot.filename || 'Captured screenshot'}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white/85 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-950">Website productivity</h3>
                <span className="text-xs text-slate-500">Selected range</span>
              </div>
              {employeeWebsiteUsage.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No website usage found for this employee.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {employeeWebsiteUsage.slice(0, 6).map((item: any) => (
                    <div key={`${item.website}-${item.classification}`} className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-950">{item.website}</p>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${productivityTone(item.classification)}`}>
                          {item.classification}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>{formatDuration(item.duration || 0)}</span>
                        <span>{item.events} events</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">Last used: {formatDateTime(item.lastUsedAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard className="lg:col-span-3 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Today</p>
              <p className="text-xs text-gray-500">
                {todayRecord?.attendance_date || formatLocalDate(new Date())}
                {lateLabel ? <span className="ml-2 text-red-600 font-medium">({lateLabel})</span> : null}
              </p>
              {hasApprovedLeaveToday ? (
                <p className="text-xs text-red-600 mt-1">Approved leave for today. Punch-in is disabled.</p>
              ) : null}
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-lg border border-gray-200 px-3 py-2">
                  <p className="text-[11px] text-gray-500">First Punch In</p>
                  <p className="text-sm font-semibold text-gray-900">{todayRecord?.check_in_at ? new Date(todayRecord.check_in_at).toLocaleTimeString() : '--'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 px-3 py-2">
                  <p className="text-[11px] text-gray-500">Last Punch Out</p>
                  <p className="text-sm font-semibold text-gray-900">{todayRecord?.check_out_at ? new Date(todayRecord.check_out_at).toLocaleTimeString() : '--'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 px-3 py-2">
                  <p className="text-[11px] text-gray-500">Working Hours</p>
                  <p className="text-sm font-semibold text-gray-900">{formatDuration(todayRecord?.worked_seconds || 0)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 px-3 py-2">
                  <p className="text-[11px] text-gray-500">Approved Extra Time</p>
                  <p className="text-sm font-semibold text-gray-900">{formatDuration(todayRecord?.manual_adjustment_seconds || 0)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 px-3 py-2">
                  <p className="text-[11px] text-gray-500">Break Time</p>
                  <p className="text-sm font-semibold text-gray-900">{formatDuration(todayRecord?.total_break_seconds || 0)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 px-3 py-2">
                  <p className="text-[11px] text-gray-500">Remaining Shift</p>
                  <p className="text-sm font-semibold text-gray-900">{formatDuration(todayRecord?.remaining_shift_seconds || 0)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 px-3 py-2">
                  <p className="text-[11px] text-gray-500">Shift Target</p>
                  <p className="text-sm font-semibold text-gray-900">{formatDuration(todayRecord?.shift_target_seconds || 8 * 3600)}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={doCheckIn} disabled={isPunchLoading || !!todayRecord?.is_checked_in || hasApprovedLeaveToday} variant="secondary">
                Punch In
              </Button>
              <Button onClick={doCheckOut} disabled={isPunchLoading || !todayRecord?.is_checked_in}>
                Punch Out
              </Button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Late threshold: {lateAfter}
          </p>
          {todayRecord?.punches?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {todayRecord.punches.map((punch) => (
                <span key={punch.id} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                  {new Date(punch.punch_in_at).toLocaleTimeString()} - {punch.punch_out_at ? new Date(punch.punch_out_at).toLocaleTimeString() : 'Active'}
                </span>
              ))}
            </div>
          ) : null}
        </SurfaceCard>
      </div>

      <SurfaceCard className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Employee</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Present Days</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Leave Days</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Attendance %</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Worked</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-4 py-6" colSpan={6}><PageLoadingState label="Loading attendance records..." /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-6" colSpan={6}><PageEmptyState title="No attendance records" description="Attendance data will appear here for the selected date range." /></td></tr>
            ) : rows.map((row) => (
              <tr
                key={row.user.id}
                className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50/70 ${selectedRow?.user?.id === row.user.id ? 'bg-sky-50/80' : ''}`}
                onClick={() => setSelectedUserId(row.user.id)}
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{row.user.name}</p>
                  <p className="text-xs text-gray-500">{row.user.email}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">{row.days_present} / {row.working_days_in_range}</td>
                <td className="px-4 py-3 text-gray-700">{row.leave_days}</td>
                <td className="px-4 py-3 text-gray-700">{row.attendance_rate}%</td>
                <td className="px-4 py-3 text-gray-700">{formatDuration(row.worked_seconds)}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={row.is_working ? 'success' : 'neutral'}>{row.is_working ? 'Working' : 'Not Working'}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SurfaceCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SurfaceCard className="lg:col-span-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-gray-900">Attendance Calendar</h2>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  const [y, m] = calendarMonth.split('-').map((v) => Number(v));
                  const d = new Date(y, (m || 1) - 2, 1);
                  setCalendarMonth(formatMonth(d));
                }}
                variant="secondary"
                size="sm"
              >
                Prev
              </Button>
              <TextInput
                type="month"
                value={calendarMonth}
                onChange={(e) => setCalendarMonth(e.target.value)}
                className="max-w-[10rem]"
              />
              <Button
                onClick={() => {
                  const [y, m] = calendarMonth.split('-').map((v) => Number(v));
                  const d = new Date(y, (m || 1), 1);
                  setCalendarMonth(formatMonth(d));
                }}
                variant="secondary"
                size="sm"
              >
                Next
              </Button>
            </div>
          </div>

          {isCalendarLoading ? (
            <div className="py-10 text-sm text-gray-500">Loading calendar...</div>
          ) : (
            <div className="mt-3">
              <div className="grid grid-cols-7 text-xs text-gray-500">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div key={d} className="px-2 py-2 font-medium">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {monthGrid.weeks.flat().map((d) => {
                  const ds = formatLocalDate(d);
                  const inMonth = ds.startsWith(calendarMonth);
                  const item = calendarMap.get(ds);
                  const status = item?.status || 'none';
                  const statusLabel =
                    status === 'leave'
                      ? 'take a leave'
                      : status === 'none'
                        ? ''
                        : String(status).replace('_', ' ');

                  const color =
                    status === 'present'
                      ? 'bg-green-50 border-green-200 text-green-900'
                      : status === 'checked_in'
                        ? 'bg-blue-50 border-blue-200 text-blue-900'
                        : status === 'leave'
                          ? 'bg-red-50 border-red-200 text-red-900'
                          : 'bg-gray-50 border-gray-200 text-gray-600';

                  return (
                    <div
                      key={ds}
                      className={`min-h-[68px] rounded-lg border px-2 py-2 ${color} ${inMonth ? '' : 'opacity-40'}`}
                      title={
                        item
                          ? `${item.date} • ${status} • worked ${formatDuration(item.worked_seconds)} • late ${item.late_minutes}m`
                          : ds
                      }
                    >
                      <div className="flex items-start justify-between">
                        <div className="text-xs font-semibold">{d.getDate()}</div>
                        {item?.late_minutes > 0 ? <div className="text-[10px] font-semibold text-red-700">Late</div> : null}
                      </div>
                      {statusLabel ? (
                        <div className="mt-1 text-[10px] uppercase tracking-wide">{statusLabel}</div>
                      ) : null}
                      {item?.worked_seconds ? (
                        <div className="mt-1 text-[11px] font-medium">{formatDuration(item.worked_seconds)}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Monthly Summary</h2>
          {calendarSummary ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Present Days</span>
                <span className="font-semibold text-gray-900">{calendarSummary.present_days}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Absent Days</span>
                <span className="font-semibold text-gray-900">{calendarSummary.absent_days}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Weekend Days</span>
                <span className="font-semibold text-gray-900">{calendarSummary.weekend_days}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Late Days</span>
                <span className="font-semibold text-gray-900">{calendarSummary.late_days}</span>
              </div>
              <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                <span className="text-gray-600">Total Worked</span>
                <span className="font-semibold text-gray-900">{formatDuration(calendarSummary.total_worked_seconds)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No summary available.</p>
          )}
        </SurfaceCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SurfaceCard className="p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Request Leave</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Start Date</FieldLabel>
              <TextInput type="date" value={leaveStartDate} onChange={(e) => setLeaveStartDate(e.target.value)} />
            </div>
            <div>
              <FieldLabel>End Date</FieldLabel>
              <TextInput type="date" value={leaveEndDate} onChange={(e) => setLeaveEndDate(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <FieldLabel>Reason (Optional)</FieldLabel>
            <TextareaInput
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              rows={3}
              placeholder="Leave reason..."
            />
          </div>
          <div className="mt-3">
            <Button onClick={submitLeaveRequest} disabled={isLeaveSubmitting}>
              {isLeaveSubmitting ? 'Submitting...' : 'Submit Leave Request'}
            </Button>
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Leave Requests</h2>
            <Button onClick={fetchLeaveRequests} variant="ghost" size="sm">Refresh</Button>
          </div>
          {isLeaveLoading ? (
            <PageLoadingState label="Loading leave requests..." />
          ) : leaveRequests.length === 0 ? (
            <PageEmptyState title="No leave requests found" description="Submitted leave requests will appear here." />
          ) : (
            <div className="mt-3 space-y-2 max-h-72 overflow-auto">
              {leaveRequests.map((item) => (
                <div key={item.id} className="rounded-[22px] border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {item.user?.name || 'You'}: {item.start_date} to {item.end_date}
                    </p>
                    <StatusBadge tone={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'danger' : item.status === 'revoked' ? 'neutral' : 'warning'}>{item.status}</StatusBadge>
                  </div>
                  {item.reason ? <p className="text-xs text-gray-600 mt-1">{item.reason}</p> : null}
                  {item.revoke_status ? (
                    <p className="text-xs mt-1 text-gray-600">
                      Revoke Request: <span className={`font-medium ${item.revoke_status === 'pending' ? 'text-amber-700' : item.revoke_status === 'approved' ? 'text-green-700' : 'text-red-700'}`}>{item.revoke_status}</span>
                    </p>
                  ) : null}
                  {isAdmin && item.status === 'pending' ? (
                    <div className="mt-2 flex gap-2">
                      <Button onClick={() => approveLeave(item.id)} size="sm" className="bg-emerald-600 shadow-[0_18px_40px_-24px_rgba(5,150,105,0.6)] hover:bg-emerald-700">Approve</Button>
                      <Button onClick={() => rejectLeave(item.id)} variant="danger" size="sm">Reject</Button>
                    </div>
                  ) : null}
                  {!isAdmin && canRequestRevoke(item) ? (
                    <div className="mt-2">
                      <Button onClick={() => requestLeaveRevoke(item.id)} variant="danger" size="sm">Request Revoke</Button>
                    </div>
                  ) : null}
                  {isAdmin && item.status === 'approved' && item.revoke_status === 'pending' ? (
                    <div className="mt-2 flex gap-2">
                      <Button onClick={() => approveLeaveRevoke(item.id)} size="sm" className="bg-emerald-600 shadow-[0_18px_40px_-24px_rgba(5,150,105,0.6)] hover:bg-emerald-700">Approve Revoke</Button>
                      <Button onClick={() => rejectLeaveRevoke(item.id)} variant="danger" size="sm">Reject Revoke</Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {isAdmin && pendingLeaveRequests.length > 0 ? (
            <p className="text-xs text-gray-500 mt-2">Pending approvals: {pendingLeaveRequests.length}</p>
          ) : null}
        </SurfaceCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SurfaceCard className="p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Request Time Edit / Overtime</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Attendance Date</FieldLabel>
              <TextInput type="date" value={timeEditDate} onChange={(e) => setTimeEditDate(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Extra Minutes</FieldLabel>
              <TextInput
                type="number"
                min={1}
                max={600}
                value={extraMinutes}
                onChange={(e) => setExtraMinutes(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="mt-3">
            <FieldLabel>Message to Admin</FieldLabel>
            <TextareaInput
              value={timeEditMessage}
              onChange={(e) => setTimeEditMessage(e.target.value)}
              rows={3}
              placeholder="Example: I worked 1 hour extra after shift due to release deployment."
            />
          </div>
          <div className="mt-3">
            <Button onClick={submitTimeEditRequest} disabled={isTimeEditSubmitting}>
              {isTimeEditSubmitting ? 'Submitting...' : 'Submit Time Edit Request'}
            </Button>
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Time Edit Requests</h2>
            <Button onClick={fetchTimeEditRequests} variant="ghost" size="sm">Refresh</Button>
          </div>
          {isTimeEditLoading ? (
            <PageLoadingState label="Loading time edit requests..." />
          ) : timeEditRequests.length === 0 ? (
            <PageEmptyState title="No time edit requests found" description="Attendance adjustment requests will appear here." />
          ) : (
            <div className="mt-3 space-y-2 max-h-72 overflow-auto">
              {timeEditRequests.map((item) => (
                <div key={item.id} className="rounded-[22px] border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {item.user?.name || 'You'}: {item.attendance_date} (+{formatDuration(item.extra_seconds)})
                    </p>
                    <StatusBadge tone={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'}>{item.status}</StatusBadge>
                  </div>
                  {item.message ? <p className="text-xs text-gray-600 mt-1">{item.message}</p> : null}
                  {isAdmin && item.status === 'pending' ? (
                    <div className="mt-2 flex gap-2">
                      <Button onClick={() => approveTimeEdit(item.id)} size="sm" className="bg-emerald-600 shadow-[0_18px_40px_-24px_rgba(5,150,105,0.6)] hover:bg-emerald-700">Approve</Button>
                      <Button onClick={() => rejectTimeEdit(item.id)} variant="danger" size="sm">Reject</Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {isAdmin && pendingTimeEditRequests.length > 0 ? (
            <p className="text-xs text-gray-500 mt-2">Pending approvals: {pendingTimeEditRequests.length}</p>
          ) : null}
        </SurfaceCard>
      </div>

      {selectedRow && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SurfaceCard className="p-4">
            <h2 className="font-semibold text-gray-900 mb-3">
              {selectedRow.user.name} - Leave Dates (Weekend Excluded)
            </h2>
            <div className="max-h-72 overflow-auto flex flex-wrap gap-2">
              {(selectedRow.leave_dates || []).length === 0 ? (
                <p className="text-sm text-gray-500">No leave dates in selected range.</p>
              ) : (
                selectedRow.leave_dates.map((date: string) => (
                  <span key={date} className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs text-rose-700">
                    {date}
                  </span>
                ))
              )}
            </div>
          </SurfaceCard>
          <SurfaceCard className="p-4">
            <h2 className="font-semibold text-gray-900 mb-3">
              {selectedRow.user.name} - Present Dates
            </h2>
            <div className="max-h-72 overflow-auto flex flex-wrap gap-2">
              {(selectedRow.present_dates || []).length === 0 ? (
                <p className="text-sm text-gray-500">No present dates in selected range.</p>
              ) : (
                selectedRow.present_dates.map((date: string) => (
                  <span key={date} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
                    {date}
                  </span>
                ))
              )}
            </div>
          </SurfaceCard>
        </div>
      )}
    </div>
  );
}
