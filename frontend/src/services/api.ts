import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import type { 
  LoginRequest, 
  RegisterRequest, 
  AuthResponse,
  User,
  Organization,
  Project,
  Task,
  TimeEntry,
  Screenshot,
  Activity,
  Invoice,
  DailyReport,
  WeeklyReport,
  ChatConversation,
  ChatGroup,
  ChatGroupMessage,
  ChatMessage,
  ChatTypingUser,
  ChatUnreadSummary,
  PayrollStructure,
  Payslip,
  PayrollComponent,
  PayrollRecord,
  PayrollTransaction,
} from '@/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('organization');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (data: LoginRequest) => 
    api.post<AuthResponse>('/auth/login', data),
  
  register: (data: RegisterRequest) => 
    api.post<AuthResponse>('/auth/register', data),
  
  logout: () => 
    api.post('/auth/logout'),
  
  me: () => 
    api.get<User>('/auth/me'),
};

// Organization API
export const organizationApi = {
  getAll: () => 
    api.get<Organization[]>('/organizations'),
  
  get: (id: number) => 
    api.get<Organization>(`/organizations/${id}`),
  
  create: (data: Partial<Organization>) => 
    api.post<Organization>('/organizations', data),
  
  update: (id: number, data: Partial<Organization>) => 
    api.put<Organization>(`/organizations/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/organizations/${id}`),
  
  getMembers: (id: number) => 
    api.get<User[]>(`/organizations/${id}/members`),
  
  inviteMember: (id: number, data: { email: string; name: string; role: string }) => 
    api.post(`/organizations/${id}/invite`, data),
};

// User API
export const userApi = {
  getAll: (params?: { 
    role?: string; 
    is_active?: boolean; 
    period?: 'today' | 'week' | 'all';
    country?: string;
    timezone?: string;
    start_date?: string;
    end_date?: string;
  }) => 
    api.get<User[]>('/users', { params }),
  
  get: (id: number) => 
    api.get<User>(`/users/${id}`),
  
  create: (data: Partial<User> & { password?: string }) => 
    api.post<User>('/users', data),
  
  update: (id: number, data: Partial<User>) => 
    api.put<User>(`/users/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/users/${id}`),
  
  getStats: (id: number, params?: { start_date?: string; end_date?: string }) => 
    api.get(`/users/${id}/stats`, { params }),
};

// Project API
export const projectApi = {
  getAll: (params?: { status?: string }) => 
    api.get<Project[]>('/projects', { params }),
  
  get: (id: number) => 
    api.get<Project>(`/projects/${id}`),
  
  create: (data: Partial<Project>) => 
    api.post<Project>('/projects', data),
  
  update: (id: number, data: Partial<Project>) => 
    api.put<Project>(`/projects/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/projects/${id}`),
  
  getTimeEntries: (id: number, params?: { start_date?: string; end_date?: string }) => 
    api.get(`/projects/${id}/time-entries`, { params }),
  
  getTasks: (id: number, params?: { status?: string }) => 
    api.get(`/projects/${id}/tasks`, { params }),
  
  getStats: (id: number, params?: { start_date?: string; end_date?: string }) => 
    api.get(`/projects/${id}/stats`, { params }),
};

// Task API
export const taskApi = {
  getAll: (params?: { project_id?: number; status?: string; assignee_id?: number }) => 
    api.get<Task[]>('/tasks', { params }),
  
  get: (id: number) => 
    api.get<Task>(`/tasks/${id}`),
  
  create: (data: Partial<Task>) => 
    api.post<Task>('/tasks', data),
  
  update: (id: number, data: Partial<Task>) => 
    api.put<Task>(`/tasks/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/tasks/${id}`),
  
  updateStatus: (id: number, status: string) => 
    api.patch<Task>(`/tasks/${id}/status`, { status }),
  
  getTimeEntries: (id: number) => 
    api.get(`/tasks/${id}/time-entries`),
};

// Time Entry API
export const timeEntryApi = {
  getAll: (params?: { 
    user_id?: number; 
    project_id?: number; 
    start_date?: string; 
    end_date?: string;
    page?: number;
  }) => 
    api.get<{ data: TimeEntry[]; current_page: number; last_page: number; total: number }>('/time-entries', { params }),
  
  get: (id: number) => 
    api.get<TimeEntry>(`/time-entries/${id}`),
  
  create: (data: Partial<TimeEntry>) => 
    api.post<TimeEntry>('/time-entries', data),
  
  update: (id: number, data: Partial<TimeEntry>) => 
    api.put<TimeEntry>(`/time-entries/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/time-entries/${id}`),
  
  start: (data?: { project_id?: number; task_id?: number; description?: string; billable?: boolean; timer_slot?: 'primary' | 'secondary' }) => 
    api.post<TimeEntry>('/time-entries/start', data || {}),
  
  stop: (data?: { timer_slot?: 'primary' | 'secondary' }) => 
    api.post<TimeEntry>('/time-entries/stop', data || {}),
  
  active: (params?: { timer_slot?: 'primary' | 'secondary' }) => 
    api.get<TimeEntry>('/time-entries/active', { params }),
  
  today: () => 
    api.get<{ time_entries: TimeEntry[]; total_duration: number }>('/time-entries/today'),
};

// Screenshot API
export const screenshotApi = {
  getAll: (params?: { user_id?: number; time_entry_id?: number; page?: number }) => 
    api.get<{ data: Screenshot[] }>('/screenshots', { params }),
  
  get: (id: number) => 
    api.get<Screenshot>(`/screenshots/${id}`),
  
  upload: (timeEntryId: number, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('time_entry_id', timeEntryId.toString());
    return api.post<Screenshot>('/screenshots', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  delete: (id: number) => 
    api.delete(`/screenshots/${id}`),
};

// Activity API
export const activityApi = {
  getAll: (params?: { user_id?: number; type?: string; start_date?: string; end_date?: string; page?: number }) => 
    api.get<{ data: Activity[] }>('/activities', { params }),
  
  get: (id: number) => 
    api.get<Activity>(`/activities/${id}`),
  
  create: (data: Partial<Activity>) => 
    api.post<Activity>('/activities', data),
  
  delete: (id: number) => 
    api.delete(`/activities/${id}`),
};

// Invoice API
export const invoiceApi = {
  getAll: (params?: { status?: string; page?: number }) => 
    api.get<{ data: Invoice[] }>('/invoices', { params }),
  
  get: (id: number) => 
    api.get<Invoice>(`/invoices/${id}`),
  
  create: (data: Partial<Invoice> & { time_entry_ids?: number[]; items?: any[] }) => 
    api.post<Invoice>('/invoices', data),
  
  update: (id: number, data: Partial<Invoice>) => 
    api.put<Invoice>(`/invoices/${id}`, data),
  
  delete: (id: number) => 
    api.delete(`/invoices/${id}`),
  
  send: (id: number) => 
    api.post<Invoice>(`/invoices/${id}/send`),
  
  markPaid: (id: number) => 
    api.post<Invoice>(`/invoices/${id}/mark-paid`),
};

// Report API
export const reportApi = {
  daily: (params?: { date?: string; scope?: 'self' | 'organization' }) => 
    api.get<DailyReport>('/reports/daily', { params }),
  
  weekly: (params?: { start_date?: string; end_date?: string; scope?: 'self' | 'organization' }) => 
    api.get<WeeklyReport>('/reports/weekly', { params }),
  
  monthly: (params?: { start_date?: string; end_date?: string; scope?: 'self' | 'organization' }) => 
    api.get<WeeklyReport>('/reports/monthly', { params }),
  
  productivity: (params?: { start_date?: string; end_date?: string }) => 
    api.get('/reports/productivity', { params }),
  
  team: (params?: { start_date?: string; end_date?: string }) => 
    api.get('/reports/team', { params }),

  attendance: (params?: { start_date?: string; end_date?: string; user_id?: number; q?: string }) =>
    api.get('/reports/attendance', { params }),

  employeeInsights: (params?: { start_date?: string; end_date?: string; user_id?: number; q?: string }) =>
    api.get('/reports/employee-insights', { params }),

  overall: (params?: { start_date?: string; end_date?: string; user_ids?: number[]; group_ids?: number[] }) =>
    api.get('/reports/overall', { params }),
  
  project: (projectId: number, params?: { start_date?: string; end_date?: string }) => 
    api.get(`/reports/project/${projectId}`, { params }),
  
  export: (params?: { start_date?: string; end_date?: string }) => 
    api.get('/reports/export', { 
      params, 
      responseType: 'blob' as AxiosRequestConfig['responseType'] 
    }),
};

export const dashboardApi = {
  summary: () => api.get('/dashboard'),
};

export const attendanceApi = {
  today: () =>
    api.get<{
      record: {
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
      } | null;
      late_after: string;
      shift_target_seconds: number;
      has_approved_leave_today: boolean;
    }>('/attendance/today'),

  checkIn: () => api.post('/attendance/check-in'),

  checkOut: () => api.post('/attendance/check-out'),

  calendar: (params?: { month?: string; user_id?: number }) =>
    api.get<{
      month: string;
      user_id: number;
      days: Array<{
        date: string;
        status: 'present' | 'checked_in' | 'leave' | 'none';
        is_weekend: boolean;
        is_leave?: boolean;
        check_in_at?: string | null;
        check_out_at?: string | null;
        late_minutes: number;
        worked_seconds: number;
      }>;
      summary: {
        present_days: number;
        absent_days: number;
        weekend_days: number;
        leave_days?: number;
        late_days: number;
        total_worked_seconds: number;
      };
    }>('/attendance/calendar', { params }),

  summary: (params?: { start_date?: string; end_date?: string; q?: string }) =>
    api.get<{
      start_date: string;
      end_date: string;
      data: Array<{
        user: { id: number; name: string; email: string; role: string };
        present_days: number;
        late_days: number;
        total_worked_seconds: number;
        is_checked_in: boolean;
      }>;
    }>('/attendance/summary', { params }),
};

export const leaveApi = {
  list: (params?: { status?: 'pending' | 'approved' | 'rejected' | 'revoked'; user_id?: number }) =>
    api.get<{
      data: Array<{
        id: number;
        user_id: number;
        organization_id: number;
        start_date: string;
        end_date: string;
        reason?: string | null;
        status: 'pending' | 'approved' | 'rejected' | 'revoked';
        revoke_status?: 'pending' | 'approved' | 'rejected' | null;
        revoke_requested_at?: string | null;
        revoke_reviewed_by?: number | null;
        revoke_reviewed_at?: string | null;
        revoke_review_note?: string | null;
        reviewed_by?: number | null;
        reviewed_at?: string | null;
        review_note?: string | null;
        user?: { id: number; name: string; email: string; role: string };
        reviewer?: { id: number; name: string; email: string } | null;
        revoke_reviewer?: { id: number; name: string; email: string } | null;
        created_at: string;
      }>;
    }>('/leave-requests', { params }),

  create: (data: { start_date: string; end_date: string; reason?: string }) =>
    api.post('/leave-requests', data),

  approve: (id: number, review_note?: string) =>
    api.patch(`/leave-requests/${id}/approve`, { review_note }),

  reject: (id: number, review_note?: string) =>
    api.patch(`/leave-requests/${id}/reject`, { review_note }),

  requestRevoke: (id: number) =>
    api.post(`/leave-requests/${id}/revoke-request`),

  approveRevoke: (id: number, review_note?: string) =>
    api.patch(`/leave-requests/${id}/revoke-approve`, { review_note }),

  rejectRevoke: (id: number, review_note?: string) =>
    api.patch(`/leave-requests/${id}/revoke-reject`, { review_note }),
};

export const attendanceTimeEditApi = {
  list: (params?: { status?: 'pending' | 'approved' | 'rejected'; user_id?: number }) =>
    api.get<{
      data: Array<{
        id: number;
        user_id: number;
        organization_id: number;
        attendance_date: string;
        extra_seconds: number;
        message?: string | null;
        status: 'pending' | 'approved' | 'rejected';
        reviewed_by?: number | null;
        reviewed_at?: string | null;
        review_note?: string | null;
        user?: { id: number; name: string; email: string; role: string };
        reviewer?: { id: number; name: string; email: string } | null;
        created_at: string;
      }>;
    }>('/attendance-time-edit-requests', { params }),

  create: (data: { attendance_date: string; extra_minutes: number; message?: string }) =>
    api.post('/attendance-time-edit-requests', data),

  approve: (id: number, review_note?: string) =>
    api.patch(`/attendance-time-edit-requests/${id}/approve`, { review_note }),

  reject: (id: number, review_note?: string) =>
    api.patch(`/attendance-time-edit-requests/${id}/reject`, { review_note }),
};

export const chatApi = {
  getConversations: () => api.get<ChatConversation[]>('/chat/conversations'),
  getGroups: () => api.get<ChatGroup[]>('/chat/groups'),
  getAvailableUsers: () => api.get<Array<{ id: number; name: string; email: string; role: string }>>('/chat/available-users'),
  getUnreadSummary: () => api.get<ChatUnreadSummary>('/chat/unread-summary'),
  startConversation: (email: string) => api.post<ChatConversation>('/chat/conversations', { email }),
  createGroup: (data: { name: string; user_ids: number[] }) => api.post<ChatGroup>('/chat/groups', data),
  getMessages: (conversationId: number, params?: { since_id?: number }) =>
    api.get<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`, { params }),
  getGroupMessages: (groupId: number, params?: { since_id?: number }) =>
    api.get<ChatGroupMessage[]>(`/chat/groups/${groupId}/messages`, { params }),
  sendMessage: (conversationId: number, data: { body?: string; attachment?: File | null }) => {
    if (data.attachment) {
      const formData = new FormData();
      if (data.body?.trim()) {
        formData.append('body', data.body.trim());
      }
      formData.append('attachment', data.attachment);
      return api.post<ChatMessage>(`/chat/conversations/${conversationId}/messages`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }

    return api.post<ChatMessage>(`/chat/conversations/${conversationId}/messages`, { body: data.body || '' });
  },
  sendGroupMessage: (groupId: number, data: { body?: string; attachment?: File | null }) => {
    if (data.attachment) {
      const formData = new FormData();
      if (data.body?.trim()) {
        formData.append('body', data.body.trim());
      }
      formData.append('attachment', data.attachment);
      return api.post<ChatGroupMessage>(`/chat/groups/${groupId}/messages`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }

    return api.post<ChatGroupMessage>(`/chat/groups/${groupId}/messages`, { body: data.body || '' });
  },
  markRead: (conversationId: number) =>
    api.post(`/chat/conversations/${conversationId}/read`),
  markGroupRead: (groupId: number) =>
    api.post(`/chat/groups/${groupId}/read`),
  setTyping: (conversationId: number, isTyping: boolean) =>
    api.post(`/chat/conversations/${conversationId}/typing`, { is_typing: isTyping }),
  setGroupTyping: (groupId: number, isTyping: boolean) =>
    api.post(`/chat/groups/${groupId}/typing`, { is_typing: isTyping }),
  getTyping: (conversationId: number) =>
    api.get<ChatTypingUser[]>(`/chat/conversations/${conversationId}/typing`),
  getGroupTyping: (groupId: number) =>
    api.get<ChatTypingUser[]>(`/chat/groups/${groupId}/typing`),
  getAttachment: (messageId: number) =>
    api.get<Blob>(`/chat/messages/${messageId}/attachment`, {
      responseType: 'blob' as AxiosRequestConfig['responseType'],
    }),
  getGroupAttachment: (messageId: number) =>
    api.get<Blob>(`/chat/groups/messages/${messageId}/attachment`, {
      responseType: 'blob' as AxiosRequestConfig['responseType'],
    }),
};

export const payrollApi = {
  getEmployees: () =>
    api.get<{ data: Array<{ id: number; name: string; email: string; role: string }> }>('/payroll/employees'),

  getRecords: (params?: {
    user_id?: number;
    payroll_month?: string;
    payroll_status?: 'draft' | 'processed' | 'paid';
    payout_status?: 'pending' | 'success' | 'failed';
    payout_method?: 'mock' | 'stripe';
  }) =>
    api.get<{ data: PayrollRecord[]; mode: 'mock' | 'stripe_test' | 'stripe_live' }>('/payroll/records', { params }),

  generateRecords: (data: {
    payroll_month: string;
    user_id?: number;
    allow_overwrite?: boolean;
    payout_method?: 'mock' | 'stripe';
  }) =>
    api.post<{
      message: string;
      generated_count: number;
      skipped_count: number;
      generated: PayrollRecord[];
      skipped: Array<{ employee_id: number; reason: string }>;
    }>('/payroll/records/generate', data),

  getRecord: (id: number) =>
    api.get<PayrollRecord>(`/payroll/records/${id}`),

  updateRecord: (id: number, data: {
    basic_salary?: number;
    allowances?: number;
    deductions?: number;
    bonus?: number;
    tax?: number;
    payroll_status?: 'draft' | 'processed' | 'paid';
    payout_method?: 'mock' | 'stripe';
  }) =>
    api.patch<PayrollRecord>(`/payroll/records/${id}`, data),

  updateRecordStatus: (id: number, payroll_status: 'draft' | 'processed' | 'paid') =>
    api.post<PayrollRecord>(`/payroll/records/${id}/status`, { payroll_status }),

  payoutRecord: (id: number, data?: {
    payout_method?: 'mock' | 'stripe';
    simulate_status?: 'success' | 'failed' | 'pending';
  }) =>
    api.post<{ mode: 'mock' | 'stripe_test' | 'stripe_live'; payroll: PayrollRecord; transaction: PayrollTransaction; checkout_url?: string | null }>(`/payroll/records/${id}/payout`, data || {}),

  getRecordTransactions: (id: number) =>
    api.get<{ data: PayrollTransaction[] }>(`/payroll/records/${id}/transactions`),

  getStructures: (params?: { user_id?: number }) =>
    api.get<{ users: Array<{ id: number; name: string; email: string; role: string }>; structures: PayrollStructure[] }>('/payroll/structures', { params }),

  saveStructure: (data: {
    user_id: number;
    basic_salary: number;
    currency?: 'INR' | 'USD';
    effective_from: string;
    allowances?: PayrollComponent[];
    deductions?: PayrollComponent[];
  }) => api.post<PayrollStructure>('/payroll/structures', data),

  updateStructure: (id: number, data: {
    basic_salary: number;
    currency?: 'INR' | 'USD';
    effective_from: string;
    allowances?: PayrollComponent[];
    deductions?: PayrollComponent[];
  }) => api.put<PayrollStructure>(`/payroll/structures/${id}`, data),

  deleteStructure: (id: number) => api.delete(`/payroll/structures/${id}`),

  getPayslips: (params?: { user_id?: number; period_month?: string }) =>
    api.get<{ data: Payslip[] }>('/payroll/payslips', { params }),

  generatePayslip: (data: { user_id: number; period_month: string; payroll_structure_id?: number }) =>
    api.post<Payslip>('/payroll/payslips/generate', data),

  payNow: (data: { payslip_ids: number[] }) =>
    api.post<{ message: string; paid_count: number }>('/payroll/payslips/pay-now', data),

  downloadPayslipPdf: (id: number) =>
    api.get<Blob>(`/payroll/payslips/${id}/pdf`, {
      responseType: 'blob' as AxiosRequestConfig['responseType'],
    }),
};

export const notificationApi = {
  list: (params?: { limit?: number }) =>
    api.get<{
      data: Array<{
        id: number;
        type: 'announcement' | 'news' | 'salary_credited';
        title: string;
        message: string;
        is_read: boolean;
        created_at: string;
        sender?: { id: number; name: string; email: string } | null;
        meta?: Record<string, any> | null;
      }>;
      unread_count: number;
    }>('/notifications', { params }),

  publish: (data: { type: 'announcement' | 'news'; title: string; message: string; recipient_user_ids?: number[] }) =>
    api.post('/notifications/publish', data),

  markRead: (id: number) =>
    api.post(`/notifications/${id}/read`),

  markAllRead: () =>
    api.post('/notifications/read-all'),
};

export const reportGroupApi = {
  list: () =>
    api.get<{
      data: Array<{
        id: number;
        organization_id: number;
        name: string;
        users: Array<{ id: number; name: string; email: string; role: string }>;
      }>;
    }>('/report-groups'),

  create: (data: { name: string; user_ids?: number[] }) =>
    api.post('/report-groups', data),

  update: (id: number, data: { name?: string; user_ids?: number[] }) =>
    api.put(`/report-groups/${id}`, data),

  delete: (id: number) =>
    api.delete(`/report-groups/${id}`),
};

export const settingsApi = {
  me: () =>
    api.get<{
      user: User;
      organization: Organization | null;
      can_manage_org: boolean;
    }>('/settings/me'),

  updateProfile: (data: { name: string; email: string; avatar?: string | null }) =>
    api.put<{ message: string; user: User }>('/settings/profile', data),

  updatePassword: (data: { current_password: string; new_password: string; new_password_confirmation: string }) =>
    api.put<{ message: string }>('/settings/password', data),

  updatePreferences: (data: {
    timezone?: string;
    notifications?: {
      email?: boolean;
      weekly_summary?: boolean;
      project_updates?: boolean;
      task_assignments?: boolean;
    };
  }) => api.put<{ message: string; settings: Record<string, any> }>('/settings/preferences', data),

  updateOrganization: (data: { name: string; slug: string }) =>
    api.put<{ message: string; organization: Organization }>('/settings/organization', data),

  billing: () =>
    api.get<{ plan: { name: string; status: string; renewal_date?: string | null } | null }>('/settings/billing'),
};

export default api;
